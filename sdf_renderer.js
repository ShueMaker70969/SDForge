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
// SDF shaders (INLINE, FOR NOW)
// ============================
const SDF_VERT_SRC = `#version 300 es
precision highp float;

const vec2 verts[3] = vec2[](
  vec2(-1.0, -1.0),
  vec2( 3.0, -1.0),
  vec2(-1.0,  3.0)
);

out vec2 vUV;

void main() {
  gl_Position = vec4(verts[gl_VertexID], 0.0, 1.0);
  vUV = gl_Position.xy * 0.5 + 0.5;
}
`;

const SDF_FRAG_SRC = `#version 300 es
precision highp float;

in vec2 vUV;
out vec4 outColor;

uniform vec3 uCameraPos;
uniform mat4 uView;
uniform mat4 uProj;

// ---------------- SDF ----------------
float sdSphere(vec3 p, float r) {
  return length(p) - r;
}
float sdBox(vec3 p, vec3 b) {
  // b = half-size of the box
  vec3 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0);
}

float mapScene(vec3 p) {
  float dSphere = sdSphere(p - vec3(0.0, 1.0, 0.0), 1.0);
  float dBox    = sdBox(p - vec3(2.0, 1.0, 0.0), vec3(1.5));

  return min(dSphere, dBox);
}

vec3 calcNormal(vec3 p) {
  float e = 0.001;
  return normalize(vec3(
    mapScene(p + vec3(e,0,0)) - mapScene(p - vec3(e,0,0)),
    mapScene(p + vec3(0,e,0)) - mapScene(p - vec3(0,e,0)),
    mapScene(p + vec3(0,0,e)) - mapScene(p - vec3(0,0,e))
  ));
}

bool raymarch(vec3 ro, vec3 rd, out float t) {
  t = 0.0;
  for (int i = 0; i < 128; i++) {
    vec3 p = ro + rd * t;
    float d = mapScene(p);
    if (d < 0.001) return true;
    if (t > 100.0) break;
    t += d;
  }
  return false;
}

void main() {
  vec2 ndc = vUV * 2.0 - 1.0;

  vec4 rayClip = vec4(ndc, -1.0, 1.0);
  vec4 rayView = inverse(uProj) * rayClip;
  rayView = vec4(rayView.xy, -1.0, 0.0);

  vec3 ro = uCameraPos;
  vec3 rd = normalize((inverse(uView) * rayView).xyz);

  float t;
  if (!raymarch(ro, rd, t)) {
    discard;
  }

  vec3 hitPos = ro + rd * t;
  vec3 normal = calcNormal(hitPos);

  vec3 lightDir = normalize(vec3(0.5, 1.0, 0.3));
  float diff = max(dot(normal, lightDir), 0.0);

  outColor = vec4(vec3(diff), 1.0);

  vec4 viewPos = uView * vec4(hitPos, 1.0);
  vec4 clipPos = uProj * viewPos;
  gl_FragDepth = clipPos.z / clipPos.w * 0.5 + 0.5;
}
`;


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
