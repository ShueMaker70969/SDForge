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

// --- Morph Helper ---
uniform float uMorphT;

float opMorph(float d1, float d2, float t) {
    return mix(d1, d2, clamp(t, 0.0, 1.0));
}

// --- Constants ---
#define MAX_SHAPES 16
#define SHAPE_SPHERE 0
#define SHAPE_BOX 1
#define SHAPE_CYL 2
#define SHAPE_CAPSULE 3
#define SHAPE_TORUS 4
#define MAX_BOOLEAN_OPS 4
#define BOOLEAN_OP_UNION 0
#define BOOLEAN_OP_SUBTRACT 1
#define BOOLEAN_OP_INTERSECT 2
#define BOOLEAN_OP_SMOOTH_UNION 3

uniform int  uShapeCount;
uniform vec3 uShapePos[MAX_SHAPES];
uniform vec4 uShapeRot[MAX_SHAPES];
uniform int  uShapeType[MAX_SHAPES];
uniform vec4 uShapeParams[MAX_SHAPES];
uniform vec3 uShapeScale[MAX_SHAPES];
uniform vec3 uShapeColor[MAX_SHAPES];
uniform int  uBooleanCount[MAX_SHAPES];
uniform int  uBooleanOp[MAX_SHAPES * MAX_BOOLEAN_OPS];
uniform int  uBooleanShapeType[MAX_SHAPES * MAX_BOOLEAN_OPS];
uniform vec3 uBooleanPos[MAX_SHAPES * MAX_BOOLEAN_OPS];
uniform vec4 uBooleanRot[MAX_SHAPES * MAX_BOOLEAN_OPS];
uniform vec3 uBooleanScale[MAX_SHAPES * MAX_BOOLEAN_OPS];
uniform vec4 uBooleanParams[MAX_SHAPES * MAX_BOOLEAN_OPS];
uniform float uBooleanSmooth[MAX_SHAPES * MAX_BOOLEAN_OPS];

// --- Primitives ---
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

float evalPrimitive(int type, vec3 local, vec4 params) {
  if (type == SHAPE_SPHERE) return sdSphere(local, params.x);
  if (type == SHAPE_BOX)    return sdBox(local, params.xyz, params.w);
  if (type == SHAPE_CYL)    return sdCylinder(local, params.x, params.y, params.z);
  if (type == SHAPE_CAPSULE) {
    vec3 a = vec3(0.0, -params.y, 0.0);
    vec3 b = vec3(0.0,  params.y, 0.0);
    return sdCapsule(local, a, b, params.x);
  }
  if (type == SHAPE_TORUS)  return sdTorus(local, params.xy);
  return 1e9;
}

// --- Booleans ---
float evaluateBooleanPrimitive(int shapeIndex, vec3 parentLocal, int slot) {
  int globalIndex = shapeIndex * MAX_BOOLEAN_OPS + slot;
  int type = uBooleanShapeType[globalIndex];
  vec3 childPos = uBooleanPos[globalIndex];
  vec4 childRot = uBooleanRot[globalIndex];
  vec3 childScale = uBooleanScale[globalIndex];
  vec4 params = uBooleanParams[globalIndex];

  vec3 q = parentLocal - childPos;
  vec4 invRot = vec4(-childRot.xyz, childRot.w);
  vec3 local = rotateVecByQuat(q, invRot);
  local /= childScale;

  float sd = evalPrimitive(type, local, params);
  float scaleMin = min(childScale.x, min(childScale.y, childScale.z));
  return sd * scaleMin;
}

float smoothUnion(float d1, float d2, float k) {
  if (k <= 0.0) return min(d1, d2);
  float h = clamp(0.5 + 0.5 * (d2 - d1) / k, 0.0, 1.0);
  return mix(d2, d1, h) - k * h * (1.0 - h);
}

float applyBooleanOps(int shapeIndex, vec3 local, float baseSd) {
  int count = uBooleanCount[shapeIndex];
  float result = baseSd;
  for (int j = 0; j < MAX_BOOLEAN_OPS; j++) {
    if (j >= count) break;
    int globalIndex = shapeIndex * MAX_BOOLEAN_OPS + j;
    int op = uBooleanOp[globalIndex];
    if (op < 0) continue;
    float childSd = evaluateBooleanPrimitive(shapeIndex, local, j);
    
    if (op == BOOLEAN_OP_UNION) result = min(result, childSd);
    else if (op == BOOLEAN_OP_SUBTRACT) result = max(result, -childSd);
    else if (op == BOOLEAN_OP_INTERSECT) result = max(result, childSd);
    else if (op == BOOLEAN_OP_SMOOTH_UNION) result = smoothUnion(result, childSd, uBooleanSmooth[globalIndex]);
  }
  return result;
}

// --- OPTIMIZED MAP SCENE ---
float mapScene(vec3 p) {
    float d = 1e9;
    gHitShape = -1;
    
    // Store d0 across loop iterations
    float d0_store = 1e9; 
    
    // Only morph if slider is moved AND we have >1 shape
    bool doMorph = (uMorphT > 0.01 && uShapeCount > 1);

    for (int i = 0; i < MAX_SHAPES; i++) {
        if (i >= uShapeCount) break;

        // 1. Standard Geometry Calculations (Same as original)
        vec3 q = p - uShapePos[i];
        vec4 rot = uShapeRot[i];
        vec3 local = rotateVecByQuat(q, vec4(-rot.xyz, rot.w));
        local /= uShapeScale[i];

        float sd = evalPrimitive(uShapeType[i], local, uShapeParams[i]);
        float scaleMin = min(uShapeScale[i].x, min(uShapeScale[i].y, uShapeScale[i].z));
        sd *= scaleMin;
        
        // 2. Standard Boolean Logic (Same as original)
        sd = applyBooleanOps(i, local, sd);

        // 3. MORPH LOGIC (Tiny injection)
        if (doMorph) {
            if (i == 0) {
                d0_store = sd; // Save Shape 0, don't display yet
                continue;      
            }
            if (i == 1) {
                // Morph Shape 0 (stored) and Shape 1 (current)
                sd = opMorph(d0_store, sd, uMorphT);
                
                // Visual Color Hack
                if (sd < d) {
                    d = sd;
                    gHitShape = (uMorphT < 0.5) ? 0 : 1;
                }
                continue; // We handled the update manually
            }
        }

        // 4. Standard Union
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
  mapScene(hitPos); // update gHitShape
  
  vec3 normal = calcNormal(hitPos);
  vec3 lightDir = normalize(uLightDir);
  float diff = max(dot(normal, lightDir), 0.0);
  
  vec3 shapeColor = (gHitShape >= 0 && gHitShape < uShapeCount) 
    ? uShapeColor[gHitShape] 
    : vec3(0.8);
  
  outColor = vec4(shapeColor * (0.3 + 0.7 * diff), 1.0);
  
  float encodedId = (gHitShape >= 0) ? (float(gHitShape) + 1.0) / 255.0 : 0.0;
  outMask = vec4(encodedId, 0.0, 0.0, 1.0);
  
  vec4 viewPos = uView * vec4(hitPos, 1.0);
  vec4 clipPos = uProj * viewPos;
  gl_FragDepth = clipPos.z / clipPos.w * 0.5 + 0.5;
}