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
    this.uCamPos = gl.getUniformLocation(this.program, "uCameraPos");
  }

  draw({ view, proj, cameraPos, width, height }) {
    const gl = this.gl;

    gl.useProgram(this.program);
    gl.viewport(0, 0, width, height);

    gl.uniformMatrix4fv(this.uView, false, view);
    gl.uniformMatrix4fv(this.uProj, false, proj);
    gl.uniform3fv(this.uCamPos, cameraPos);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
