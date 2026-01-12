#version 300 es
precision highp float;

in vec2 vUV;

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

// --- Boolean Operation Codes ---
#define OP_UNION 0
#define OP_SUBTRACT 1
#define OP_INTERSECT 2

uniform int  uShapeCount;
uniform vec3 uShapePos[MAX_SHAPES];
uniform vec4 uShapeRot[MAX_SHAPES];
uniform int  uShapeType[MAX_SHAPES];
uniform vec4 uShapeParams[MAX_SHAPES];
uniform vec3 uShapeScale[MAX_SHAPES];
uniform vec3 uShapeColor[MAX_SHAPES];

// 1. ADDED: This receives the "Instruction" (Add/Cut/Intersect)
uniform int  uShapeOp[MAX_SHAPES]; 

// ---------------- SDF Primitives ----------------
float sdSphere(vec3 p, float r) {
  return length(p) - r;
}
float sdBox(vec3 p, vec3 b, float r) { 
  vec3 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r;
}
float sdCylinder(vec3 p, float r, float h, float rounding) {
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

// ---------------- The Boolean Logic ----------------
// This is the "Architectural Math" you requested.
float opUnion(float d1, float d2) { return min(d1, d2); }
float opSubtract(float d1, float d2) { return max(-d1, d2); } // Negative d1 flips inside/out
float opIntersect(float d1, float d2) { return max(d1, d2); }

float mapScene(vec3 p) {
  float d = 1e9; // Start with "infinity" distance
  gHitShape = -1;

  // We need to track the "current material" color separately
  // because blending operations gets tricky with colors. 
  // For now, we just track the ID of the closest surface.

  for (int i = 0; i < MAX_SHAPES; i++) {
    if (i >= uShapeCount) break;

    // --- Transform Space (Move/Rotate/Scale) ---
    vec3 q = p - uShapePos[i];
    vec4 rot = uShapeRot[i];
    vec4 invRot = vec4(-rot.xyz, rot.w);
    vec3 local = rotateVecByQuat(q, invRot);
    local /= uShapeScale[i];

    // --- Calculate Distance to THIS shape ---
    float sd = 1e9;
    if (uShapeType[i] == SHAPE_SPHERE)  sd = sdSphere(local, uShapeParams[i].x);
    if (uShapeType[i] == SHAPE_BOX)     sd = sdBox(local, uShapeParams[i].xyz, uShapeParams[i].w);
    if (uShapeType[i] == SHAPE_CYL)     sd = sdCylinder(local, uShapeParams[i].x, uShapeParams[i].y, uShapeParams[i].z);
    if (uShapeType[i] == SHAPE_CAPSULE) {
      vec3 a = vec3(0.0, -uShapeParams[i].y, 0.0);
      vec3 b = vec3(0.0,  uShapeParams[i].y, 0.0);
      sd = sdCapsule(local, a, b, uShapeParams[i].x);
    }
    if (uShapeType[i] == SHAPE_TORUS)   sd = sdTorus(local, uShapeParams[i].xy);

    // Apply Uniform Scale correction
    float scaleMin = min(uShapeScale[i].x, min(uShapeScale[i].y, uShapeScale[i].z));
    sd *= scaleMin;

    // --- Apply Boolean Operations ---
    if (i == 0) {
        // First shape always establishes the scene
        d = sd;
        gHitShape = 0; 
    } else {
        int op = uShapeOp[i];
        
        if (op == OP_UNION) {
            if (sd < d) gHitShape = i; // If new shape is closer, update ID
            d = opUnion(sd, d);
        } 
        else if (op == OP_SUBTRACT) {
            // If we are carving, the surface becomes the 'cutter'
            // Logic: if result is the cutter surface, update ID
            float newD = opSubtract(sd, d); // Note: Subtracting SD from D
            if (newD > d && newD == -sd) gHitShape = i; // Very rough approximation for color tracking
            d = newD;
        }
        else if (op == OP_INTERSECT) {
             float newD = opIntersect(sd, d);
             if (sd > d) gHitShape = i;
             d = newD;
        }
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
  mapScene(hitPos); // Recalculate to ensure gHitShape is correct
  int hitShape = gHitShape;

  vec3 normal = calcNormal(hitPos);
  vec3 lightDir = normalize(uLightDir);
  float diff = max(dot(normal, lightDir), 0.0);
  
  vec3 shapeColor = (hitShape >= 0 && hitShape < uShapeCount) 
    ? uShapeColor[hitShape] 
    : vec3(0.8, 0.8, 0.8);
  
  vec3 baseColor = shapeColor * (0.3 + 0.7 * diff);
  outColor = vec4(baseColor, 1.0);

  float encodedId = (hitShape >= 0) ? (float(hitShape) + 1.0) / 255.0 : 0.0;
  outMask = vec4(encodedId, 0.0, 0.0, 1.0);

  vec4 viewPos = uView * vec4(hitPos, 1.0);
  vec4 clipPos = uProj * viewPos;
  gl_FragDepth = clipPos.z / clipPos.w * 0.5 + 0.5;
}