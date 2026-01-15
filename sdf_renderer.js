// ============================
// Shader helpers
// ============================
function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(gl, vsSource, fsSource) {
  const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
  if (!vs || !fs) return null;

  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

// ============================
// SDF shaders LOADED From ./shaders/
// ============================
async function loadText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}`);
  return await res.text();
}

const SDF_VERT_SRC = await loadText("./shaders/sdf.vert.glsl");
const SDF_FRAG_SRC = await loadText("./shaders/sdf.frag.glsl");


// ============================
// SDFRenderer
// ============================
export class SDFRenderer {
  constructor(gl) {
    this.gl = gl;
    this.program = createProgram(gl, SDF_VERT_SRC, SDF_FRAG_SRC);

    this.uView   = gl.getUniformLocation(this.program, "uView");
    this.uProj   = gl.getUniformLocation(this.program, "uProj");
    this.uInvView = gl.getUniformLocation(this.program, "uInvView");
    this.uInvProj = gl.getUniformLocation(this.program, "uInvProj");
    this.uCamPos = gl.getUniformLocation(this.program, "uCameraPos");

    //for adjusting the light direction in the scene. This is global light.
    this.uLightDir = gl.getUniformLocation(this.program, "uLightDir");

    //The stuff necessary for the shape list, that defines the shapes in scene
    this.uShapeCount = gl.getUniformLocation(this.program, "uShapeCount");
    this.uShapePos   = gl.getUniformLocation(this.program, "uShapePos");
    this.uShapeType  = gl.getUniformLocation(this.program, "uShapeType");
    this.uShapeParams= gl.getUniformLocation(this.program, "uShapeParams");
    this.uShapeRot   = gl.getUniformLocation(this.program, "uShapeRot");
    this.uShapeScale = gl.getUniformLocation(this.program, "uShapeScale");
    this.uShapeColor = gl.getUniformLocation(this.program, "uShapeColor");
    this.uBooleanCount = gl.getUniformLocation(this.program, "uBooleanCount");
    this.uBooleanOp = gl.getUniformLocation(this.program, "uBooleanOp");
    this.uBooleanShapeType = gl.getUniformLocation(this.program, "uBooleanShapeType");
    this.uBooleanPos = gl.getUniformLocation(this.program, "uBooleanPos");
    this.uBooleanRot = gl.getUniformLocation(this.program, "uBooleanRot");
    this.uBooleanScale = gl.getUniformLocation(this.program, "uBooleanScale");
    this.uBooleanParams = gl.getUniformLocation(this.program, "uBooleanParams");
    this.uBooleanSmooth = gl.getUniformLocation(this.program, "uBooleanSmooth");
  }
  setShapes({ count, positions, rotations, types, params, scales }) {
    const gl = this.gl;
    gl.useProgram(this.program);

    gl.uniform1i(this.uShapeCount, count);
    gl.uniform3fv(this.uShapePos, positions);
    gl.uniform4fv(this.uShapeRot, rotations);
    gl.uniform1iv(this.uShapeType, types);
    gl.uniform4fv(this.uShapeParams, params);
  }


  draw({ view, proj, invView, invProj, cameraPos, width, height, shapeData, lightDir,}) {
    const gl = this.gl;

    gl.useProgram(this.program);
    gl.viewport(0, 0, width, height);

    if (lightDir) {
      gl.uniform3fv(this.uLightDir, lightDir);
    }

    // camera uniforms
    gl.uniformMatrix4fv(this.uView, false, view);
    gl.uniformMatrix4fv(this.uProj, false, proj);
    gl.uniformMatrix4fv(this.uInvView, false, invView);
    gl.uniformMatrix4fv(this.uInvProj, false, invProj);
    gl.uniform3fv(this.uCamPos, cameraPos);

    // shape uniforms MUST be here
    gl.uniform1i(this.uShapeCount, shapeData.count);
    gl.uniform3fv(this.uShapePos, shapeData.positions);
    gl.uniform4fv(this.uShapeRot, shapeData.rotations);
    gl.uniform1iv(this.uShapeType, shapeData.types);
    gl.uniform4fv(this.uShapeParams, shapeData.params);
    gl.uniform3fv(this.uShapeScale, shapeData.scales);
    gl.uniform3fv(this.uShapeColor, shapeData.colors);
    gl.uniform1iv(this.uBooleanCount, shapeData.booleanCounts);
    gl.uniform1iv(this.uBooleanOp, shapeData.booleanOps);
    gl.uniform1iv(this.uBooleanShapeType, shapeData.booleanTypes);
    gl.uniform3fv(this.uBooleanPos, shapeData.booleanPositions);
    gl.uniform4fv(this.uBooleanRot, shapeData.booleanRotations);
    gl.uniform3fv(this.uBooleanScale, shapeData.booleanScales);
    gl.uniform4fv(this.uBooleanParams, shapeData.booleanParams);
    gl.uniform1fv(this.uBooleanSmooth, shapeData.booleanSmooths);

    gl.drawBuffers([
      gl.COLOR_ATTACHMENT0,
      gl.COLOR_ATTACHMENT1
    ]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

  }
}
