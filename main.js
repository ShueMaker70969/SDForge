import { mat4 } from "https://cdn.jsdelivr.net/npm/gl-matrix@3.4.3/esm/index.js";
import { OrbitCamera } from "./camera.js";
import { UIOptions } from "./ui_options.js";
import { SDFRenderer } from "./sdf_renderer.js";

const MAX_SHAPES = 16;
const SHAPE_SPHERE = 0;

//VERY IMPORTANT. Keeps track of all the shapes in the scene.
const shapes = [];

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
  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
  button = e.button;
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

  if (button === 0) {
    camera.rotate(dx, dyRotate);
  }

  if (button === 2) {
    camera.pan(dx * canvas.width, dyPan * canvas.height);
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
    const invView = mat4.create();
    const invProj = mat4.create();

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
    });
  requestAnimationFrame(render);
}

render();