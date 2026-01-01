import { mat4, vec3, vec4 } 
  from "https://cdn.jsdelivr.net/npm/gl-matrix@3.4.3/esm/index.js";
import { OrbitCamera } from "./camera.js";
import { UIOptions } from "./ui_options.js";
import { SDFRenderer } from "./sdf_renderer.js";

const MAX_SHAPES = 16;
const SHAPE_SPHERE = 0;

let invView = mat4.create();
let invProj = mat4.create();

//=================================================
//VERY IMPORTANT. Keeps track of all the shapes in the scene.
const shapes = [];
//=================================================

const canvas = document.getElementById("glcanvas");

const gl = canvas.getContext("webgl2");
if (!gl) alert("WebGL2 not supported");

function addSphereAtOrigin() {
  if (shapes.length >= MAX_SHAPES) {
    console.warn("Max shape count reached");
    return;
  }

  shapes.push({
    type: SHAPE_SPHERE,
    pos: [0, 1, 0],      // slightly above ground
    params: [1.0, 0, 0, 0] // radius = 1
  });

  uploadShapes();
}

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

//Function used to select shape when clicking
function pickShape(rayOrigin, rayDir) {
  let bestT = Infinity;
  let hitIndex = -1;

  for (let i = 0; i < shapes.length; i++) {
    const s = shapes[i];
    if (s.type !== SHAPE_SPHERE) continue;

    // Ray–sphere intersection
    const oc = [
      rayOrigin[0] - s.pos[0],
      rayOrigin[1] - s.pos[1],
      rayOrigin[2] - s.pos[2],
    ];

    const b = oc[0]*rayDir[0] + oc[1]*rayDir[1] + oc[2]*rayDir[2];
    const c = oc[0]*oc[0] + oc[1]*oc[1] + oc[2]*oc[2] - s.params[0]*s.params[0];
    const h = b*b - c;

    if (h < 0) continue;

    const t = -b - Math.sqrt(h);
    if (t > 0 && t < bestT) {
      bestT = t;
      hitIndex = i;
    }
  }

  return hitIndex;
}

let selectedShape = -1;

canvas.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;

  const ray = computeMouseRay(e.clientX, e.clientY);
  selectedShape = pickShape(ray.origin, ray.dir);

  console.log("Selected shape:", selectedShape);
});


//this function uploads the defined sdfs to the scene through the "shapes" list
function uploadShapes() {
  const posData   = new Float32Array(MAX_SHAPES * 3);
  const typeData  = new Int32Array(MAX_SHAPES);
  const paramData = new Float32Array(MAX_SHAPES * 4);

  shapes.forEach((s, i) => {
    posData.set(s.pos, i * 3);
    typeData[i] = s.type;
    paramData.set(s.params, i * 4);
  });

  sdfRenderer.setShapes({
    count: shapes.length,
    positions: posData,
    types: typeData,
    params: paramData,
  });
}

function drawGizmo(pos, activeAxis = -1) {
  const L = 1.2; // gizmo axis length

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

  const highlight = [1.0, 1.0, 0.0]; // yellow
  const colors = new Float32Array([
    ...(activeAxis === 0 ? highlight : [1,0,0]),
    ...(activeAxis === 0 ? highlight : [1,0,0]),

    ...(activeAxis === 1 ? highlight : [0,0,1]),
    ...(activeAxis === 1 ? highlight : [0,0,1]),

    ...(activeAxis === 2 ? highlight : [0,1,0]),
    ...(activeAxis === 2 ? highlight : [0,1,0]),
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

function createShader(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
    console.error(gl.getShaderInfoLog(s));
  return s;
}

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
const ui = new UIOptions();
const sdfRenderer = new SDFRenderer(gl);

ui.onAddSphere = () => {
  addSphereAtOrigin();
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

canvas.addEventListener("mousedown", e => {
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

window.addEventListener("mouseup", () => dragging = false);

window.addEventListener("mousemove", e => {
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

/* ============================
   Render loop
============================ */

const uView = gl.getUniformLocation(program, "uView");
const uProj = gl.getUniformLocation(program, "uProj");

function render() {
    // ---- build shape uniform data ----
    const shapePosData   = new Float32Array(MAX_SHAPES * 3);
    const shapeTypeData  = new Int32Array(MAX_SHAPES);
    const shapeParamData = new Float32Array(MAX_SHAPES * 4);

    for (let i = 0; i < shapes.length; i++) {
      const s = shapes[i];

      shapePosData.set(s.pos, i * 3);
      shapeTypeData[i] = s.type;
      shapeParamData.set(s.params, i * 4);
    }

    if (ui.darkMode) {
    gl.clearColor(0.08, 0.08, 0.08, 1);
    } else {
    gl.clearColor(1, 1, 1, 1);
    }
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);

    const view = mat4.create();
    const proj = mat4.create();

    mat4.lookAt(view, camera.getEye(), camera.target, [0,1,0]);
    mat4.perspective(proj, Math.PI / 4, canvas.width / canvas.height, 0.1, 100.0);

    //ADDITIONAL INVERSE VIEW MATRIX
    mat4.invert(invView, view);
    mat4.invert(invProj, proj);

        // --- SDF pass ---
    
    gl.useProgram(program);

    gl.uniformMatrix4fv(uView, false, view);
    gl.uniformMatrix4fv(uProj, false, proj);

    // --- draw grid ---
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, colBuffer);
    gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.LINES, 0, gridVertexCount);
    // --- draw axes (always visible) ---
    gl.disable(gl.DEPTH_TEST);

    gl.bindBuffer(gl.ARRAY_BUFFER, axisPosBuffer);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, axisColorBuffer);
    gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.LINES, 0, 4);

    // restore for future objects
    gl.enable(gl.DEPTH_TEST);

    sdfRenderer.draw({
      view,
      proj,
      invView,
      invProj,
      cameraPos: camera.getEye(),
      width: canvas.width,
      height: canvas.height,
      shapeData: {
        count: shapes.length,
        positions: shapePosData,
        types: shapeTypeData,
        params: shapeParamData,
      },
      selectedShape
    });
    gl.useProgram(program);
    gl.uniformMatrix4fv(uView, false, view);
    gl.uniformMatrix4fv(uProj, false, proj);

    // draw gizmo
    if (selectedShape !== -1) {
      drawGizmo(shapes[selectedShape].pos);
    }

  requestAnimationFrame(render);
}

render();
