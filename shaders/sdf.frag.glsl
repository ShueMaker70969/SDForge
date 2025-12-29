#version 300 es
precision highp float;

in vec2 vUV;
out vec4 outColor;

uniform vec3 uCameraPos;
uniform mat4 uView;
uniform mat4 uProj;

// -------------------------------
// SDF primitives
// -------------------------------
float sdSphere(vec3 p, float r) {
  return length(p) - r;
}

// -------------------------------
// Scene definition
// -------------------------------
float mapScene(vec3 p) {
  // sphere floating above grid
  return sdSphere(p - vec3(0.0, 1.0, 0.0), 1.0);
}

// -------------------------------
// Normal from SDF
// -------------------------------
vec3 calcNormal(vec3 p) {
  float e = 0.001;
  return normalize(vec3(
    mapScene(p + vec3(e,0,0)) - mapScene(p - vec3(e,0,0)),
    mapScene(p + vec3(0,e,0)) - mapScene(p - vec3(0,e,0)),
    mapScene(p + vec3(0,0,e)) - mapScene(p - vec3(0,0,e))
  ));
}

// -------------------------------
// Raymarch
// -------------------------------
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

// -------------------------------
// Main
// -------------------------------
void main() {
  // screen → NDC
  vec2 ndc = vUV * 2.0 - 1.0;

  // reconstruct view ray
  vec4 rayClip = vec4(ndc, -1.0, 1.0);
  vec4 rayView = inverse(uProj) * rayClip;
  rayView = vec4(rayView.xy, -1.0, 0.0);

  vec3 ro = uCameraPos;
  vec3 rd = normalize((inverse(uView) * rayView).xyz);

  float t;
  if (!raymarch(ro, rd, t)) {
    discard; // IMPORTANT: do not write depth
  }

  vec3 hitPos = ro + rd * t;
  vec3 normal = calcNormal(hitPos);

  // simple light
  vec3 lightDir = normalize(vec3(0.5, 1.0, 0.3));
  float diff = max(dot(normal, lightDir), 0.0);

  outColor = vec4(vec3(diff), 1.0);

  // correct depth
  vec4 viewPos = uView * vec4(hitPos, 1.0);
  vec4 clipPos = uProj * viewPos;
  gl_FragDepth = clipPos.z / clipPos.w * 0.5 + 0.5;
}
