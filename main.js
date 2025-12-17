// main.js
import { OrbitCamera } from "./camera.js";
import { createPlane, createGrid } from "./scene.js";

function $(id) {
  return document.getElementById(id);
}

const canvas = $("glCanvas");
const gl = canvas.getContext("webgl");
const invertYCheckbox = $("invertY");
const addSphereBtn = $("addSphereBtn");
const addBoxBtn = $("addBoxBtn");
const addCylBtn = $("addCylBtn");
const modeUnionBtn = $("modeUnionBtn");
const modeSubtractBtn = $("modeSubtractBtn");
const modeIntersectBtn = $("modeIntersectBtn");

if (!gl) {
  alert("WebGL not supported");
}

// depth-writing extension for SDF
const extFragDepth = gl.getExtension("EXT_frag_depth");
if (!extFragDepth) {
  console.warn("EXT_frag_depth not supported; SDF depth may fail.");
}

// ---- primitive / mode constants ----
const PRIM_SPHERE = 0;
const PRIM_BOX = 1;
const PRIM_CYL = 2;

const MODE_UNION = "union";
const MODE_SUBTRACT = "subtract";
const MODE_INTERSECT = "intersect"; // currently behaves like union

const MAX_OBJECTS = 32;
const MAX_SUB_RECORDS = 128;

const SPHERE_RADIUS = 1.0;
const GIZMO_LENGTH = 1.5;

let currentMode = MODE_UNION;

// ---------- Resize ----------
function resizeCanvas() {
  const displayWidth = canvas.clientWidth;
  const displayHeight = canvas.clientHeight;
  if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
    canvas.width = displayWidth;
    canvas.height = displayHeight;
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  }
}

// ---------- Shader helpers ----------
function compileShader(source, type) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("Shader compile error:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(vsSrc, fsSrc) {
  const vs = compileShader(vsSrc, gl.VERTEX_SHADER);
  const fs = compileShader(fsSrc, gl.FRAGMENT_SHADER);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error("Program link error:", gl.getProgramInfoLog(prog));
    return null;
  }
  return prog;
}

// ---------- Mesh program (plane + grid + gizmo) ----------
const meshVsSource = `
  attribute vec3 a_position;
  attribute vec3 a_color;

  uniform mat4 u_view;
  uniform mat4 u_proj;
  uniform mat4 u_model;

  varying vec3 v_color;

  void main() {
    gl_Position = u_proj * u_view * u_model * vec4(a_position, 1.0);
    v_color = a_color;
  }
`;

const meshFsSource = `
  precision mediump float;
  varying vec3 v_color;
  void main() {
    gl_FragColor = vec4(v_color, 1.0);
  }
`;

const meshProgram = createProgram(meshVsSource, meshFsSource);
const meshAttribPos = gl.getAttribLocation(meshProgram, "a_position");
const meshAttribCol = gl.getAttribLocation(meshProgram, "a_color");
const meshUniView = gl.getUniformLocation(meshProgram, "u_view");
const meshUniProj = gl.getUniformLocation(meshProgram, "u_proj");
const meshUniModel = gl.getUniformLocation(meshProgram, "u_model");

const MESH_STRIDE = 6 * 4;

function bindMeshBuffer(buffer) {
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.enableVertexAttribArray(meshAttribPos);
  gl.vertexAttribPointer(meshAttribPos, 3, gl.FLOAT, false, MESH_STRIDE, 0);
  gl.enableVertexAttribArray(meshAttribCol);
  gl.vertexAttribPointer(meshAttribCol, 3, gl.FLOAT, false, MESH_STRIDE, 3 * 4);
}

// ---------- SDF program (objects + baked subtractors + preview) ----------
const sdfVsSource = `
  attribute vec2 a_position;
  varying vec2 v_uv;
  void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const sdfFsSource = `
  #extension GL_EXT_frag_depth : enable
  precision mediump float;
  varying vec2 v_uv;

  uniform mat4 u_invPV;
  uniform mat4 u_pv;

  const int MAX_OBJECTS = ${MAX_OBJECTS};
  const int MAX_SUB_RECORDS = ${MAX_SUB_RECORDS};

  uniform int u_numObjects;
  uniform int u_numSubRecords;

  uniform int  u_objType[MAX_OBJECTS];
  uniform vec3 u_objPos[MAX_OBJECTS];
  uniform vec3 u_objParam[MAX_OBJECTS];

  uniform int  u_subType[MAX_SUB_RECORDS];
  uniform vec3 u_subPos[MAX_SUB_RECORDS];
  uniform vec3 u_subParam[MAX_SUB_RECORDS];
  uniform int  u_subTargetObj[MAX_SUB_RECORDS];

  uniform int u_selectedObjectIndex;

  // preview subtractor (for placement)
  uniform int  u_previewActive;          // 0 or 1
  uniform int  u_previewType;
  uniform vec3 u_previewPos;
  uniform vec3 u_previewParam;
  uniform int  u_previewTargetCount;
  uniform int  u_previewTargets[MAX_OBJECTS];

  const int PRIM_SPHERE = 0;
  const int PRIM_BOX    = 1;
  const int PRIM_CYL    = 2;

  float sdSphere(vec3 p, vec3 c, float r) {
    return length(p - c) - r;
  }

  float sdBox(vec3 p, vec3 c, vec3 b) {
    vec3 d = abs(p - c) - b;
    return length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0);
  }

  float sdCappedCylinderY(vec3 p, vec3 c, float r, float h) {
    vec3 q = p - c;
    vec2 d = vec2(length(q.xz) - r, abs(q.y) - h);
    return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
  }

  float sdfPrimitive(vec3 p, int t, vec3 c, vec3 param) {
    if (t == PRIM_SPHERE) {
      return sdSphere(p, c, param.x);
    } else if (t == PRIM_BOX) {
      return sdBox(p, c, param);
    } else if (t == PRIM_CYL) {
      return sdCappedCylinderY(p, c, param.x, param.y);
    }
    return 1e9;
  }

  bool previewTargetsObject(int objIndex) {
    if (u_previewActive == 0) return false;
    for (int k = 0; k < MAX_OBJECTS; ++k) {
      if (k >= u_previewTargetCount) break;
      if (u_previewTargets[k] == objIndex) return true;
    }
    return false;
  }

  float mapSceneOnly(vec3 p) {
    if (u_numObjects <= 0) {
      return 1e9;
    }

    float dScene = 1e9;

    // loop over objects
    for (int i = 0; i < MAX_OBJECTS; ++i) {
      if (i >= u_numObjects) break;

      int  t0     = u_objType[i];
      vec3 c0     = u_objPos[i];
      vec3 param0 = u_objParam[i];
      float dObj  = sdfPrimitive(p, t0, c0, param0);

      // baked subtractors for this object
      for (int j = 0; j < MAX_SUB_RECORDS; ++j) {
        if (j >= u_numSubRecords) break;
        if (u_subTargetObj[j] != i) continue;

        int  ts     = u_subType[j];
        vec3 cs     = u_subPos[j];
        vec3 params = u_subParam[j];
        float dSub  = sdfPrimitive(p, ts, cs, params);

        dObj = max(dObj, -dSub);
      }

      // preview subtractor (world-space) for this object
      if (previewTargetsObject(i)) {
        float dPrev = sdfPrimitive(p, u_previewType, u_previewPos, u_previewParam);
        dObj = max(dObj, -dPrev);
      }

      dScene = min(dScene, dObj);
    }

    return dScene;
  }

  int findClosestObject(vec3 p) {
    float best = 1e9;
    int id = -1;

    for (int i = 0; i < MAX_OBJECTS; ++i) {
      if (i >= u_numObjects) break;

      int  t0     = u_objType[i];
      vec3 c0     = u_objPos[i];
      vec3 param0 = u_objParam[i];
      float dObj  = sdfPrimitive(p, t0, c0, param0);

      for (int j = 0; j < MAX_SUB_RECORDS; ++j) {
        if (j >= u_numSubRecords) break;
        if (u_subTargetObj[j] != i) continue;

        int  ts     = u_subType[j];
        vec3 cs     = u_subPos[j];
        vec3 params = u_subParam[j];
        float dSub  = sdfPrimitive(p, ts, cs, params);

        dObj = max(dObj, -dSub);
      }

      if (previewTargetsObject(i)) {
        float dPrev = sdfPrimitive(p, u_previewType, u_previewPos, u_previewParam);
        dObj = max(dObj, -dPrev);
      }

      float ad = abs(dObj);
      if (ad < best) {
        best = ad;
        id = i;
      }
    }

    return id;
  }

  vec3 estimateNormal(vec3 p) {
    float eps = 0.002;
    vec2 e = vec2(1.0, -1.0) * eps;
    vec3 n = vec3(
      mapSceneOnly(p + vec3(e.x, e.y, e.y)) - mapSceneOnly(p + vec3(e.y, e.y, e.x)),
      mapSceneOnly(p + vec3(e.y, e.x, e.y)) - mapSceneOnly(p + vec3(e.x, e.x, e.x)),
      mapSceneOnly(p + vec3(e.y, e.y, e.x)) - mapSceneOnly(p + vec3(e.x, e.y, e.y))
    );
    return normalize(n);
  }

  void main() {
    if (u_numObjects <= 0) {
      discard;
    }

    // reconstruct ray
    vec2 ndc = vec2(v_uv.x * 2.0 - 1.0, v_uv.y * 2.0 - 1.0);

    vec4 pNear = u_invPV * vec4(ndc, -1.0, 1.0);
    vec4 pFar  = u_invPV * vec4(ndc,  1.0, 1.0);
    pNear /= pNear.w;
    pFar  /= pFar.w;

    vec3 ro = pNear.xyz;
    vec3 rd = normalize(pFar.xyz - pNear.xyz);

    float t = 0.0;
    float maxDist = 40.0;
    float eps = 0.0015;
    bool hit = false;
    vec3 p;

    for (int i = 0; i < 64; ++i) {
      p = ro + rd * t;
      float d = mapSceneOnly(p);
      if (d < eps) {
        hit = true;
        break;
      }
      t += d;
      if (t > maxDist) break;
    }

    if (!hit) {
      discard;
    }

    vec3 n = estimateNormal(p);
    vec3 lightDir = normalize(vec3(0.4, 0.8, 0.2));
    float diff = max(dot(n, lightDir), 0.0);

    vec3 baseColor = vec3(0.4, 0.7, 0.95);

    int objId = findClosestObject(p);
    bool isSelected = (u_selectedObjectIndex >= 0 && objId == u_selectedObjectIndex);

    vec3 color = baseColor * (0.2 + 0.8 * diff);
    if (isSelected) {
      color = mix(color, vec3(1.0, 0.95, 0.6), 0.6);
    }

    // preview overlay (transparent-ish red)
    if (u_previewActive != 0) {
      // is this object targeted by the preview subtractor?
      bool isTarget = false;
      for (int k = 0; k < MAX_OBJECTS; ++k) {
        if (k >= u_previewTargetCount) break;
        if (u_previewTargets[k] == objId) {
          isTarget = true;
          break;
        }
      }
      if (isTarget) {
        float dPrev = sdfPrimitive(p, u_previewType, u_previewPos, u_previewParam);
        if (dPrev < 0.0) {
          color = mix(color, vec3(1.0, 0.2, 0.2), 0.5);
        }
      }
    }

    // depth
    vec4 clip = u_pv * vec4(p, 1.0);
    clip /= clip.w;
    float depth = clip.z * 0.5 + 0.5;

    gl_FragDepthEXT = depth;
    gl_FragColor = vec4(color, 1.0);
  }
`;

const sdfProgram = createProgram(sdfVsSource, sdfFsSource);
const sdfAttribPos = gl.getAttribLocation(sdfProgram, "a_position");
const sdfUniInvPV = gl.getUniformLocation(sdfProgram, "u_invPV");
const sdfUniPV = gl.getUniformLocation(sdfProgram, "u_pv");
const sdfUniNumObjects = gl.getUniformLocation(sdfProgram, "u_numObjects");
const sdfUniNumSubRecords = gl.getUniformLocation(sdfProgram, "u_numSubRecords");
const sdfUniObjType = gl.getUniformLocation(sdfProgram, "u_objType");
const sdfUniObjPos = gl.getUniformLocation(sdfProgram, "u_objPos");
const sdfUniObjParam = gl.getUniformLocation(sdfProgram, "u_objParam");
const sdfUniSubType = gl.getUniformLocation(sdfProgram, "u_subType");
const sdfUniSubPos = gl.getUniformLocation(sdfProgram, "u_subPos");
const sdfUniSubParam = gl.getUniformLocation(sdfProgram, "u_subParam");
const sdfUniSubTargetObj = gl.getUniformLocation(sdfProgram, "u_subTargetObj");
const sdfUniSelectedObjectIndex = gl.getUniformLocation(sdfProgram, "u_selectedObjectIndex");

// preview uniforms
const sdfUniPreviewActive = gl.getUniformLocation(sdfProgram, "u_previewActive");
const sdfUniPreviewType = gl.getUniformLocation(sdfProgram, "u_previewType");
const sdfUniPreviewPos = gl.getUniformLocation(sdfProgram, "u_previewPos");
const sdfUniPreviewParam = gl.getUniformLocation(sdfProgram, "u_previewParam");
const sdfUniPreviewTargetCount = gl.getUniformLocation(sdfProgram, "u_previewTargetCount");
const sdfUniPreviewTargets = gl.getUniformLocation(sdfProgram, "u_previewTargets");

// Fullscreen quad
const quadVerts = new Float32Array([
  -1, -1,
   1, -1,
  -1,  1,
  -1,  1,
   1, -1,
   1,  1,
]);
const quadVBO = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, quadVBO);
gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);

// ---------- Scene geometry ----------
const plane = createPlane(gl);
const grid = createGrid(gl);

// ---------- Gizmo geometry ----------
const gizmoVerts = new Float32Array([
  // X axis (red)
  0, 0, 0,  1, 0, 0,
  GIZMO_LENGTH, 0, 0,  1, 0, 0,
  // Y axis (green)
  0, 0, 0,  0, 1, 0,
  0, GIZMO_LENGTH, 0,  0, 1, 0,
  // Z axis (blue)
  0, 0, 0,  0, 0, 1,
  0, 0, GIZMO_LENGTH,  0, 0, 1,
]);
const gizmoBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, gizmoBuffer);
gl.bufferData(gl.ARRAY_BUFFER, gizmoVerts, gl.STATIC_DRAW);
const gizmoCount = 6;

// ---------- Data model ----------
// Base objects (visible solids)
const objects = []; // { kind, position: vec3, param: vec3 }

// Baked subtractors: attached to objects with local offsets
// Each: { kind, localOffset: vec3, param: vec3, targetIndex: number }
const bakedSubs = [];

// Preview subtractor while placing (world-space)
// { kind, position: vec3, param: vec3, targets: number[] }
let placingSubtractor = null;

// New base object being placed (union/intersect)
let placingBase = null;

// selection & dragging
let selectedObjectIndex = -1;
let draggingObject = null;

// gizmo drag
let activeAxis = null;      // 'x' | 'y' | 'z' | null
let axisDragState = null;

// matrices
const currentProj = mat4.create();
const currentView = mat4.create();

// initial base object
objects.push({
  kind: PRIM_SPHERE,
  position: vec3.fromValues(0, SPHERE_RADIUS, 0),
  param: vec3.fromValues(SPHERE_RADIUS, 0, 0),
});

// ---------- Mode button UI ----------
function updateModeButtons() {
  const mapping = [
    { btn: modeUnionBtn, mode: MODE_UNION },
    { btn: modeSubtractBtn, mode: MODE_SUBTRACT },
    { btn: modeIntersectBtn, mode: MODE_INTERSECT },
  ];
  mapping.forEach(({ btn, mode }) => {
    if (!btn) return;
    if (mode === currentMode) {
      btn.style.backgroundColor = "#3b82f6";
      btn.style.color = "white";
    } else {
      btn.style.backgroundColor = "";
      btn.style.color = "";
    }
  });
}
updateModeButtons();

modeUnionBtn?.addEventListener("click", () => {
  currentMode = MODE_UNION;
  updateModeButtons();
});

modeSubtractBtn?.addEventListener("click", () => {
  currentMode = MODE_SUBTRACT;
  updateModeButtons();
});

modeIntersectBtn?.addEventListener("click", () => {
  // for now, intersect behaves like union: creates another solid
  currentMode = MODE_INTERSECT;
  updateModeButtons();
});

// ---------- CPU SDF (for overlap tests) ----------
function sdfPrimitiveJS(p, prim) {
  const kind = prim.kind;
  const c = prim.position;
  const param = prim.param;

  if (kind === PRIM_SPHERE) {
    const dx = p[0] - c[0];
    const dy = p[1] - c[1];
    const dz = p[2] - c[2];
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return len - param[0];
  } else if (kind === PRIM_BOX) {
    const qx = Math.abs(p[0] - c[0]) - param[0];
    const qy = Math.abs(p[1] - c[1]) - param[1];
    const qz = Math.abs(p[2] - c[2]) - param[2];
    const ax = Math.max(qx, 0);
    const ay = Math.max(qy, 0);
    const az = Math.max(qz, 0);
    const outside = Math.sqrt(ax * ax + ay * ay + az * az);
    const inside = Math.min(Math.max(qx, Math.max(qy, qz)), 0);
    return outside + inside;
  } else if (kind === PRIM_CYL) {
    const dx = p[0] - c[0];
    const dz = p[2] - c[2];
    const r = param[0];
    const h = param[1];
    const radial = Math.sqrt(dx * dx + dz * dz) - r;
    const y = Math.abs(p[1] - c[1]) - h;
    const ax = Math.max(radial, 0);
    const ay = Math.max(y, 0);
    const outside = Math.sqrt(ax * ax + ay * ay);
    const inside = Math.min(Math.max(radial, y), 0);
    return outside + inside;
  }

  return 1e9;
}

function subtractorOverlapsObject(sub, obj) {
  const samples = [];

  // center
  samples.push(vec3.clone(sub.position));

  if (sub.kind === PRIM_SPHERE) {
    const r = sub.param[0];
    samples.push(vec3.fromValues(sub.position[0] + r * 0.5, sub.position[1], sub.position[2]));
    samples.push(vec3.fromValues(sub.position[0] - r * 0.5, sub.position[1], sub.position[2]));
    samples.push(vec3.fromValues(sub.position[0], sub.position[1] + r * 0.5, sub.position[2]));
    samples.push(vec3.fromValues(sub.position[0], sub.position[1] - r * 0.5, sub.position[2]));
  } else if (sub.kind === PRIM_BOX) {
    const hx = sub.param[0];
    const hy = sub.param[1];
    const hz = sub.param[2];
    samples.push(vec3.fromValues(sub.position[0] + hx * 0.5, sub.position[1], sub.position[2]));
    samples.push(vec3.fromValues(sub.position[0] - hx * 0.5, sub.position[1], sub.position[2]));
    samples.push(vec3.fromValues(sub.position[0], sub.position[1] + hy * 0.5, sub.position[2]));
    samples.push(vec3.fromValues(sub.position[0], sub.position[1] - hy * 0.5, sub.position[2]));
    samples.push(vec3.fromValues(sub.position[0], sub.position[1], sub.position[2] + hz * 0.5));
    samples.push(vec3.fromValues(sub.position[0], sub.position[1], sub.position[2] - hz * 0.5));
  } else if (sub.kind === PRIM_CYL) {
    const r = sub.param[0];
    const h = sub.param[1];
    samples.push(vec3.fromValues(sub.position[0] + r * 0.5, sub.position[1], sub.position[2]));
    samples.push(vec3.fromValues(sub.position[0] - r * 0.5, sub.position[1], sub.position[2]));
    samples.push(vec3.fromValues(sub.position[0], sub.position[1] + h * 0.5, sub.position[2]));
    samples.push(vec3.fromValues(sub.position[0], sub.position[1] - h * 0.5, sub.position[2]));
  }

  for (const p of samples) {
    const dSub = sdfPrimitiveJS(p, sub);
    const dObj = sdfPrimitiveJS(p, obj);
    if (dSub <= 0 && dObj <= 0) {
      return true;
    }
  }
  return false;
}

function recomputePreviewTargets(sub) {
  sub.targets = [];
  objects.forEach((obj, i) => {
    if (subtractorOverlapsObject(sub, obj)) {
      sub.targets.push(i);
    }
  });
}

// ---------- Placement ----------
function createPrimitive(kind) {
  let position;
  let param;

  if (kind === PRIM_SPHERE) {
    position = vec3.fromValues(0, SPHERE_RADIUS, 0);
    param = vec3.fromValues(SPHERE_RADIUS, 0, 0);
  } else if (kind === PRIM_BOX) {
    const half = vec3.fromValues(0.5, 0.5, 0.5);
    position = vec3.fromValues(0, half[1], 0);
    param = half;
  } else if (kind === PRIM_CYL) {
    const radius = 0.7;
    const halfH = 0.8;
    position = vec3.fromValues(0, halfH, 0);
    param = vec3.fromValues(radius, halfH, 0);
  } else {
    position = vec3.fromValues(0, 0.5, 0);
    param = vec3.fromValues(0.5, 0.5, 0.5);
  }

  return {
    kind,
    position,
    param,
    targets: [],
  };
}

function startPlacing(kind) {
  if (placingBase || placingSubtractor || activeAxis) return;

  if (currentMode === MODE_SUBTRACT) {
    const sub = createPrimitive(kind);
    placingSubtractor = sub;
    recomputePreviewTargets(sub);
  } else {
    const obj = createPrimitive(kind);
    placingBase = obj;
    objects.push(obj);
    selectedObjectIndex = objects.length - 1;
  }
}

addSphereBtn?.addEventListener("click", () => startPlacing(PRIM_SPHERE));
addBoxBtn?.addEventListener("click", () => startPlacing(PRIM_BOX));
addCylBtn?.addEventListener("click", () => startPlacing(PRIM_CYL));

// ---------- Camera & input ----------
const camera = new OrbitCamera();

let rotatingCam = false;
let panningCam = false;
let lastX = 0;
let lastY = 0;

canvas.addEventListener("mousedown", (e) => {
  lastX = e.clientX;
  lastY = e.clientY;

  if (e.button === 1) {
    rotatingCam = true;
  } else if (e.button === 2 || (e.button === 1 && e.ctrlKey)) {
    panningCam = true;
  } else if (e.button === 0) {
    // left click
    if (!placingBase && !placingSubtractor && selectedObjectIndex >= 0) {
      const axis = pickGizmoAxis(e.clientX, e.clientY);
      if (axis) {
        beginAxisDrag(axis, e.clientX, e.clientY);
        return;
      }
    }

    if (!placingBase && !placingSubtractor && !activeAxis) {
      const picked = pickObject(e.clientX, e.clientY);
      if (picked) {
        draggingObject = picked.obj;
        selectedObjectIndex = picked.index;
      } else {
        draggingObject = null;
        selectedObjectIndex = -1;
      }
    }
  }
});

canvas.addEventListener("mouseup", (e) => {
  if (e.button === 1) rotatingCam = false;
  if (e.button === 2 || (e.button === 1 && e.ctrlKey)) panningCam = false;
  if (e.button === 0) {
    draggingObject = null;
    activeAxis = null;
    axisDragState = null;
  }
});

canvas.addEventListener("mouseleave", () => {
  rotatingCam = false;
  panningCam = false;
  draggingObject = null;
  activeAxis = null;
  axisDragState = null;
});

canvas.addEventListener("contextmenu", (e) => e.preventDefault());

canvas.addEventListener("mousemove", (e) => {
  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;

  if (rotatingCam) {
    const invert = invertYCheckbox && invertYCheckbox.checked ? -1 : 1;
    const dxNorm = dx / canvas.clientWidth;
    const dyNorm = (dy / canvas.clientHeight) * invert;
    camera.rotate(dxNorm, dyNorm);
  } else if (panningCam) {
    camera.pan(dx, dy);
  }

  if (draggingObject && activeAxis && axisDragState) {
    updateAxisDrag(e);
    return;
  }

  if (placingBase) {
    updatePrimitiveFromMouse(e, placingBase);
  }

  if (placingSubtractor) {
    updatePrimitiveFromMouse(e, placingSubtractor);
    recomputePreviewTargets(placingSubtractor);
  }

  if (draggingObject && !activeAxis) {
    updatePrimitiveFromMouse(e, draggingObject);
  }
});

canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    camera.zoom(e.deltaY);
  },
  { passive: false }
);

// finalize placements on click
canvas.addEventListener("click", () => {
  if (placingBase) {
    placingBase = null;
  } else if (placingSubtractor) {
    // bake subtractor into each target object as local offset
    if (placingSubtractor.targets && placingSubtractor.targets.length > 0) {
      placingSubtractor.targets.forEach((idx) => {
        if (idx < 0 || idx >= objects.length) return;
        const obj = objects[idx];
        const localOffset = vec3.create();
        vec3.sub(localOffset, placingSubtractor.position, obj.position);
        bakedSubs.push({
          kind: placingSubtractor.kind,
          localOffset,
          param: vec3.clone(placingSubtractor.param),
          targetIndex: idx,
        });
      });
    }
    placingSubtractor = null;
  }
});

// Esc & Delete
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (placingBase) {
      const idx = objects.indexOf(placingBase);
      if (idx >= 0) objects.splice(idx, 1);
      placingBase = null;
      selectedObjectIndex = -1;
    }
    placingSubtractor = null;
  }

  if (e.key === "Delete" || e.key === "Backspace") {
    if (selectedObjectIndex >= 0) {
      deleteObjectAt(selectedObjectIndex);
      selectedObjectIndex = -1;
      draggingObject = null;
      activeAxis = null;
      axisDragState = null;
    }
  }
});

function deleteObjectAt(index) {
  objects.splice(index, 1);
  // remove baked subtractors for this object and reindex
  for (let i = bakedSubs.length - 1; i >= 0; i--) {
    if (bakedSubs[i].targetIndex === index) {
      bakedSubs.splice(i, 1);
    } else if (bakedSubs[i].targetIndex > index) {
      bakedSubs[i].targetIndex -= 1;
    }
  }
}

// ---------- Picking ----------
function getPV() {
  const pv = mat4.create();
  mat4.multiply(pv, currentProj, currentView);
  return pv;
}

function getRayFromMouse(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const x = ((clientX - rect.left) / rect.width) * 2 - 1;
  const y = (1 - (clientY - rect.top) / rect.height) * 2 - 1;

  const pv = getPV();
  const invPV = mat4.create();
  if (!mat4.invert(invPV, pv)) return null;

  const pNear = vec4.fromValues(x, y, -1, 1);
  const pFar = vec4.fromValues(x, y, 1, 1);

  const worldNear = vec4.create();
  const worldFar = vec4.create();
  vec4.transformMat4(worldNear, pNear, invPV);
  vec4.transformMat4(worldFar, pFar, invPV);

  for (let i = 0; i < 3; i++) {
    worldNear[i] /= worldNear[3];
    worldFar[i] /= worldFar[3];
  }

  const origin = vec3.fromValues(worldNear[0], worldNear[1], worldNear[2]);
  const farPoint = vec3.fromValues(worldFar[0], worldFar[1], worldFar[2]);
  const dir = vec3.create();
  vec3.sub(dir, farPoint, origin);
  vec3.normalize(dir, dir);

  return { origin, dir };
}

function raySphereIntersection(origin, dir, center, radius) {
  const oc = vec3.create();
  vec3.sub(oc, origin, center);
  const a = vec3.dot(dir, dir);
  const b = 2.0 * vec3.dot(oc, dir);
  const c = vec3.dot(oc, oc) - radius * radius;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;

  const sqrtD = Math.sqrt(disc);
  const t1 = (-b - sqrtD) / (2 * a);
  const t2 = (-b + sqrtD) / (2 * a);

  let t = null;
  if (t1 > 0 && t2 > 0) t = Math.min(t1, t2);
  else if (t1 > 0) t = t1;
  else if (t2 > 0) t = t2;

  return t;
}

function pickObject(clientX, clientY) {
  const ray = getRayFromMouse(clientX, clientY);
  if (!ray) return null;

  const origin = ray.origin;
  const dir = ray.dir;

  let bestT = Infinity;
  let bestIndex = -1;

  for (let i = 0; i < objects.length; i++) {
    const obj = objects[i];
    let radius;

    if (obj.kind === PRIM_SPHERE) {
      radius = obj.param[0];
    } else if (obj.kind === PRIM_BOX) {
      const hx = obj.param[0];
      const hy = obj.param[1];
      const hz = obj.param[2];
      radius = Math.sqrt(hx * hx + hy * hy + hz * hz);
    } else if (obj.kind === PRIM_CYL) {
      const r = obj.param[0];
      const h = obj.param[1];
      radius = Math.sqrt(r * r + h * h);
    } else {
      continue;
    }

    const t = raySphereIntersection(origin, dir, obj.position, radius);
    if (t !== null && t > 0 && t < bestT) {
      bestT = t;
      bestIndex = i;
    }
  }

  if (bestIndex === -1) return null;
  return { obj: objects[bestIndex], index: bestIndex };
}

// ---------- Gizmo picking ----------
function worldToScreen(world) {
  const pv = getPV();
  const rect = canvas.getBoundingClientRect();
  const v = vec4.fromValues(world[0], world[1], world[2], 1.0);
  vec4.transformMat4(v, v, pv);
  if (v[3] === 0) return null;
  v[0] /= v[3];
  v[1] /= v[3];
  const sx = (v[0] * 0.5 + 0.5) * rect.width;
  const sy = (1 - (v[1] * 0.5 + 0.5)) * rect.height;
  return [sx, sy];
}

function distancePointToSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const len2 = vx * vx + vy * vy;
  if (len2 < 1e-6) {
    const dx = px - ax;
    const dy = py - ay;
    return Math.sqrt(dx * dx + dy * dy);
  }
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2));
  const cx = ax + t * vx;
  const cy = ay + t * vy;
  const dx = px - cx;
  const dy = py - cy;
  return Math.sqrt(dx * dx + dy * dy);
}

function pickGizmoAxis(clientX, clientY) {
  if (selectedObjectIndex < 0) return null;
  const obj = objects[selectedObjectIndex];

  const axisDirs = {
    x: vec3.fromValues(1, 0, 0),
    y: vec3.fromValues(0, 1, 0),
    z: vec3.fromValues(0, 0, 1),
  };

  const rect = canvas.getBoundingClientRect();
  const mx = clientX - rect.left;
  const my = clientY - rect.top;

  let bestAxis = null;
  let bestDist = Infinity;
  const threshold = 15;

  for (const key of ["x", "y", "z"]) {
    const dir = axisDirs[key];
    const start = obj.position;
    const end = vec3.create();
    vec3.scaleAndAdd(end, start, dir, GIZMO_LENGTH);

    const s2 = worldToScreen(start);
    const e2 = worldToScreen(end);
    if (!s2 || !e2) continue;

    const dist = distancePointToSegment(mx, my, s2[0], s2[1], e2[0], e2[1]);
    if (dist < bestDist) {
      bestDist = dist;
      bestAxis = key;
    }
  }

  if (bestAxis && bestDist <= threshold) {
    return bestAxis;
  }
  return null;
}

// ---------- Axis drag ----------
function beginAxisDrag(axisKey, clientX, clientY) {
  if (selectedObjectIndex < 0) return;
  const obj = objects[selectedObjectIndex];

  activeAxis = axisKey;
  draggingObject = obj;

  const axisDirMap = {
    x: vec3.fromValues(1, 0, 0),
    y: vec3.fromValues(0, 1, 0),
    z: vec3.fromValues(0, 0, 1),
  };
  const axisDir = axisDirMap[axisKey];

  const eye = camera.getEye();
  const viewDir = vec3.create();
  vec3.sub(viewDir, camera.target, eye);
  vec3.normalize(viewDir, viewDir);

  const planeNormal = viewDir;
  const planePoint = vec3.clone(obj.position);

  const ray = getRayFromMouse(clientX, clientY);
  let initialHit = vec3.clone(obj.position);
  if (ray) {
    const denom = vec3.dot(ray.dir, planeNormal);
    if (Math.abs(denom) > 1e-5) {
      const diff = vec3.create();
      vec3.sub(diff, planePoint, ray.origin);
      const t = vec3.dot(diff, planeNormal) / denom;
      if (t > 0) {
        vec3.scaleAndAdd(initialHit, ray.origin, ray.dir, t);
      }
    }
  }

  axisDragState = {
    axisDir,
    origPos: vec3.clone(obj.position),
    planeNormal: vec3.clone(planeNormal),
    planePoint: vec3.clone(planePoint),
    initialHit,
  };
}

function updateAxisDrag(e) {
  if (!draggingObject || !axisDragState) return;
  const ray = getRayFromMouse(e.clientX, e.clientY);
  if (!ray) return;

  const { axisDir, origPos, planeNormal, planePoint, initialHit } = axisDragState;

  const denom = vec3.dot(ray.dir, planeNormal);
  if (Math.abs(denom) < 1e-5) return;

  const diff = vec3.create();
  vec3.sub(diff, planePoint, ray.origin);
  const t = vec3.dot(diff, planeNormal) / denom;
  if (t <= 0) return;

  const pNow = vec3.create();
  vec3.scaleAndAdd(pNow, ray.origin, ray.dir, t);

  const delta = vec3.create();
  vec3.sub(delta, pNow, initialHit);

  const moveAmount = vec3.dot(delta, axisDir);
  const newPos = vec3.clone(origPos);
  vec3.scaleAndAdd(newPos, origPos, axisDir, moveAmount);

  vec3.copy(draggingObject.position, newPos);
}

// ---------- Primitive placement on plane + sphere snapping ----------
function updatePrimitiveFromMouse(e, prim) {
  const ray = getRayFromMouse(e.clientX, e.clientY);
  if (!ray || !prim) return;

  const origin = ray.origin;
  const dir = ray.dir;

  let bestT = Infinity;
  let bestPoint = null;
  let bestNormal = null;
  let hitType = null;
  let hitSphereObj = null;

  // ground plane y=0
  if (Math.abs(dir[1]) > 1e-4) {
    const tPlane = -origin[1] / dir[1];
    if (tPlane > 0) {
      const p = vec3.create();
      vec3.scaleAndAdd(p, origin, dir, tPlane);
      bestT = tPlane;
      bestPoint = p;
      bestNormal = vec3.fromValues(0, 1, 0);
      hitType = "plane";
    }
  }

  // sphere snapping to base objects
  if (prim.kind === PRIM_SPHERE) {
    for (const obj of objects) {
      if (obj === prim) continue;
      if (obj.kind !== PRIM_SPHERE) continue;

      const r = obj.param[0];
      const t = raySphereIntersection(origin, dir, obj.position, r);
      if (t !== null && t > 0 && t < bestT) {
        bestT = t;
        const p = vec3.create();
        vec3.scaleAndAdd(p, origin, dir, t);

        const n = vec3.create();
        vec3.sub(n, p, obj.position);
        vec3.normalize(n, n);

        bestPoint = p;
        bestNormal = n;
        hitType = "sphere";
        hitSphereObj = obj;
      }
    }
  }

  if (!bestPoint) return;

  const newPos = vec3.create();

  if (hitType === "plane") {
    vec3.copy(newPos, bestPoint);
    if (prim.kind === PRIM_SPHERE) {
      newPos[1] += prim.param[0];
    } else if (prim.kind === PRIM_BOX) {
      newPos[1] += prim.param[1];
    } else if (prim.kind === PRIM_CYL) {
      newPos[1] += prim.param[1];
    }
  } else if (hitType === "sphere" && hitSphereObj && prim.kind === PRIM_SPHERE) {
    const offset = vec3.create();
    vec3.scale(offset, bestNormal, prim.param[0]);
    vec3.add(newPos, bestPoint, offset);
  } else {
    vec3.copy(newPos, bestPoint);
  }

  vec3.copy(prim.position, newPos);
}

// ---------- Render ----------
function render() {
  resizeCanvas();

  gl.clearColor(0.03, 0.03, 0.05, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);

  const aspect = gl.drawingBufferWidth / gl.drawingBufferHeight;

  mat4.perspective(currentProj, (45 * Math.PI) / 180, aspect, 0.1, 100.0);
  const eye = camera.getEye();
  mat4.lookAt(currentView, eye, camera.target, vec3.fromValues(0, 1, 0));

  // plane + grid
  gl.useProgram(meshProgram);
  gl.uniformMatrix4fv(meshUniProj, false, currentProj);
  gl.uniformMatrix4fv(meshUniView, false, currentView);

  const model = mat4.create();

  mat4.identity(model);
  gl.uniformMatrix4fv(meshUniModel, false, model);
  bindMeshBuffer(plane.buffer);
  gl.drawArrays(gl.TRIANGLES, 0, plane.count);

  mat4.identity(model);
  gl.uniformMatrix4fv(meshUniModel, false, model);
  bindMeshBuffer(grid.buffer);
  gl.drawArrays(gl.LINES, 0, grid.count);

  // SDF pass
  gl.useProgram(sdfProgram);

  const pv = getPV();
  const invPV = mat4.create();
  mat4.invert(invPV, pv);
  gl.uniformMatrix4fv(sdfUniInvPV, false, invPV);
  gl.uniformMatrix4fv(sdfUniPV, false, pv);

  gl.uniform1i(sdfUniSelectedObjectIndex, selectedObjectIndex);

  const numObjects = Math.min(objects.length, MAX_OBJECTS);
  const objTypeArr = new Int32Array(MAX_OBJECTS);
  const objPosArr = new Float32Array(MAX_OBJECTS * 3);
  const objParamArr = new Float32Array(MAX_OBJECTS * 3);

  for (let i = 0; i < numObjects; i++) {
    const obj = objects[i];
    objTypeArr[i] = obj.kind;
    objPosArr[i * 3 + 0] = obj.position[0];
    objPosArr[i * 3 + 1] = obj.position[1];
    objPosArr[i * 3 + 2] = obj.position[2];
    objParamArr[i * 3 + 0] = obj.param[0];
    objParamArr[i * 3 + 1] = obj.param[1];
    objParamArr[i * 3 + 2] = obj.param[2];
  }

  const subTypeArr = new Int32Array(MAX_SUB_RECORDS);
  const subPosArr = new Float32Array(MAX_SUB_RECORDS * 3);
  const subParamArr = new Float32Array(MAX_SUB_RECORDS * 3);
  const subTargetObjArr = new Int32Array(MAX_SUB_RECORDS);
  let subRecordCount = 0;

  // baked subtractors: compute worldPos from object.position + localOffset
  for (const bs of bakedSubs) {
    if (subRecordCount >= MAX_SUB_RECORDS) break;
    const obj = objects[bs.targetIndex];
    if (!obj) continue;
    const worldPos = vec3.create();
    vec3.add(worldPos, obj.position, bs.localOffset);

    subTypeArr[subRecordCount] = bs.kind;
    subPosArr[subRecordCount * 3 + 0] = worldPos[0];
    subPosArr[subRecordCount * 3 + 1] = worldPos[1];
    subPosArr[subRecordCount * 3 + 2] = worldPos[2];
    subParamArr[subRecordCount * 3 + 0] = bs.param[0];
    subParamArr[subRecordCount * 3 + 1] = bs.param[1];
    subParamArr[subRecordCount * 3 + 2] = bs.param[2];
    subTargetObjArr[subRecordCount] = bs.targetIndex;
    subRecordCount++;
  }

  gl.uniform1i(sdfUniNumObjects, numObjects);
  gl.uniform1i(sdfUniNumSubRecords, subRecordCount);
  gl.uniform1iv(sdfUniObjType, objTypeArr);
  gl.uniform3fv(sdfUniObjPos, objPosArr);
  gl.uniform3fv(sdfUniObjParam, objParamArr);
  gl.uniform1iv(sdfUniSubType, subTypeArr);
  gl.uniform3fv(sdfUniSubPos, subPosArr);
  gl.uniform3fv(sdfUniSubParam, subParamArr);
  gl.uniform1iv(sdfUniSubTargetObj, subTargetObjArr);

  // preview subtractor uniforms
  if (placingSubtractor && placingSubtractor.targets) {
    const targetCount = Math.min(placingSubtractor.targets.length, MAX_OBJECTS);
    const previewTargetsArr = new Int32Array(MAX_OBJECTS);
    for (let i = 0; i < targetCount; i++) {
      previewTargetsArr[i] = placingSubtractor.targets[i];
    }
    gl.uniform1i(sdfUniPreviewActive, 1);
    gl.uniform1i(sdfUniPreviewType, placingSubtractor.kind);
    gl.uniform3fv(sdfUniPreviewPos, placingSubtractor.position);
    gl.uniform3fv(sdfUniPreviewParam, placingSubtractor.param);
    gl.uniform1i(sdfUniPreviewTargetCount, targetCount);
    gl.uniform1iv(sdfUniPreviewTargets, previewTargetsArr);
  } else {
    gl.uniform1i(sdfUniPreviewActive, 0);
    gl.uniform1i(sdfUniPreviewTargetCount, 0);
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, quadVBO);
  gl.enableVertexAttribArray(sdfAttribPos);
  gl.vertexAttribPointer(sdfAttribPos, 2, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.TRIANGLES, 0, 6);

  // gizmo for selected object
  if (selectedObjectIndex >= 0 && selectedObjectIndex < objects.length) {
    const obj = objects[selectedObjectIndex];
    gl.useProgram(meshProgram);
    gl.uniformMatrix4fv(meshUniProj, false, currentProj);
    gl.uniformMatrix4fv(meshUniView, false, currentView);

    const gizmoModel = mat4.create();
    mat4.fromTranslation(gizmoModel, obj.position);
    gl.uniformMatrix4fv(meshUniModel, false, gizmoModel);

    gl.disable(gl.DEPTH_TEST);
    bindMeshBuffer(gizmoBuffer);
    gl.drawArrays(gl.LINES, 0, gizmoCount);
    gl.enable(gl.DEPTH_TEST);
  }

  requestAnimationFrame(render);
}

render();
