import { vsSource, fsSource } from "../shaders/grid.js";
import { OUTLINE_VS, OUTLINE_FS } from "../shaders/outline.js";

export function initRenderingContext(canvas) {
  const gl = canvas.getContext("webgl2");
  if (!gl) {
    alert("WebGL2 not supported");
    throw new Error("WebGL2 not supported");
  }

  const lineProgram = createProgram(gl, vsSource, fsSource);
  const lineAttributes = {
    position: gl.getAttribLocation(lineProgram, "aPosition"),
    color: gl.getAttribLocation(lineProgram, "aColor"),
  };
  const lineUniforms = {
    view: gl.getUniformLocation(lineProgram, "uView"),
    proj: gl.getUniformLocation(lineProgram, "uProj"),
  };

  const outlineProgram = createProgram(gl, OUTLINE_VS, OUTLINE_FS);
  const outlineUniforms = {
    sceneColor: gl.getUniformLocation(outlineProgram, "uSceneColor"),
    selectionMask: gl.getUniformLocation(outlineProgram, "uSelMask"),
    texelSize: gl.getUniformLocation(outlineProgram, "uTexel"),
    outlineColor: gl.getUniformLocation(outlineProgram, "uOutlineColor"),
    activeOutlineColor: gl.getUniformLocation(outlineProgram, "uActiveOutlineColor"),
    thickness: gl.getUniformLocation(outlineProgram, "uThickness"),
    activeId: gl.getUniformLocation(outlineProgram, "uActiveId"),
    selectedCount: gl.getUniformLocation(outlineProgram, "uSelectedCount"),
    selectedIds: gl.getUniformLocation(outlineProgram, "uSelectedIds"),
    idTolerance: gl.getUniformLocation(outlineProgram, "uIdTolerance"),
  };

  const gridGeometry = buildGridGeometry(gl);
  const axisGeometry = buildAxisGeometry(gl);

  const outlineTargets = createOutlineTargets(gl, canvas);

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
    outlineTargets.resize();
  }

  window.addEventListener("resize", resize);
  resize();

  return {
    gl,
    lineProgram,
    lineAttributes,
    lineUniforms,
    outlineProgram,
    outlineUniforms,
    gridGeometry,
    axisGeometry,
    outlineTargets,
  };
}

function buildGridGeometry(gl) {
  const gridSize = 10;
  const gridStep = 1;
  const positions = [];
  const colors = [];

  for (let i = -gridSize; i <= gridSize; i += gridStep) {
    positions.push(-gridSize, 0, i, gridSize, 0, i);
    colors.push(0.7, 0.7, 0.7, 0.7, 0.7, 0.7);

    positions.push(i, 0, -gridSize, i, 0, gridSize);
    colors.push(0.7, 0.7, 0.7, 0.7, 0.7, 0.7);
  }

  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

  const colorBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);

  return {
    positionBuffer,
    colorBuffer,
    vertexCount: positions.length / 3,
  };
}

function buildAxisGeometry(gl) {
  const positions = new Float32Array([
    -10, 0.001, 0,
    10, 0.001, 0,
    0, 0.001, -10,
    0, 0.001, 10,
  ]);

  const colors = new Float32Array([
    1, 0, 0,
    1, 0, 0,
    0, 1, 0,
    0, 1, 0,
  ]);

  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

  const colorBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW);

  return {
    positionBuffer,
    colorBuffer,
    vertexCount: 4,
  };
}

function createOutlineTargets(gl, canvas) {
  let outlineFBO = null;
  let sceneColorTex = null;
  let selMaskTex = null;
  let sceneDepthRB = null;

  function resize() {
    const w = canvas.width;
    const h = canvas.height;

    if (sceneColorTex) gl.deleteTexture(sceneColorTex);
    if (selMaskTex) gl.deleteTexture(selMaskTex);
    if (sceneDepthRB) gl.deleteRenderbuffer(sceneDepthRB);
    if (outlineFBO) gl.deleteFramebuffer(outlineFBO);

    outlineFBO = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, outlineFBO);

    sceneColorTex = createColorTexture(gl, w, h, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sceneColorTex, 0);

    selMaskTex = createColorTexture(gl, w, h, gl.R8, gl.RED, gl.UNSIGNED_BYTE);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, selMaskTex, 0);

    sceneDepthRB = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, sceneDepthRB);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, sceneDepthRB);

    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);

    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      console.error("Outline FBO incomplete:", status.toString(16));
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
  }

  resize();

  return {
    resize,
    get framebuffer() {
      return outlineFBO;
    },
    get sceneColorTexture() {
      return sceneColorTex;
    },
    get selectionMaskTexture() {
      return selMaskTex;
    },
  };
}

function createColorTexture(gl, w, h, internalFormat, format, type) {
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

function createShader(gl, type, src) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader));
  }
  return shader;
}

function createProgram(gl, vsSrc, fsSrc) {
  const program = gl.createProgram();
  gl.attachShader(program, createShader(gl, gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(program, createShader(gl, gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program));
  }
  return program;
}
