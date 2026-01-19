import { mat4, vec3, vec4, quat } 
  from "https://cdn.jsdelivr.net/npm/gl-matrix@3.4.3/esm/index.js";
import { OrbitCamera } from "./camera.js";
import { UIOptions } from "./ui_options.js";
import { SDFRenderer } from "./sdf_renderer.js";
import {
  shapes,
  selectedShape,
  selectedShapes,

  MAX_SHAPES,
  MAX_BOOLEAN_OPS,
  SHAPE_BOX,
  SHAPE_SPHERE,
  SHAPE_CYL,
  SHAPE_CAPSULE,
  SHAPE_TORUS,
  BOOLEAN_OP_UNION,
  BOOLEAN_OP_SUBTRACT,
  BOOLEAN_OP_INTERSECT,
  BOOLEAN_OP_SMOOTH_UNION,

  addShapeByName,
  deleteSelectedShapes,
  duplicateActiveShape,
  applySelection,
  clearSelection,
  applyBooleanOperation,
  buildShapeUniforms,
  setOnSelectionChanged,
  serializeScene,
  loadSceneData,
} from "./scene.js";

//These controls the light direction in the scene
const lightBaseDir = vec3.normalize([], [0.5, 1.0, 0.3]);
let lightAngle = 0.0; // radians
const lightDir = vec3.create();

//what other shapes could be added? triangle, polygon, cone...

window.morphFactor = 0.0; // <--- 0116 8PM

// PBR settings 
let pbrSettings = {
  roughness: 0.5,
  metallic: 0.0,
  aoIntensity: 1.0,
  shadowSoftness: 16.0,
};

// Point lights array 
let pointLights = [];

// Area light settings 
let areaLight = {
  enabled: false,
  position: [0, 5, 0],
  color: [1, 1, 1],
  intensity: 5.0,
  right: [1, 0, 0],
  up: [0, 0, 1],
  size: [3, 3],
};

let invView = mat4.create();
let invProj = mat4.create();
let ui = null;

const GIZMO_LENGTH = 1.2;
const GIZMO_ROTATION_SEGMENTS = 64;
const GIZMO_ROTATION_RADIUS = GIZMO_LENGTH;
const GIZMO_ROTATION_PICK_WIDTH = 0.12;
const GIZMO_HIGHLIGHT_COLOR = [1.0, 1.0, 0.0];
const GIZMO_AXIS_COLORS = [
  [1, 0, 0], // X
  [0, 0, 1], // Y
  [0, 1, 0], // Z
];
const SECONDARY_OUTLINE_COLOR = [1.0, 0.8, 0.0];
const ACTIVE_OUTLINE_COLOR = [1.0, 0.5, 0.0];
const SHAPE_ID_SCALE = 255;
const SHAPE_ID_TOLERANCE = 0.25 / SHAPE_ID_SCALE;
const BOOLEAN_MODE_MAP = {
  union: BOOLEAN_OP_UNION,
  difference: BOOLEAN_OP_SUBTRACT,
  intersect: BOOLEAN_OP_INTERSECT,
  smoothUnion: BOOLEAN_OP_SMOOTH_UNION,
};

let gizmoMode = "select";
let activeAxis = null;

const canvas = document.getElementById("glcanvas");

const gl = canvas.getContext("webgl2");
if (!gl) alert("WebGL2 not supported");

function computeMouseRay(mouseX, mouseY) {
  // 1. Convert mouse to NDC
  const ndcX = (mouseX / canvas.width) * 2 - 1;
  const ndcY = 1 - (mouseY / canvas.height) * 2; // flip Y

  // 2. Clip space
  const rayClip = [ndcX, ndcY, -1, 1];

  // 3. View space
  const rayView = vec4.transformMat4([], rayClip, invProj);
  rayView[0] /= rayView[3];
  rayView[1] /= rayView[3];
  rayView[2] /= rayView[3];
  rayView[3] = 0.0; // direction

  // 4. World space
  const rayWorld4 = vec4.transformMat4([], rayView, invView);
  const rayDir = vec3.normalize([], rayWorld4.slice(0, 3));

  return {
    origin: camera.getEye(),
    dir: rayDir,
  };
}


let pendingPick = null;
const pickPixel = new Uint8Array(4);


function changeGizmoMode(mode, source = "code") {
  if (gizmoMode === mode) {
    if (source !== "ui" && ui) {
      ui.setGizmoMode(mode);
    }
    return;
  }

  gizmoMode = mode;
  gizmoDragging = false;
  gizmoActiveAxis = -1;
  gizmoDragType = null;
  activeAxis = null;

  if (source !== "ui" && ui) {
    ui.setGizmoMode(mode);
  }
}

function exportSceneText() {
  const payload = serializeScene();
  payload.lightAngle = lightAngle;
  return JSON.stringify(payload);
}

function importSceneText(text) {
  if (!text) {
    alert("Scene text is empty.");
    return false;
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    console.error("Failed to parse scene text", err);
    alert("Invalid scene data (parse error).");
    return false;
  }

  const light = (typeof data.lightAngle === "number" && Number.isFinite(data.lightAngle))
    ? data.lightAngle
    : null;

  if (!loadSceneData(data)) {
    alert("Scene data did not contain valid shapes.");
    return false;
  }

  if (light !== null) {
    lightAngle = light;
    if (ui) {
      ui.setLightSlider(lightAngle * 180 / Math.PI);
    }
  }

  uploadShapes();
  return true;
}

//this function uploads the defined sdfs to the scene through the "shapes" list
function uploadShapes() {
  const posData   = new Float32Array(MAX_SHAPES * 3);
  const typeData  = new Int32Array(MAX_SHAPES);
  const paramData = new Float32Array(MAX_SHAPES * 4);
  const rotData   = new Float32Array(MAX_SHAPES * 4);

  shapes.forEach((s, i) => {
    posData.set(s.pos, i * 3);
    typeData[i] = s.type;
    paramData.set(s.params, i * 4);
    rotData.set(s.rotation, i * 4);
  });

  sdfRenderer.setShapes({
    count: shapes.length,
    positions: posData,
    types: typeData,
    params: paramData,
    rotations: rotData,
  });
}

function drawGizmo(pos, activeAxis = -1) {
  if (gizmoMode === "rotate") {
    drawRotationGizmo(pos, activeAxis);
  } else if (gizmoMode === "scale") {
    drawScaleGizmo(pos, activeAxis);
  } else {
    drawTranslationGizmo(pos, activeAxis);
  }
}

setOnSelectionChanged((active, all) => {
  if (!ui) return;

  const shape = active !== -1 ? shapes[active] : null;
  ui.updateRoundingControl(active, shape ?? null);
  const hasSlots = !!shape && Array.isArray(shape.booleanOps)
    ? shape.booleanOps.length < MAX_BOOLEAN_OPS
    : false;
  ui.updateBooleanControls(all.length, hasSlots);
});

function drawTranslationGizmo(pos, activeAxis = -1) {
  const L = GIZMO_LENGTH; // gizmo axis length

  const verts = new Float32Array([
    // X axis
    pos[0], pos[1], pos[2],
    pos[0] + L, pos[1], pos[2],

    // Y axis
    pos[0], pos[1], pos[2],
    pos[0], pos[1] + L, pos[2],

    // Z axis
    pos[0], pos[1], pos[2],
    pos[0], pos[1], pos[2] + L,
  ]);

  const colors = new Float32Array([
    ...(activeAxis === 0 ? GIZMO_HIGHLIGHT_COLOR : GIZMO_AXIS_COLORS[0]),
    ...(activeAxis === 0 ? GIZMO_HIGHLIGHT_COLOR : GIZMO_AXIS_COLORS[0]),

    ...(activeAxis === 1 ? GIZMO_HIGHLIGHT_COLOR : GIZMO_AXIS_COLORS[1]),
    ...(activeAxis === 1 ? GIZMO_HIGHLIGHT_COLOR : GIZMO_AXIS_COLORS[1]),

    ...(activeAxis === 2 ? GIZMO_HIGHLIGHT_COLOR : GIZMO_AXIS_COLORS[2]),
    ...(activeAxis === 2 ? GIZMO_HIGHLIGHT_COLOR : GIZMO_AXIS_COLORS[2]),
  ]);

  // OPTIONAL: always-visible gizmo
  gl.disable(gl.DEPTH_TEST);

  // Position
  gl.bindBuffer(gl.ARRAY_BUFFER, gizmoPosBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
  gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);

  // Color
  gl.bindBuffer(gl.ARRAY_BUFFER, gizmoColorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, colors, gl.DYNAMIC_DRAW);
  gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, 0, 0);

  gl.drawArrays(gl.LINES, 0, 6);

  gl.enable(gl.DEPTH_TEST);
}

function drawRotationGizmo(pos, activeAxis = -1) {
  gl.disable(gl.DEPTH_TEST);

  const circleVerts = new Float32Array(GIZMO_ROTATION_SEGMENTS * 3);
  const circleColors = new Float32Array(GIZMO_ROTATION_SEGMENTS * 3);

  for (let axisIndex = 0; axisIndex < GIZMO_DIRS.length; axisIndex++) {
    const axis = GIZMO_DIRS[axisIndex];
    const { tangent, bitangent } = buildCircleBasis(axis);
    const color = activeAxis === axisIndex ? GIZMO_HIGHLIGHT_COLOR : GIZMO_AXIS_COLORS[axisIndex];
    const offset = vec3.create();

    for (let i = 0; i < GIZMO_ROTATION_SEGMENTS; i++) {
      const t = (i / GIZMO_ROTATION_SEGMENTS) * Math.PI * 2;
      const cosT = Math.cos(t);
      const sinT = Math.sin(t);
      vec3.scale(offset, tangent, cosT * GIZMO_ROTATION_RADIUS);
      vec3.scaleAndAdd(offset, offset, bitangent, sinT * GIZMO_ROTATION_RADIUS);

      const idx = i * 3;
      circleVerts[idx    ] = pos[0] + offset[0];
      circleVerts[idx + 1] = pos[1] + offset[1];
      circleVerts[idx + 2] = pos[2] + offset[2];

      circleColors.set(color, idx);
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, gizmoPosBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, circleVerts, gl.DYNAMIC_DRAW);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, gizmoColorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, circleColors, gl.DYNAMIC_DRAW);
    gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.LINE_LOOP, 0, GIZMO_ROTATION_SEGMENTS);
  }

  gl.enable(gl.DEPTH_TEST);
}

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  gl.viewport(0, 0, canvas.width, canvas.height);
}
window.addEventListener("resize", resize);
resize();

/* ============================
   Shaders
============================ */

const vsSource = `
attribute vec3 aPosition;
attribute vec3 aColor;
uniform mat4 uView;
uniform mat4 uProj;
varying vec3 vColor;
void main() {
  vColor = aColor;
  gl_Position = uProj * uView * vec4(aPosition, 1.0);
}
`;

const fsSource = `
precision mediump float;
varying vec3 vColor;
void main() {
  gl_FragColor = vec4(vColor, 1.0);
}
`;

// New shader, function and FBO dedicated for the outline pass
// ++=============================================

let outlineFBO = null;
let sceneColorTex = null;
let selMaskTex = null;
let sceneDepthRB = null;

let outlineProg = null;
let uSceneColorLoc,
    uSelMaskLoc,
    uTexelLoc,
    uOutlineColorLoc,
    uActiveOutlineColorLoc,
    uThicknessLoc,
    uActiveIdLoc,
    uSelectedCountLoc,
    uSelectedIdsLoc,
    uIdToleranceLoc;

function createColorTex(w, h, internalFormat, format, type) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return tex;
}

function createOutlineFBO() {
  const w = canvas.width;
  const h = canvas.height;

  // Cleanup old
  if (sceneColorTex) gl.deleteTexture(sceneColorTex);
  if (selMaskTex) gl.deleteTexture(selMaskTex);
  if (sceneDepthRB) gl.deleteRenderbuffer(sceneDepthRB);
  if (outlineFBO) gl.deleteFramebuffer(outlineFBO);

  outlineFBO = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, outlineFBO);

  // Color attachment 0: scene color
  sceneColorTex = createColorTex(w, h, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sceneColorTex, 0);

  // Color attachment 1: selection mask
  // WebGL2 supports R8. If your platform is picky, use RGBA8 here too.
  selMaskTex = createColorTex(w, h, gl.R8, gl.RED, gl.UNSIGNED_BYTE);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, selMaskTex, 0);

  // Depth
  sceneDepthRB = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, sceneDepthRB);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, sceneDepthRB);

  // Tell WebGL we will draw to both attachments
  gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);

  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    console.error("Outline FBO incomplete:", status.toString(16));
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindRenderbuffer(gl.RENDERBUFFER, null);
}
createOutlineFBO();

const OUTLINE_VS = `#version 300 es
precision highp float;

out vec2 vUV;

// Fullscreen triangle (no VBO needed)
void main() {
  // gl_VertexID: 0,1,2
  vec2 p = vec2(
    (gl_VertexID == 1) ? 3.0 : -1.0,
    (gl_VertexID == 2) ? 3.0 : -1.0
  );
  vUV = 0.5 * (p + 1.0);
  gl_Position = vec4(p, 0.0, 1.0);
}
`;

const OUTLINE_FS = `#version 300 es
precision highp float;

in vec2 vUV;
out vec4 outColor;

uniform sampler2D uSceneColor;
uniform sampler2D uSelMask;

uniform vec2 uTexel;        // (1/width, 1/height)
uniform vec3 uOutlineColor; // selection color
uniform vec3 uActiveOutlineColor;
uniform float uThickness;   // e.g. 2.0
uniform float uIdTolerance;
uniform float uActiveId;
uniform int uSelectedCount;
uniform float uSelectedIds[16];

bool idMatches(float a, float b) {
  return abs(a - b) <= uIdTolerance;
}

float findSelectedId(float value) {
  if (value <= 0.0) {
    return -1.0;
  }
  for (int i = 0; i < 16; i++) {
    if (i >= uSelectedCount) break;
    if (idMatches(value, uSelectedIds[i])) {
      return uSelectedIds[i];
    }
  }
  return -1.0;
}

void main() {
  vec4 base = texture(uSceneColor, vUV);
  float idValue = texture(uSelMask, vUV).r;
  float matchedId = findSelectedId(idValue);

  if (matchedId < 0.0) {
    outColor = base;
    return;
  }

  bool isActive = (uActiveId > 0.0) && idMatches(idValue, uActiveId);

  float edge = 0.0;
  int t = int(max(1.0, uThickness));

  for (int y = -6; y <= 6; y++) {
    for (int x = -6; x <= 6; x++) {
      if (abs(x) > t || abs(y) > t) continue;
      vec2 uv = vUV + vec2(float(x), float(y)) * uTexel;
      float neighbor = texture(uSelMask, uv).r;
      if (!idMatches(neighbor, matchedId)) {
        edge = 1.0;
      }
    }
  }

  if (edge > 0.5) {
    vec3 color = isActive ? uActiveOutlineColor : uOutlineColor;
    outColor = vec4(color, 1.0);
  } else {
    outColor = base;
  }
}
`;
// =============================================++


function createShader(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
    console.error(gl.getShaderInfoLog(s));
  return s;
}

function createProgram(vsSrc, fsSrc) {
  const prog = gl.createProgram();
  gl.attachShader(prog, createShader(gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(prog, createShader(gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(prog));
  }
  return prog;
}

outlineProg = createProgram(OUTLINE_VS, OUTLINE_FS);
uSceneColorLoc = gl.getUniformLocation(outlineProg, "uSceneColor");
uSelMaskLoc = gl.getUniformLocation(outlineProg, "uSelMask");
uTexelLoc = gl.getUniformLocation(outlineProg, "uTexel");
uOutlineColorLoc = gl.getUniformLocation(outlineProg, "uOutlineColor");
uActiveOutlineColorLoc = gl.getUniformLocation(outlineProg, "uActiveOutlineColor");
uThicknessLoc = gl.getUniformLocation(outlineProg, "uThickness");
uActiveIdLoc = gl.getUniformLocation(outlineProg, "uActiveId");
uSelectedCountLoc = gl.getUniformLocation(outlineProg, "uSelectedCount");
uSelectedIdsLoc = gl.getUniformLocation(outlineProg, "uSelectedIds");
uIdToleranceLoc = gl.getUniformLocation(outlineProg, "uIdTolerance");


const program = gl.createProgram();
gl.attachShader(program, createShader(gl.VERTEX_SHADER, vsSource));
gl.attachShader(program, createShader(gl.FRAGMENT_SHADER, fsSource));
gl.linkProgram(program);
gl.useProgram(program);

/* ============================
   Grid geometry (LINES)
============================ */

const gridSize = 10;
const gridStep = 1;

const positions = [];
const colors = [];

// grid lines
for (let i = -gridSize; i <= gridSize; i += gridStep) {
  // X direction lines (parallel to X)
  positions.push(-gridSize, 0, i,  gridSize, 0, i);
  colors.push(0.7, 0.7, 0.7,   0.7, 0.7, 0.7);

  // Z direction lines (parallel to Z)
  positions.push(i, 0, -gridSize,  i, 0, gridSize);
  colors.push(0.7, 0.7, 0.7,   0.7, 0.7, 0.7);
}

const posBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

const colBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, colBuffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);

/* ============================
   Axis geometry (LINES)
============================ */

const axisPositions = new Float32Array([
  // X axis (red)
  -gridSize, 0.001, 0,
   gridSize, 0.001, 0,

  // Z axis (green)
  0, 0.001, -gridSize,
  0, 0.001,  gridSize,
]);

const axisColors = new Float32Array([
  // red
  1, 0, 0,
  1, 0, 0,

  // green
  0, 1, 0,
  0, 1, 0,
]);


// Gizmo buffers (create once)
const gizmoPosBuffer = gl.createBuffer();
const gizmoColorBuffer = gl.createBuffer();

//azis buffer
const axisPosBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, axisPosBuffer);
gl.bufferData(gl.ARRAY_BUFFER, axisPositions, gl.STATIC_DRAW);

const axisColorBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, axisColorBuffer);
gl.bufferData(gl.ARRAY_BUFFER, axisColors, gl.STATIC_DRAW);
const gridVertexCount = positions.length / 3;

/* ============================
   Orbit Camera
============================ */

const camera = new OrbitCamera();
const sdfRenderer = new SDFRenderer(gl);
ui = new UIOptions();
ui.setGizmoMode(gizmoMode);
ui.updateBooleanControls(0, false);

// UI Callbacks for the buttons and sliders
ui.onLightRotate = (deg) => {
  lightAngle = deg * Math.PI / 180.0;
};
ui.onGizmoModeChange = (mode) => {
  changeGizmoMode(mode, "ui");
};
ui.onDeleteShape = () => {
  deleteSelectedShapes();
};
ui.onAddShape = (typeName) => {
  const index = addShapeByName(typeName);
  if (index !== -1) {
    applySelection(index);
  }
};
ui.onExportScene = () => {
  const text = exportSceneText();
  ui.setSceneText(text);
  return text;
};
ui.onImportScene = (text) => {
  importSceneText(text);
};
ui.onApplyBoolean = (mode) => {
  const op = BOOLEAN_MODE_MAP[mode] ?? BOOLEAN_OP_UNION;
  const result = applyBooleanOperation(op);
  if (!result.success && result.error) {
    alert(result.error);
  }
};

// Callback for color updates
ui.onUpdateShapeColor = (color) => {
  if (selectedShape !== -1 && shapes[selectedShape]) {
    shapes[selectedShape].color = color;
    // Trigger re-render by calling buildShapeUniforms (it's called in render loop)
  }
};

// Callback for adjustable shape params (torus, capsule, etc.)
ui.onUpdateShapeParams = (params) => {
  if (selectedShape === -1 || !shapes[selectedShape]) return;
  const shape = shapes[selectedShape];

  if (shape.type === SHAPE_TORUS && params.torusThickness !== undefined) {
    shape.params[1] = params.torusThickness; // minor radius
    uploadShapes(); // Upload to GPU after parameter change
  }

  if (shape.type === SHAPE_CAPSULE) {
    if (params.capsuleRadius !== undefined) {
      shape.params[0] = params.capsuleRadius; // radius
      uploadShapes(); // Upload to GPU after parameter change
    }
    if (params.capsuleHeight !== undefined) {
      shape.params[1] = params.capsuleHeight; // half-height (distance from center to each endpoint)
      uploadShapes(); // Upload to GPU after parameter change
    }
  }
};

// Callback for box rounding updates
ui.onUpdateBoxRounding = (rounding) => {
  if (selectedShape !== -1 && shapes[selectedShape]) {
    const shape = shapes[selectedShape];
    if (shape.type === SHAPE_BOX) {
      shape.params[3] = rounding; // Box uses params[3]
    } else if (shape.type === SHAPE_CYL) {
      shape.params[2] = rounding; // Cylinder uses params[2]
    }
    uploadShapes(); // Upload to GPU after parameter change
  }
};

// PBR callbacks
ui.onPBRUpdate = (settings) => {
  pbrSettings = { ...settings };
};

ui.onPointLightUpdate = (lights) => {
  pointLights = lights.map(l => ({
    position: l.position,
    color: l.color,
    intensity: l.intensity,
    radius: l.radius || 0,
  }));
};

ui.onAreaLightUpdate = (light) => {
  areaLight = {
    enabled: light.enabled,
    position: light.position,
    color: light.color,
    intensity: light.intensity,
    right: [1, 0, 0],
    up: [0, 0, 1],
    size: light.size,
  };
};

/* ============================
   Attribute definition
============================ */

const aPos = gl.getAttribLocation(program, "aPosition");
gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
gl.enableVertexAttribArray(aPos);
gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);

const aColor = gl.getAttribLocation(program, "aColor");
gl.bindBuffer(gl.ARRAY_BUFFER, colBuffer);
gl.enableVertexAttribArray(aColor);
gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, 0, 0);


/* ============================
   Input handling
============================ */

let dragging = false;
let lastX = 0, lastY = 0;
let button = 0;
let flip_vertical = true;
const GIZMO_DIRS = [
  vec3.fromValues(1, 0, 0),
  vec3.fromValues(0, 1, 0),
  vec3.fromValues(0, 0, 1),
];

function getScaleGizmoDirs(shape) {
  const dirs = [
    vec3.fromValues(1, 0, 0),
    vec3.fromValues(0, 1, 0),
    vec3.fromValues(0, 0, 1),
  ];

  if (!shape) return dirs;

  for (let i = 0; i < 3; i++) {
    vec3.transformQuat(dirs[i], dirs[i], shape.rotation);
    vec3.normalize(dirs[i], dirs[i]);
  }
  return dirs;
}

function drawScaleGizmo(pos, activeAxis = -1) {
  const L = GIZMO_LENGTH;
  const shape = shapes[selectedShape];
  const dirs = getScaleGizmoDirs(shape);

  const verts = new Float32Array(18);
  const colors = new Float32Array(18);

  for (let i = 0; i < 3; i++) {
    const d = dirs[i];
    const o = i * 6;

    verts[o    ] = pos[0];
    verts[o + 1] = pos[1];
    verts[o + 2] = pos[2];

    verts[o + 3] = pos[0] + d[0] * L;
    verts[o + 4] = pos[1] + d[1] * L;
    verts[o + 5] = pos[2] + d[2] * L;

    const c = activeAxis === i ? GIZMO_HIGHLIGHT_COLOR : GIZMO_AXIS_COLORS[i];
    colors.set(c, o);
    colors.set(c, o + 3);
  }

  gl.disable(gl.DEPTH_TEST);

  gl.bindBuffer(gl.ARRAY_BUFFER, gizmoPosBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
  gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, gizmoColorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, colors, gl.DYNAMIC_DRAW);
  gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, 0, 0);

  gl.drawArrays(gl.LINES, 0, 6);
  gl.enable(gl.DEPTH_TEST);
}

function pickScaleAxis(rayOrigin, rayDir, origin, shape) {
  const dirs = getScaleGizmoDirs(shape);
  const threshold = 0.15;
  let bestAxis = -1;
  let bestDist = Infinity;

  for (let i = 0; i < 3; i++) {
    const dir = dirs[i];
    const { t, dist } = closestPointParamsOnLines(origin, dir, rayOrigin, rayDir);
    if (dist < threshold && t >= 0 && t <= GIZMO_LENGTH) {
      if (dist < bestDist) {
        bestDist = dist;
        bestAxis = i;
      }
    }
  }
  return bestAxis;
}

function buildCircleBasis(axis) {
  const helper = Math.abs(axis[1]) < 0.99 ? vec3.fromValues(0, 1, 0) : vec3.fromValues(1, 0, 0);
  const tangent = vec3.normalize(vec3.create(), vec3.cross(vec3.create(), axis, helper));
  const bitangent = vec3.normalize(vec3.create(), vec3.cross(vec3.create(), tangent, axis));
  return { tangent, bitangent };
}

let gizmoActiveAxis = -1;
let gizmoDragging = false;
let gizmoDragType = null;
let gizmoStartT = 0;

let gizmoStartScale = 1.0;

const gizmoStartPos = vec3.create();
const rotationAxis = vec3.create();
const rotationStartVec = vec3.create();
const rotationCurrentVec = vec3.create();
const rotationStartQuat = quat.create();
const rotationDeltaQuat = quat.create();


function closestPointParamsOnLines(p0, d0, p1, d1) {
  const r = vec3.sub([], p0, p1);
  const a = vec3.dot(d0, d0);
  const e = vec3.dot(d1, d1);
  const b = vec3.dot(d0, d1);
  const c = vec3.dot(d0, r);
  const f = vec3.dot(d1, r);
  const denom = a * e - b * b;
  if (Math.abs(denom) < 1e-6) {
    return { t: 0, dist: Infinity };
  }
  const t = (b * f - c * e) / denom;
  const s = (a * f - b * c) / denom;

  const p = vec3.scaleAndAdd([], p0, d0, t);
  const q = vec3.scaleAndAdd([], p1, d1, s);
  const dist = vec3.length(vec3.sub([], p, q));
  return { t, dist };
}

function projectRayToAxis(rayOrigin, rayDir, axisOrigin, axisDir) {
  const { t, dist } = closestPointParamsOnLines(axisOrigin, axisDir, rayOrigin, rayDir);
  if (!isFinite(dist)) return null;
  return t;
}

function intersectRayPlane(rayOrigin, rayDir, planePoint, planeNormal) {
  const denom = vec3.dot(planeNormal, rayDir);
  if (Math.abs(denom) < 1e-6) return null;
  const t = vec3.dot(vec3.sub([], planePoint, rayOrigin), planeNormal) / denom;
  if (t < 0) return null;
  return vec3.scaleAndAdd([], rayOrigin, rayDir, t);
}

function pickTranslationAxis(rayOrigin, rayDir, origin) {
  const threshold = 0.15;
  let bestAxis = -1;
  let bestDist = Infinity;

  for (let i = 0; i < GIZMO_DIRS.length; i++) {
    const dir = GIZMO_DIRS[i];
    const { t, dist } = closestPointParamsOnLines(origin, dir, rayOrigin, rayDir);
    if (dist < threshold && t >= 0 && t <= GIZMO_LENGTH) {
      if (dist < bestDist) {
        bestDist = dist;
        bestAxis = i;
      }
    }
  }
  return bestAxis;
}

function pickRotationAxis(rayOrigin, rayDir, origin) {
  let bestAxis = -1;
  let bestDiff = GIZMO_ROTATION_PICK_WIDTH;
  let bestPoint = null;

  for (let i = 0; i < GIZMO_DIRS.length; i++) {
    const axisDir = GIZMO_DIRS[i];
    const hit = intersectRayPlane(rayOrigin, rayDir, origin, axisDir);
    if (!hit) continue;

    const offset = vec3.sub([], hit, origin);
    const axisComponent = vec3.dot(offset, axisDir);
    vec3.scaleAndAdd(offset, offset, axisDir, -axisComponent);
    const dist = vec3.length(offset);
    const diff = Math.abs(dist - GIZMO_ROTATION_RADIUS);

    if (diff <= GIZMO_ROTATION_PICK_WIDTH && diff < bestDiff) {
      bestDiff = diff;
      bestAxis = i;
      bestPoint = hit;
    }
  }

  return {
    axis: bestAxis,
    hitPoint: bestPoint,
  };
}


// ++========================================
// AFFINE TRANSFORMATION DRAG HANDLING
function beginTranslationDrag(axisIndex, rayOrigin, rayDir) {
  gizmoActiveAxis = axisIndex;
  gizmoDragging = true;
  gizmoDragType = "translate";
  vec3.copy(gizmoStartPos, shapes[selectedShape].pos);
  const t = projectRayToAxis(rayOrigin, rayDir, gizmoStartPos, GIZMO_DIRS[axisIndex]);
  gizmoStartT = t ?? 0;
}

function beginRotationDrag(axisIndex, hitPoint) {
  const shape = shapes[selectedShape];
  const axisDir = GIZMO_DIRS[axisIndex];
  if (!projectPointToPlaneVector(hitPoint, shape.pos, axisDir, rotationStartVec)) {
    return;
  }
  gizmoActiveAxis = axisIndex;
  gizmoDragging = true;
  gizmoDragType = "rotate";
  vec3.copy(rotationAxis, axisDir);
  quat.copy(rotationStartQuat, shape.rotation);
}

function beginScaleDrag(axisIndex, rayOrigin, rayDir) {
  gizmoActiveAxis = axisIndex;
  gizmoDragging = true;
  gizmoDragType = "scale";

  // scaling is along the axis line, same anchor as translate:
  vec3.copy(gizmoStartPos, shapes[selectedShape].pos);

  const t = projectRayToAxis(rayOrigin, rayDir, gizmoStartPos, GIZMO_DIRS[axisIndex]);
  gizmoStartT = t ?? 0;

  gizmoStartScale = shapes[selectedShape].scale[axisIndex];
  // optional: store starting scale if you want stable scaling math
  // vec3.copy(scaleStart, shapes[selectedShape].scale);
}

// ADDITIONAL GIZMO DRAG HANDLER. Called if gizmo drag happens from SHORTCUT KEYS (g,r,s + x,y,z)
function beginKeyboardGizmoDrag() {
  if (selectedShape === -1) return;
  if (!activeAxis) return;

  const axisIndex = axisCharToIndex(activeAxis);
  if (axisIndex === -1) return;

  gizmoActiveAxis = axisIndex;
  gizmoDragging = true;
  gizmoDragType = gizmoMode;

  const ray = lastMouseRay; // explained below
  const shapePos = shapes[selectedShape].pos;
  if (gizmoMode !== "select"){
    if (gizmoMode === "translate") {
      beginTranslationDrag(axisIndex, ray.origin, ray.dir);
    } else if (gizmoMode === "rotate") {
      // Fake a hit point on the rotation plane
      const hit = intersectRayPlane(
        ray.origin,
        ray.dir,
        shapePos,
        GIZMO_DIRS[axisIndex]
      );
      if (hit) beginRotationDrag(axisIndex, hit);
    } else if (gizmoMode === "scale") {
      beginScaleDrag(axisIndex, ray.origin, ray.dir);
    }
  } 
}
// END OF AFFIE TRANSFORMATION DRAG HANDLING
// ========================================++


function projectPointToPlaneVector(point, origin, axisDir, out) {
  vec3.sub(out, point, origin);
  const axisComponent = vec3.dot(out, axisDir);
  vec3.scaleAndAdd(out, out, axisDir, -axisComponent);
  const len = vec3.length(out);
  if (len < 1e-4) return false;
  vec3.scale(out, out, 1 / len);
  return true;
}

function signedAngleBetween(a, b, axisDir) {
  const crossVec = vec3.cross([], a, b);
  const sinTerm = vec3.dot(crossVec, axisDir);
  const cosTerm = vec3.dot(a, b);
  return Math.atan2(sinTerm, cosTerm);
}

function handleRotationDrag(rayOrigin, rayDir) {
  const shape = shapes[selectedShape];
  const hit = intersectRayPlane(rayOrigin, rayDir, shape.pos, rotationAxis);
  if (!hit) return;
  if (!projectPointToPlaneVector(hit, shape.pos, rotationAxis, rotationCurrentVec)) {
    return;
  }

  const angle = signedAngleBetween(rotationStartVec, rotationCurrentVec, rotationAxis);
  if (!isFinite(angle) || Math.abs(angle) < 1e-4) {
    return;
  }
  quat.setAxisAngle(rotationDeltaQuat, rotationAxis, angle);
  quat.mul(shape.rotation, rotationDeltaQuat, rotationStartQuat);
  quat.normalize(shape.rotation, shape.rotation);
  quat.copy(rotationStartQuat, shape.rotation);
  vec3.copy(rotationStartVec, rotationCurrentVec);
}

function queuePickRequest(clientX, clientY, options = {}) {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;

  const normX = (clientX - rect.left) / rect.width;
  const normY = (clientY - rect.top) / rect.height;
  if (normX < 0 || normX > 1 || normY < 0 || normY > 1) return;

  const pixelX = Math.min(
    canvas.width - 1,
    Math.max(0, Math.floor(normX * canvas.width))
  );
  const pixelYTop = Math.min(
    canvas.height - 1,
    Math.max(0, Math.floor(normY * canvas.height))
  );

  pendingPick = {
    x: pixelX,
    y: canvas.height - 1 - pixelYTop,
    additive: !!options.additive,
  };
}

function processPendingPick() {
  if (!pendingPick) return;

  gl.bindFramebuffer(gl.FRAMEBUFFER, outlineFBO);
  gl.readBuffer(gl.COLOR_ATTACHMENT1);
  gl.readPixels(
    pendingPick.x,
    pendingPick.y,
    1,
    1,
    gl.RED,
    gl.UNSIGNED_BYTE,
    pickPixel
  );
  gl.readBuffer(gl.COLOR_ATTACHMENT0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  const value = pickPixel[0];
  const additive = pendingPick.additive;
  pendingPick = null;
  const shapeIndex = value > 0 ? value - 1 : -1;

  if (shapeIndex === -1) {
    if (!additive) {
      clearSelection();
    }
    return;
  }

  applySelection(shapeIndex, { additive });
}

//This converts the keyboard input into axis index
function axisCharToIndex(axis) {
  if (axis === "x") return 0;
  if (axis === "y") return 2;
  if (axis === "z") return 1;
  return -1;
}

window.addEventListener("keydown", (e) => {
  if (
    e.target.tagName === "INPUT" ||
    e.target.tagName === "TEXTAREA" ||
    e.target.isContentEditable
  ) {
    return;
  }

  const key = e.key.toLowerCase();

  if (e.shiftKey && key === "a") {
    const typeName = ui ? ui.getSelectedShapeType() : "sphere";
    const index = addShapeByName(typeName);
    if (index !== -1) {
      applySelection(index);
    }
    return;
  }
  if (e.shiftKey && key === "d") {
    duplicateActiveShape();
    return;
  }

  // Enter affine transformation mode
  if (key === "g") {
    changeGizmoMode("translate");
    console.log("Mode: translate");
    return;
  }
  if (key === "r") {
    changeGizmoMode("rotate");
    console.log("Mode: rotate");
    return;
  }
  if (key === "s") {
    changeGizmoMode("scale");
    console.log("Mode: scale");
    return;
  }

  // Delete selected shape, if in select mode
  if (key === "x" && gizmoMode === "select" && selectedShapes.length > 0) {
    deleteSelectedShapes();
    return;
  }

  if (!gizmoMode) return;
  if (key === "x" || key === "y" || key === "z") {
    if (activeAxis === key) {
      activeAxis = null;
      gizmoActiveAxis = -1;
      gizmoDragging = false;
      return;
    }

    activeAxis = key;
    console.log(`Axis constraint: ${activeAxis.toUpperCase()}`);

    beginKeyboardGizmoDrag();
    return;
  }

  if (key === "escape") {
    changeGizmoMode("select");
    gizmoDragging = false;
    gizmoActiveAxis = -1;
    gizmoDragType = null;
    activeAxis = null;
    console.log("Mode: select");
  }
});


canvas.addEventListener("mousedown", e => {
  if (e.button === 0) {
    const ray = computeMouseRay(e.clientX, e.clientY);
    if (gizmoDragging) {
      gizmoDragging = false;
      gizmoActiveAxis = -1;
      gizmoDragType = null;
      activeAxis = null;

      // IMPORTANT: do NOT select/deselect
      return;
    }
    // If clicking while in a transform mode, always exit to select
    if (gizmoMode !== "select") {
      changeGizmoMode("select");
    }

    if (selectedShape !== -1 && gizmoMode !== "select") {
      const shapePos = shapes[selectedShape].pos;
      if (gizmoMode === "rotate") {
        const pick = pickRotationAxis(ray.origin, ray.dir, shapePos);
        if (pick.axis !== -1 && pick.hitPoint) {
          beginRotationDrag(pick.axis, pick.hitPoint);
          return;
        }
      } else if (gizmoMode === "translate") {
        const axis = pickTranslationAxis(ray.origin, ray.dir, shapePos);
        if (axis !== -1) {
          beginTranslationDrag(axis, ray.origin, ray.dir);
          return;
        }
      } else if (gizmoMode === "scale") {
          const axis = pickScaleAxis(ray.origin, ray.dir, shapePos, shapes[selectedShape]);
          if (axis !== -1) {
            beginScaleDrag(axis, ray.origin, ray.dir);
            return;
        }
      }
    }

    gizmoActiveAxis = -1;
    gizmoDragging = false;
    gizmoDragType = null;
    queuePickRequest(e.clientX, e.clientY, { additive: e.shiftKey });
    return;
  }

  if (e.button !== 1) {
    dragging = false;
    return;
  }

  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
  button = e.button;
  e.preventDefault(); // avoid default middle-click behavior
});

window.addEventListener("mouseup", () => {
  dragging = false;
  gizmoDragging = false;
  gizmoActiveAxis = -1;
  gizmoDragType = null;
});

let lastMouseRay = null;

//TRANSLATION HANDLING!!!! do not fortget m8, this is the important one.
window.addEventListener("mousemove", e => {
  lastMouseRay = computeMouseRay(e.clientX, e.clientY);
  if (gizmoDragging && selectedShape !== -1 && gizmoActiveAxis !== -1) {
    const ray = computeMouseRay(e.clientX, e.clientY);
    if (gizmoDragType === "translate") {
      const axisDir = GIZMO_DIRS[gizmoActiveAxis];
      const t = projectRayToAxis(ray.origin, ray.dir, gizmoStartPos, axisDir);
      if (t !== null) {
        const delta = t - gizmoStartT;
        const newPos = vec3.scaleAndAdd([], gizmoStartPos, axisDir, delta);
        shapes[selectedShape].pos = newPos;
      }
    } else if (gizmoDragType === "rotate") {
      handleRotationDrag(ray.origin, ray.dir);
    } else if (gizmoDragType === "scale") {
        const axisDir =
          getScaleGizmoDirs(shapes[selectedShape])[gizmoActiveAxis];

        const t = projectRayToAxis(ray.origin, ray.dir, gizmoStartPos, axisDir);
        if (t !== null) {
          const delta = t - gizmoStartT;
          const factor = Math.exp(delta * 0.3);
          shapes[selectedShape].scale[gizmoActiveAxis] =
            Math.max(0.05, gizmoStartScale * factor);
        }
      }
    return;
  }
  if (!dragging) return;

  const dx = (e.clientX - lastX) / canvas.width;
  const dyRaw = (e.clientY - lastY) / canvas.height;

  const dyRotate = ui.invertY ? -dyRaw : dyRaw;
  const dyPan = dyRaw; 

  lastX = e.clientX;
  lastY = e.clientY;

  if (button === 1) {
    if (e.shiftKey) {
      camera.pan(dx * canvas.width, dyPan * canvas.height);
    } else {
      camera.rotate(dx, dyRotate);
    }
  }
});


canvas.addEventListener("wheel", e => {
  camera.zoom(e.deltaY);
});

canvas.addEventListener("contextmenu", e => e.preventDefault());

const uView = gl.getUniformLocation(program, "uView");
const uProj = gl.getUniformLocation(program, "uProj");

const shapePosData   = new Float32Array(MAX_SHAPES * 3);
const shapeTypeData  = new Int32Array(MAX_SHAPES);
const shapeParamData = new Float32Array(MAX_SHAPES * 4);
const shapeRotData   = new Float32Array(MAX_SHAPES * 4);
const shapeScaleData = new Float32Array(MAX_SHAPES * 3);
const shapeColorData = new Float32Array(MAX_SHAPES * 3);
const booleanCountData = new Int32Array(MAX_SHAPES);
const booleanTypeData = new Int32Array(MAX_SHAPES * MAX_BOOLEAN_OPS);
const booleanParamData = new Float32Array(MAX_SHAPES * MAX_BOOLEAN_OPS * 4);
const booleanPosData = new Float32Array(MAX_SHAPES * MAX_BOOLEAN_OPS * 3);
const booleanRotData = new Float32Array(MAX_SHAPES * MAX_BOOLEAN_OPS * 4);
const booleanScaleData = new Float32Array(MAX_SHAPES * MAX_BOOLEAN_OPS * 3);
const booleanOpData = new Int32Array(MAX_SHAPES * MAX_BOOLEAN_OPS);
const booleanSmoothData = new Float32Array(MAX_SHAPES * MAX_BOOLEAN_OPS);
const selectedIdArray = new Float32Array(MAX_SHAPES);

// =========================================
// RENDER LOOP HEREEEE
// =========================================
function render() {
  // ---------------------------------
  // Update light direction
  // ---------------------------------
  {
    const q = quat.create();
    quat.setAxisAngle(q, [0, 1, 0], lightAngle);
    vec3.transformQuat(lightDir, lightBaseDir, q);
  }

  // ---------------------------------
  // Build shape uniform data
  // ---------------------------------
  buildShapeUniforms(
    shapePosData,
    shapeTypeData,
    shapeParamData,
    shapeRotData,
    shapeScaleData,
    shapeColorData,
    booleanCountData,
    booleanTypeData,
    booleanParamData,
    booleanPosData,
    booleanRotData,
    booleanScaleData,
    booleanOpData,
    booleanSmoothData
  );

  selectedIdArray.fill(0);
  const selectionCount = Math.min(selectedShapes.length, MAX_SHAPES);
  for (let i = 0; i < selectionCount; i++) {
    selectedIdArray[i] = (selectedShapes[i] + 1) / SHAPE_ID_SCALE;
  }

  // ---------------------------------
  // Camera matrices
  // ---------------------------------
  const view = mat4.create();
  const proj = mat4.create();

  mat4.lookAt(view, camera.getEye(), camera.target, [0, 1, 0]);
  mat4.perspective(
    proj,
    Math.PI / 4,
    canvas.width / canvas.height,
    0.1,
    100.0
  );

  mat4.invert(invView, view);
  mat4.invert(invProj, proj);

  // =========================================================
  // PASS A — Render WORLD into outlineFBO (shared depth)
  //   - grid
  //   - axes
  //   - SDF shapes
  // =========================================================
  gl.bindFramebuffer(gl.FRAMEBUFFER, outlineFBO);
  gl.viewport(0, 0, canvas.width, canvas.height);

  
  gl.clearColor(0.08, 0.08, 0.08, 1);

  gl.enable(gl.DEPTH_TEST);
  gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  
  // ---- SDF shapes FIRST (writes depth) ----
  sdfRenderer.draw({
    view,
    proj,
    invView,
    invProj,
    cameraPos: camera.getEye(),
    width: canvas.width,
    height: canvas.height,
    morphT: window.morphFactor, // <--- 0116 8PM
    shapeData: {
      count: shapes.length,
      positions: shapePosData,
      rotations: shapeRotData,
      types: shapeTypeData,
      params: shapeParamData,
      scales: shapeScaleData,
      colors: shapeColorData,
      booleanCounts: booleanCountData,
      booleanTypes: booleanTypeData,
      booleanParams: booleanParamData,
      booleanPositions: booleanPosData,
      booleanRotations: booleanRotData,
      booleanScales: booleanScaleData,
      booleanOps: booleanOpData,
      booleanSmooths: booleanSmoothData,
    },
    lightDir,
    // PBR parameters
    roughness: pbrSettings.roughness,
    metallic: pbrSettings.metallic,
    aoIntensity: pbrSettings.aoIntensity,
    shadowSoftness: pbrSettings.shadowSoftness,
    // Point lights
    pointLights,
    // Area light
    areaLight,
  });

  gl.drawBuffers([gl.COLOR_ATTACHMENT0]);

  // ---- grid AFTER SDF (depth-tested) ----
  gl.useProgram(program);
  gl.uniformMatrix4fv(uView, false, view);
  gl.uniformMatrix4fv(uProj, false, proj);

  gl.enable(gl.DEPTH_TEST);
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
  gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, colBuffer);
  gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.LINES, 0, gridVertexCount);

  // ---- axes LAST (always visible) ----
  gl.bindBuffer(gl.ARRAY_BUFFER, axisPosBuffer);
  gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, axisColorBuffer);
  gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.LINES, 0, 4);

  // =========================================================
  // PASS B — Outline fullscreen post-process
  // =========================================================
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.disable(gl.DEPTH_TEST);

  gl.useProgram(outlineProg);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, sceneColorTex);
  gl.uniform1i(uSceneColorLoc, 0);

  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, selMaskTex);
  gl.uniform1i(uSelMaskLoc, 1);

  gl.uniform2f(uTexelLoc, 1.0 / canvas.width, 1.0 / canvas.height);
  gl.uniform3f(uOutlineColorLoc, SECONDARY_OUTLINE_COLOR[0], SECONDARY_OUTLINE_COLOR[1], SECONDARY_OUTLINE_COLOR[2]);
  gl.uniform3f(uActiveOutlineColorLoc, ACTIVE_OUTLINE_COLOR[0], ACTIVE_OUTLINE_COLOR[1], ACTIVE_OUTLINE_COLOR[2]);
  gl.uniform1f(uThicknessLoc, 2.0);
  const activeIdValue = selectedShape >= 0
    ? (selectedShape + 1) / SHAPE_ID_SCALE
    : 0.0;
  gl.uniform1f(uActiveIdLoc, activeIdValue);
  gl.uniform1i(uSelectedCountLoc, selectionCount);
  gl.uniform1fv(uSelectedIdsLoc, selectedIdArray);
  gl.uniform1f(uIdToleranceLoc, SHAPE_ID_TOLERANCE);

  gl.drawArrays(gl.TRIANGLES, 0, 3);

  // =========================================================
  // PASS C — Gizmo (on top of everything)
  // =========================================================
  gl.useProgram(program);
  gl.uniformMatrix4fv(uView, false, view);
  gl.uniformMatrix4fv(uProj, false, proj);

  gl.enable(gl.DEPTH_TEST);
  if (selectedShape !== -1 && gizmoMode !== "select") {
    drawGizmo(shapes[selectedShape].pos, gizmoActiveAxis);
  }

  processPendingPick();
  requestAnimationFrame(render);
}

render();
