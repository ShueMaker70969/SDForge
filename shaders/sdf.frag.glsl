#version 300 es
precision highp float;

in vec2 vUV;

// We now have two outputs, for masking to enable clean outline
layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outMask;

int gHitShape = -1;

uniform vec3 uCameraPos;
uniform mat4 uView;
uniform mat4 uProj;
uniform mat4 uInvView;
uniform mat4 uInvProj;

uniform vec3 uLightDir;

#define MAX_SHAPES 16
#define SHAPE_SPHERE 0
#define SHAPE_BOX 1
#define SHAPE_CYL 2
#define SHAPE_CAPSULE 3
#define SHAPE_TORUS 4

uniform int  uShapeCount;
uniform vec3 uShapePos[MAX_SHAPES];
uniform vec4 uShapeRot[MAX_SHAPES];
uniform int  uShapeType[MAX_SHAPES];
uniform vec4 uShapeParams[MAX_SHAPES];
uniform vec3 uShapeScale[MAX_SHAPES];
uniform vec3 uShapeColor[MAX_SHAPES];

// ---------------- SDF ----------------
float sdSphere(vec3 p, float r) {
  return length(p) - r;
}

float sdBox(vec3 p, vec3 b, float r) { 
  // b = half-size of the box, r = rounding radius
  vec3 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r;
}

float sdCylinder(vec3 p, float r, float h, float rounding) {
    // r = radius, h = half-height, rounding = rounding radius for top/bottom edges
    vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r - rounding, h - rounding);
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - rounding;
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

vec3 rotateVecByQuat(vec3 v, vec4 q) {
    vec3 t = 2.0 * cross(q.xyz, v);
    return v + q.w * t + cross(q.xyz, t);
}


float mapScene(vec3 p) {
  float d = 1e9;
  gHitShape = -1;

  for (int i = 0; i < MAX_SHAPES; i++) {
    if (i >= uShapeCount) break;

    vec3 q = p - uShapePos[i];
    vec4 rot = uShapeRot[i];
    vec4 invRot = vec4(-rot.xyz, rot.w);
    vec3 local = rotateVecByQuat(q, invRot);
    local /= uShapeScale[i];

    float sd = 1e9;

    if (uShapeType[i] == SHAPE_SPHERE) {
      sd = sdSphere(local, uShapeParams[i].x);
    }
    if (uShapeType[i] == SHAPE_BOX) {
      sd = sdBox(local, uShapeParams[i].xyz, uShapeParams[i].w); 
      // .w is the rounding value, pass it as 3rd arguement 
    }
    if (uShapeType[i] == SHAPE_CYL) {
      sd = sdCylinder(local, uShapeParams[i].x, uShapeParams[i].y, uShapeParams[i].z);
      // .x = radius, .y = half-height, .z = rounding
    }
    if (uShapeType[i] == SHAPE_CAPSULE) {
      vec3 a = vec3(0.0, -uShapeParams[i].y, 0.0);
      vec3 b = vec3(0.0,  uShapeParams[i].y, 0.0);
      sd = sdCapsule(local, a, b, uShapeParams[i].x);
    }
    if (uShapeType[i] == SHAPE_TORUS) {
      sd = sdTorus(local, uShapeParams[i].xy);
    }

    float scaleMin = min(
      uShapeScale[i].x,
      min(uShapeScale[i].y, uShapeScale[i].z)
    );
    sd *= scaleMin;

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

  vec3 lightDir = normalize(uLightDir);
  float diff = max(dot(normal, lightDir), 0.0);
  
  // Get shape color, default to white if out of bounds
  vec3 shapeColor = (hitShape >= 0 && hitShape < uShapeCount) 
    ? uShapeColor[hitShape] 
    : vec3(0.8, 0.8, 0.8);
  
  // Apply lighting to shape color (ambient + diffuse)
  vec3 baseColor = shapeColor * (0.3 + 0.7 * diff);

  vec3 col = baseColor;

  // Normal shaded color
  outColor = vec4(col, 1.0);

  // Encode hit shape index (+1 so 0 can represent background)
  float encodedId = (hitShape >= 0) ? (float(hitShape) + 1.0) / 255.0 : 0.0;
  outMask = vec4(encodedId, 0.0, 0.0, 1.0);

  vec4 viewPos = uView * vec4(hitPos, 1.0);
  vec4 clipPos = uProj * viewPos;
  gl_FragDepth = clipPos.z / clipPos.w * 0.5 + 0.5;
}
