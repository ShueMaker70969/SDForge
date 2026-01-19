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

// --- PBR Material uniforms ---
uniform float uAOIntensity;

// --- Point lights (up to 4) ---
#define MAX_POINT_LIGHTS 4
uniform int uPointLightCount;
uniform vec3 uPointLightPos[MAX_POINT_LIGHTS];
uniform vec3 uPointLightColor[MAX_POINT_LIGHTS];
uniform float uPointLightIntensity[MAX_POINT_LIGHTS];
uniform float uPointLightRadius[MAX_POINT_LIGHTS];

// --- Area light ---
uniform int uAreaLightEnabled;
uniform vec3 uAreaLightPos;
uniform vec3 uAreaLightColor;
uniform float uAreaLightIntensity;
uniform vec3 uAreaLightRight;
uniform vec3 uAreaLightUp;
uniform vec2 uAreaLightSize;

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

const float PI = 3.14159265359;
const float EPSILON = 0.0001;

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

// --- OPTIMIZED MAP SCENE with Morph ---
float mapScene(vec3 p) {
    float d = 1e9;
    gHitShape = -1;
    
    float d0_store = 1e9; 
    bool doMorph = (uMorphT > 0.01 && uShapeCount > 1);

    for (int i = 0; i < MAX_SHAPES; i++) {
        if (i >= uShapeCount) break;

        vec3 q = p - uShapePos[i];
        vec4 rot = uShapeRot[i];
        vec3 local = rotateVecByQuat(q, vec4(-rot.xyz, rot.w));
        local /= uShapeScale[i];

        float sd = evalPrimitive(uShapeType[i], local, uShapeParams[i]);
        float scaleMin = min(uShapeScale[i].x, min(uShapeScale[i].y, uShapeScale[i].z));
        sd *= scaleMin;
        sd = applyBooleanOps(i, local, sd);

        if (doMorph) {
            if (i == 0) {
                d0_store = sd;
                continue;      
            }
            if (i == 1) {
                sd = opMorph(d0_store, sd, uMorphT);
                if (sd < d) {
                    d = sd;
                    gHitShape = (uMorphT < 0.5) ? 0 : 1;
                }
                continue;
            }
        }

        if (sd < d) {
            d = sd;
            gHitShape = i;
        }
    }
    return d;
}

// Scene map without shape tracking (for shadow/AO rays)
float mapSceneSimple(vec3 p) {
    float d = 1e9;
    float d0_store = 1e9;
    bool doMorph = (uMorphT > 0.01 && uShapeCount > 1);

    for (int i = 0; i < MAX_SHAPES; i++) {
        if (i >= uShapeCount) break;

        vec3 q = p - uShapePos[i];
        vec4 rot = uShapeRot[i];
        vec3 local = rotateVecByQuat(q, vec4(-rot.xyz, rot.w));
        local /= uShapeScale[i];

        float sd = evalPrimitive(uShapeType[i], local, uShapeParams[i]);
        float scaleMin = min(uShapeScale[i].x, min(uShapeScale[i].y, uShapeScale[i].z));
        sd *= scaleMin;
        sd = applyBooleanOps(i, local, sd);

        if (doMorph) {
            if (i == 0) { d0_store = sd; continue; }
            if (i == 1) { sd = opMorph(d0_store, sd, uMorphT); }
        }

        d = min(d, sd);
    }
    return d;
}

// ==================== Tetrahedral Normal Calculation ====================
vec3 calcNormalTetrahedral(vec3 p) {
  const float h = 0.0005;
  const vec3 k0 = vec3( 1.0, -1.0, -1.0);
  const vec3 k1 = vec3(-1.0, -1.0,  1.0);
  const vec3 k2 = vec3(-1.0,  1.0, -1.0);
  const vec3 k3 = vec3( 1.0,  1.0,  1.0);
  
  return normalize(
    k0 * mapSceneSimple(p + k0 * h) +
    k1 * mapSceneSimple(p + k1 * h) +
    k2 * mapSceneSimple(p + k2 * h) +
    k3 * mapSceneSimple(p + k3 * h)
  );
}

// ==================== SDF Soft Shadows ====================
float calcSoftShadow(vec3 ro, vec3 rd, float mint, float maxt, float k) {
  float shadow = 1.0;
  float t = mint;
  float ph = 1e10;
  
  for (int i = 0; i < 64; i++) {
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

// ==================== SDF Ambient Occlusion ====================
float calcAO(vec3 pos, vec3 nor) {
  float occ = 0.0;
  float sca = 1.0;
  for (int i = 0; i < 5; i++) {
    float h = 0.01 + 0.12 * float(i) / 4.0;
    float d = mapSceneSimple(pos + h * nor);
    occ += (h - d) * sca;
    sca *= 0.95;
  }
  return clamp(1.0 - 3.0 * occ * uAOIntensity, 0.0, 1.0);
}

// ==================== PBR Functions ====================
vec3 fresnelSchlick(float cosTheta, vec3 F0) {
  return F0 + (1.0 - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

vec3 fresnelSchlickRoughness(float cosTheta, vec3 F0) {
  const float roughness = 0.5;
  return F0 + (max(vec3(1.0 - roughness), F0) - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

float distributionGGX(vec3 N, vec3 H, float roughness) {
  float a = roughness * roughness;
  float a2 = a * a;
  float NdotH = max(dot(N, H), 0.0);
  float NdotH2 = NdotH * NdotH;
  float num = a2;
  float denom = (NdotH2 * (a2 - 1.0) + 1.0);
  denom = PI * denom * denom;
  return num / denom;
}

float geometrySchlickGGX(float NdotV, float roughness) {
  float r = (roughness + 1.0);
  float k = (r * r) / 8.0;
  float num = NdotV;
  float denom = NdotV * (1.0 - k) + k;
  return num / denom;
}

float geometrySmith(vec3 N, vec3 V, vec3 L, float roughness) {
  float NdotV = max(dot(N, V), 0.0);
  float NdotL = max(dot(N, L), 0.0);
  float ggx2 = geometrySchlickGGX(NdotV, roughness);
  float ggx1 = geometrySchlickGGX(NdotL, roughness);
  return ggx1 * ggx2;
}

// ==================== Point Light ====================
vec3 calcPointLight(vec3 pos, vec3 N, vec3 V, vec3 albedo,
                    vec3 lightPos, vec3 lightColor, float intensity, float radius) {
  const float roughness = 0.5;
  const float metallic = 0.0;
  vec3 L = lightPos - pos;
  float distance = length(L);
  L = normalize(L);
  vec3 H = normalize(V + L);
  
  float attenuation = intensity / (distance * distance + 0.01);
  if (radius > 0.0) {
    float falloff = 1.0 - smoothstep(radius * 0.5, radius, distance);
    attenuation *= falloff;
  }
  
  vec3 radiance = lightColor * attenuation;
  float shadow = calcSoftShadow(pos, L, 0.02, distance, 32.0);
  
  vec3 F0 = vec3(0.04);
  F0 = mix(F0, albedo, metallic);
  
  float NDF = distributionGGX(N, H, roughness);
  float G = geometrySmith(N, V, L, roughness);
  vec3 F = fresnelSchlick(max(dot(H, V), 0.0), F0);
  
  vec3 kS = F;
  vec3 kD = vec3(1.0) - kS;
  kD *= 1.0 - metallic;
  
  vec3 numerator = NDF * G * F;
  float denominator = 4.0 * max(dot(N, V), 0.0) * max(dot(N, L), 0.0) + 0.0001;
  vec3 specular = numerator / denominator;
  
  float NdotL = max(dot(N, L), 0.0);
  return (kD * albedo / PI + specular) * radiance * NdotL * shadow;
}

// ==================== Area Light ====================
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec3 calcAreaLight(vec3 pos, vec3 N, vec3 V, vec3 albedo,
                   vec3 lightPos, vec3 lightColor, float intensity, 
                   vec3 lightRight, vec3 lightUp, vec2 lightSize) {
  const float roughness = 0.5;
  const float metallic = 0.0;
  vec3 Lo = vec3(0.0);
  const int SAMPLES = 4;
  float sampleWeight = 1.0 / float(SAMPLES * SAMPLES);
  
  vec3 F0 = vec3(0.04);
  F0 = mix(F0, albedo, metallic);
  
  for (int i = 0; i < SAMPLES; i++) {
    for (int j = 0; j < SAMPLES; j++) {
      vec2 uv = vec2(
        (float(i) + hash(pos.xy + float(i))) / float(SAMPLES) - 0.5,
        (float(j) + hash(pos.yz + float(j))) / float(SAMPLES) - 0.5
      );
      
      vec3 samplePos = lightPos + lightRight * uv.x * lightSize.x + lightUp * uv.y * lightSize.y;
      vec3 L = samplePos - pos;
      float distance = length(L);
      L = normalize(L);
      vec3 H = normalize(V + L);
      
      float attenuation = intensity / (distance * distance + 1.0);
      vec3 lightNormal = normalize(cross(lightRight, lightUp));
      float facing = max(0.0, dot(-L, lightNormal));
      attenuation *= facing;
      
      vec3 radiance = lightColor * attenuation;
      float shadow = calcSoftShadow(pos, L, 0.02, distance, 16.0);
      
      float NDF = distributionGGX(N, H, roughness);
      float G = geometrySmith(N, V, L, roughness);
      vec3 F = fresnelSchlick(max(dot(H, V), 0.0), F0);
      
      vec3 kS = F;
      vec3 kD = vec3(1.0) - kS;
      kD *= 1.0 - metallic;
      
      vec3 numerator = NDF * G * F;
      float denominator = 4.0 * max(dot(N, V), 0.0) * max(dot(N, L), 0.0) + 0.0001;
      vec3 specular = numerator / denominator;
      
      float NdotL = max(dot(N, L), 0.0);
      Lo += (kD * albedo / PI + specular) * radiance * NdotL * shadow * sampleWeight;
    }
  }
  return Lo;
}

// ==================== Directional Light (Sun) ====================
vec3 calcDirectionalLight(vec3 pos, vec3 N, vec3 V, vec3 albedo, vec3 lightDir) {
  const float roughness = 0.5;
  const float metallic = 0.0;
  vec3 L = normalize(lightDir);
  vec3 H = normalize(V + L);
  vec3 radiance = vec3(1.0, 0.98, 0.95) * 2.0;
  
  float shadow = calcSoftShadow(pos, L, 0.02, 50.0, 32.0);
  
  vec3 F0 = vec3(0.04);
  F0 = mix(F0, albedo, metallic);
  
  float NDF = distributionGGX(N, H, roughness);
  float G = geometrySmith(N, V, L, roughness);
  vec3 F = fresnelSchlick(max(dot(H, V), 0.0), F0);
  
  vec3 kS = F;
  vec3 kD = vec3(1.0) - kS;
  kD *= 1.0 - metallic;
  
  vec3 numerator = NDF * G * F;
  float denominator = 4.0 * max(dot(N, V), 0.0) * max(dot(N, L), 0.0) + 0.0001;
  vec3 specular = numerator / denominator;
  
  float NdotL = max(dot(N, L), 0.0);
  return (kD * albedo / PI + specular) * radiance * NdotL * shadow;
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
  mapScene(hitPos);
  int hitShape = gHitShape;

  vec3 N = calcNormalTetrahedral(hitPos);
  vec3 V = normalize(uCameraPos - hitPos);
  
  vec3 albedo = (hitShape >= 0 && hitShape < uShapeCount) 
    ? uShapeColor[hitShape] 
    : vec3(0.8);
  
  float ao = calcAO(hitPos, N);
  
  vec3 Lo = vec3(0.0);
  
  // Directional light (sun)
  Lo += calcDirectionalLight(hitPos, N, V, albedo, uLightDir);
  
  // Point lights
  for (int i = 0; i < MAX_POINT_LIGHTS; i++) {
    if (i >= uPointLightCount) break;
    Lo += calcPointLight(hitPos, N, V, albedo,
      uPointLightPos[i], uPointLightColor[i], uPointLightIntensity[i], uPointLightRadius[i]);
  }
  
  // Area light
  if (uAreaLightEnabled > 0) {
    Lo += calcAreaLight(hitPos, N, V, albedo,
      uAreaLightPos, uAreaLightColor, uAreaLightIntensity,
      uAreaLightRight, uAreaLightUp, uAreaLightSize);
  }
  
  // Ambient (fixed roughness=0.5, metallic=0.0)
  const float roughness = 0.5;
  const float metallic = 0.0;
  vec3 F0 = vec3(0.04);
  F0 = mix(F0, albedo, metallic);
  vec3 kS = fresnelSchlickRoughness(max(dot(N, V), 0.0), F0);
  vec3 kD = 1.0 - kS;
  kD *= 1.0 - metallic;
  
  vec3 ambient = kD * albedo * vec3(0.03, 0.04, 0.05) * ao;
  float skyAmount = max(0.0, N.y * 0.5 + 0.5);
  ambient += albedo * vec3(0.1, 0.12, 0.15) * skyAmount * ao * 0.3;
  
  vec3 color = ambient + Lo;
  
  // Tone mapping (ACES)
  color = color / (color + vec3(1.0));
  color = pow(color, vec3(1.0 / 2.2));
  
  outColor = vec4(color, 1.0);
  
  float encodedId = (hitShape >= 0) ? (float(hitShape) + 1.0) / 255.0 : 0.0;
  outMask = vec4(encodedId, 0.0, 0.0, 1.0);
  
  vec4 viewPos = uView * vec4(hitPos, 1.0);
  vec4 clipPos = uProj * viewPos;
  gl_FragDepth = clipPos.z / clipPos.w * 0.5 + 0.5;
}
