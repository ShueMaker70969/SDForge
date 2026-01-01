#version 300 es
precision highp float;

in vec2 vUV;
out vec4 outColor;

int gHitShape = -1;

uniform vec3 uCameraPos;
uniform mat4 uView;
uniform mat4 uProj;
uniform mat4 uInvView;
uniform mat4 uInvProj;

#define MAX_SHAPES 16
#define SHAPE_SPHERE 0

uniform int  uSelectedShape;
uniform int  uShapeCount;
uniform vec3 uShapePos[MAX_SHAPES];
uniform int  uShapeType[MAX_SHAPES];
uniform vec4 uShapeParams[MAX_SHAPES];

// ---------------- SDF ----------------
float sdSphere(vec3 p, float r) {
  return length(p) - r;
}
float sdBox(vec3 p, vec3 b) {
  // b = half-size of the box
  vec3 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0);
}
float sdCylinder(vec3 p, float r, float h) {
    vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h);
    return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}
float sdCapsule(vec3 p, vec3 a, vec3 b, float r) {
    vec3 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h) - r;
}
float sdTorus(vec3 p, vec2 t) {
    vec2 q = vec2(length(p.xz) - t.x, p.y);
    return length(q) - t.y;
}


float mapScene(vec3 p) {
  float d = 1e9;
  gHitShape = -1;

  for (int i = 0; i < MAX_SHAPES; i++) {
    if (i >= uShapeCount) break;

    vec3 q = p - uShapePos[i];
    float sd = 1e9;

    if (uShapeType[i] == SHAPE_SPHERE) {
      sd = sdSphere(q, uShapeParams[i].x);
    }

    if (sd < d) {
      d = sd;
      gHitShape = i;
    }
  }
  return d;
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
  vec4 rayView = uInvProj * rayClip;
  rayView = vec4(rayView.xy, -1.0, 0.0);

  vec3 ro = uCameraPos;
  vec3 rd = normalize((uInvView * rayView).xyz);

  float t;
  if (!raymarch(ro, rd, t)) discard;

  vec3 hitPos = ro + rd * t;

  // Make sure gHitShape is for the surface point:
  mapScene(hitPos);
  int hitShape = gHitShape;

  vec3 normal = calcNormal(hitPos);

  vec3 lightDir = normalize(vec3(0.5, 1.0, 0.3));
  float diff = max(dot(normal, lightDir), 0.0);
  vec3 baseColor = vec3(diff);

  // --- silhouette outline ---
  float facing = abs(dot(normalize(normal), normalize(-rd)));
  float outlineStart = 0.30; // where outline begins
  float outlineEnd   = 0.02; // where outline is strongest

  float outline = smoothstep(outlineStart, outlineEnd, facing);


  vec3 col = baseColor;
  if (hitShape == uSelectedShape && outline > 0.0) {
    outColor = vec4(1.0, 0.8, 0.0, 1.0); // constant yellow
    return;
  }

  outColor = vec4(col, 1.0);

  vec4 viewPos = uView * vec4(hitPos, 1.0);
  vec4 clipPos = uProj * viewPos;
  gl_FragDepth = clipPos.z / clipPos.w * 0.5 + 0.5;
}
