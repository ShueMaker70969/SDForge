export const SDF_VS = `#version 300 es
precision highp float;
const vec2 verts[3] = vec2[](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
out vec2 vUV;
void main() { gl_Position = vec4(verts[gl_VertexID], 0.0, 1.0); vUV = gl_Position.xy * 0.5 + 0.5; }`

export const SDF_FS = `#version 300 es
precision highp float;
in vec2 vUV;
layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outMask;

// --- GLOBAL HIT VARIABLE ---
int gHitShape = -1;

// --- UNIFORMS ---
uniform vec3 uCameraPos;
uniform mat4 uView, uProj, uInvView, uInvProj;
uniform vec3 uLightDir;
uniform float uAOIntensity;

// --- MORPH UNIFORMS ---
uniform float uMorphT;       
uniform float uMorphT2;      
uniform int uMorphIdA; 
uniform int uMorphIdB; 
uniform int uMorphIdC;       

// --- LIGHTS ---
#define MAX_POINT_LIGHTS 4
uniform int uPointLightCount;
uniform vec3 uPointLightPos[MAX_POINT_LIGHTS];
uniform vec3 uPointLightColor[MAX_POINT_LIGHTS];
uniform float uPointLightIntensity[MAX_POINT_LIGHTS];
uniform float uPointLightRadius[MAX_POINT_LIGHTS];
uniform int uAreaLightEnabled;
uniform vec3 uAreaLightPos, uAreaLightColor, uAreaLightRight, uAreaLightUp;
uniform float uAreaLightIntensity;
uniform vec2 uAreaLightSize;

// --- SHAPES ---
#define MAX_SHAPES 16
#define MAX_BOOLEAN_OPS 4
#define SHAPE_SPHERE 0
#define SHAPE_BOX 1
#define SHAPE_CYL 2
#define SHAPE_CAPSULE 3
#define SHAPE_TORUS 4
#define SHAPE_CONE 5
#define SHAPE_OCTAHEDRON 6
#define BOOLEAN_OP_UNION 0
#define BOOLEAN_OP_SUBTRACT 1
#define BOOLEAN_OP_INTERSECT 2
#define BOOLEAN_OP_SMOOTH_UNION 3

uniform int uShapeCount;
uniform vec3 uShapePos[MAX_SHAPES];
uniform vec4 uShapeRot[MAX_SHAPES];
uniform int uShapeType[MAX_SHAPES];
uniform vec4 uShapeParams[MAX_SHAPES];
uniform vec3 uShapeScale[MAX_SHAPES];
uniform vec3 uShapeColor[MAX_SHAPES];
uniform int uBooleanCount[MAX_SHAPES];
uniform int uBooleanOp[MAX_SHAPES * MAX_BOOLEAN_OPS];
uniform int uBooleanShapeType[MAX_SHAPES * MAX_BOOLEAN_OPS];
uniform vec3 uBooleanPos[MAX_SHAPES * MAX_BOOLEAN_OPS];
uniform vec4 uBooleanRot[MAX_SHAPES * MAX_BOOLEAN_OPS];
uniform vec3 uBooleanScale[MAX_SHAPES * MAX_BOOLEAN_OPS];
uniform vec4 uBooleanParams[MAX_SHAPES * MAX_BOOLEAN_OPS];
uniform float uBooleanSmooth[MAX_SHAPES * MAX_BOOLEAN_OPS];

// --- MATH ---
const float PI = 3.14159265359;
const float EPSILON = 0.0001;

float opMorph(float d1, float d2, float t) {
    return mix(d1, d2, clamp(t, 0.0, 1.0));
}

vec3 rotateVecByQuat(vec3 v, vec4 q) {
    vec3 t = 2.0 * cross(q.xyz, v);
    return v + q.w * t + cross(q.xyz, t);
}

// Primitives
float sdSphere(vec3 p, float r) { return length(p) - r; }
float sdBox(vec3 p, vec3 b, float r) { vec3 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r; }
float sdCylinder(vec3 p, float r, float h, float rounding) { vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r - rounding, h - rounding); return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - rounding; }
float sdCapsule(vec3 p, vec3 a, vec3 b, float r) { vec3 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h) - r; }
float sdTorus(vec3 p, vec2 t) { vec2 q = vec2(length(p.xz) - t.x, p.y); return length(q) - t.y; }
float sdCone(vec3 p, float r, float h) { float ri = max(r, 0.001); float hi = max(h, 0.001); p.y -= hi * 0.5; vec2 q = hi * vec2(ri / hi, -1.0); vec2 w = vec2(length(p.xz), p.y); vec2 a = w - q * clamp(dot(w, q) / dot(q, q), 0.0, 1.0); vec2 b = w - q * vec2(clamp(w.x / q.x, 0.0, 1.0), 1.0); float k = sign(q.y); float d = min(dot(a, a), dot(b, b)); float s = max(k * (w.x * q.y - w.y * q.x), k * (w.y - q.y)); return sqrt(d) * sign(s); }
float sdOctahedron(vec3 p, float s, float rounding) { float si = max(s - rounding * 1.73205081, 0.001); p = abs(p); float m = p.x + p.y + p.z - si; vec3 q; if (3.0 * p.x < m) q = p.xyz; else if (3.0 * p.y < m) q = p.yzx; else if (3.0 * p.z < m) q = p.zxy; else return m * 0.57735027 - rounding; float k = clamp(0.5 * (q.z - q.y + si), 0.0, si); return length(vec3(q.x, q.y - si + k, q.z - k)) - rounding; }

float evalPrimitive(int type, vec3 local, vec4 params) {
  if (type == SHAPE_SPHERE) return sdSphere(local, params.x);
  if (type == SHAPE_BOX)    return sdBox(local, params.xyz, params.w);
  if (type == SHAPE_CYL)    return sdCylinder(local, params.x, params.y, params.z);
  if (type == SHAPE_CAPSULE) { vec3 a = vec3(0.0, -params.y, 0.0); vec3 b = vec3(0.0,  params.y, 0.0); return sdCapsule(local, a, b, params.x); }
  if (type == SHAPE_TORUS)  return sdTorus(local, params.xy);
  if (type == SHAPE_CONE)   return sdCone(local, params.x, params.y);
  if (type == SHAPE_OCTAHEDRON) return sdOctahedron(local, params.x, params.y);
  return 1e9;
}

float evaluateBooleanPrimitive(int shapeIndex, vec3 parentLocal, int slot) {
  int globalIndex = shapeIndex * MAX_BOOLEAN_OPS + slot;
  vec3 q = parentLocal - uBooleanPos[globalIndex];
  vec4 invRot = vec4(-uBooleanRot[globalIndex].xyz, uBooleanRot[globalIndex].w);
  vec3 local = rotateVecByQuat(q, invRot) / uBooleanScale[globalIndex];
  return evalPrimitive(uBooleanShapeType[globalIndex], local, uBooleanParams[globalIndex]) * min(uBooleanScale[globalIndex].x, min(uBooleanScale[globalIndex].y, uBooleanScale[globalIndex].z));
}
float smoothUnion(float d1, float d2, float k) { if (k <= 0.0) return min(d1, d2); float h = clamp(0.5 + 0.5 * (d2 - d1) / k, 0.0, 1.0); return mix(d2, d1, h) - k * h * (1.0 - h); }
float applyBooleanOps(int i, vec3 p, float d) {
  for (int j=0; j<MAX_BOOLEAN_OPS; j++) {
    if (j >= uBooleanCount[i]) break;
    int idx = i*MAX_BOOLEAN_OPS+j; int op = uBooleanOp[idx]; if(op<0) continue;
    float cd = evaluateBooleanPrimitive(i, p, j);
    if(op==0) d=min(d,cd); else if(op==1) d=max(d,-cd); else if(op==2) d=max(d,cd); else if(op==3) d=smoothUnion(d,cd,uBooleanSmooth[idx]);
  }
  return d;
}

// --- TRI-MORPH MAP SCENE ---
float mapScene(vec3 p) {
    float d = 1e9;
    gHitShape = -1; // Reset GLOBAL hit variable
    
    float dA = 1e9, dB = 1e9, dC = 1e9;
    bool activeMorph = (uMorphIdA >= 0 && uMorphIdB >= 0);
    bool triMorph = (activeMorph && uMorphIdC >= 0);

    for (int i = 0; i < MAX_SHAPES; i++) {
        if (i >= uShapeCount) break;

        vec3 q = p - uShapePos[i];
        vec4 rot = uShapeRot[i];
        vec3 local = rotateVecByQuat(q, vec4(-rot.xyz, rot.w)) / uShapeScale[i];
        float sd = evalPrimitive(uShapeType[i], local, uShapeParams[i]) * min(uShapeScale[i].x, min(uShapeScale[i].y, uShapeScale[i].z));
        sd = applyBooleanOps(i, local, sd);

        if (activeMorph) {
            if (i == uMorphIdA) { dA = sd; continue; }
            if (i == uMorphIdB) { dB = sd; continue; }
            if (triMorph && i == uMorphIdC) { dC = sd; continue; }
        }

        if (sd < d) { d = sd; gHitShape = i; }
    }

    if (activeMorph) {
        float dStage1 = opMorph(dA, dB, uMorphT);
        float dFinal = dStage1;
        
        if (triMorph) {
            dFinal = opMorph(dStage1, dC, uMorphT2);
        }

        if (dFinal < d) { 
            d = dFinal; 
            gHitShape = uMorphIdA; 
        }
    }
    
    return d;
}

float mapSceneSimple(vec3 p) {
    return mapScene(p);
}

// Lighting & Helper Functions
vec3 calcNormalTetrahedral(vec3 p) { 
    const float h=0.0005; 
    const vec3 k0=vec3(1,-1,-1), k1=vec3(-1,-1,1), k2=vec3(-1,1,-1), k3=vec3(1,1,1); 
    // IMPORTANT: Use Simple map here so we don't care about hit ID
    return normalize(k0*mapSceneSimple(p+k0*h)+k1*mapSceneSimple(p+k1*h)+k2*mapSceneSimple(p+k2*h)+k3*mapSceneSimple(p+k3*h)); 
}

float calcSoftShadow(vec3 ro, vec3 rd, float mint, float maxt, float k) {
  float shadow = 1.0;
  float t = mint;
  float ph = 1e10;
  for (int i = 0; i < 32; i++) {
    if (t >= maxt) break;
    float h = mapSceneSimple(ro + rd * t);
    if (h < EPSILON) return 0.0;
    float y = h * h / (2.0 * ph);
    float dist = sqrt(h * h - y * y);
    shadow = min(shadow, k * dist / max(0.0, t - y));
    ph = h;
    t += clamp(h, 0.01, 0.5);
  }
  return clamp(shadow, 0.0, 1.0);
}

float calcAO(vec3 p, vec3 n) { 
    float o=0.0, s=1.0; 
    for(int i=0;i<5;i++){ 
        float h=0.01+0.12*float(i)/4.0; 
        float d=mapSceneSimple(p+h*n); 
        o+=(h-d)*s; s*=0.95; 
    } 
    return clamp(1.0-3.0*o*uAOIntensity,0.0,1.0); 
}

void main() {
  vec2 ndc = vUV * 2.0 - 1.0;
  vec4 rayView = uInvProj * vec4(ndc, -1.0, 1.0);
  vec4 rayWorld = uInvView * vec4(rayView.xy, -1.0, 0.0);
  vec3 ro = uCameraPos;
  vec3 rd = normalize(rayWorld.xyz);

  float t = 0.0;
  bool hit = false;
  
  // 1. PRIMARY RAYMARCH
  for(int i=0; i<128; i++) {
    vec3 p = ro + rd * t;
    float d = mapScene(p); // This sets gHitShape
    if(d < 0.001) { hit = true; break; }
    if(t > 100.0) break;
    t += d;
  }

  if(!hit) discard;
  
  // 2. [FIX] SAVE THE HIT ID NOW!
  // Before we calculate normals/AO (which will corrupt gHitShape), save it.
  int primaryHitShape = gHitShape;

  vec3 p = ro + rd * t;
  
  // These functions call mapScene, which will overwrite gHitShape with garbage
  vec3 N = calcNormalTetrahedral(p);
  float ao = calcAO(p, N);
  
  float diff = max(dot(N, uLightDir), 0.0);
  vec3 col = vec3(0.8) * diff * ao + vec3(0.1) * ao;
  
  outColor = vec4(col, 1.0);
  
  // 3. USE THE SAVED ID FOR OUTPUT
  float encodedId = (primaryHitShape >= 0) ? (float(primaryHitShape) + 1.0) / 255.0 : 0.0;
  outMask = vec4(encodedId, 0.0, 0.0, 1.0);
  
  vec4 viewPos = uView * vec4(p, 1.0);
  vec4 clipPos = uProj * viewPos;
  gl_FragDepth = clipPos.z / clipPos.w * 0.5 + 0.5;
}
`;