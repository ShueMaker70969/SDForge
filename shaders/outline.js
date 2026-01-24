export const OUTLINE_VS = `#version 300 es
precision highp float;
out vec2 vUV;
void main() {
  vec2 p = vec2((gl_VertexID == 1) ? 3.0 : -1.0, (gl_VertexID == 2) ? 3.0 : -1.0);
  vUV = 0.5 * (p + 1.0);
  gl_Position = vec4(p, 0.0, 1.0);
}`;

export const OUTLINE_FS = `#version 300 es
precision highp float;

in vec2 vUV;
out vec4 outColor;

uniform sampler2D uSceneColor;
uniform sampler2D uSelMask;
uniform vec2 uTexel;
uniform vec3 uOutlineColor;       // Secondary (Yellow)
uniform vec3 uActiveOutlineColor; // Active (Orange)

uniform float uThickness;
uniform float uIdTolerance;
uniform float uActiveId;
uniform int uSelectedCount;
uniform float uSelectedIds[16];

// Morph Uniforms
uniform int uMorphActive;
uniform float uMorphIdA_Enc;
uniform float uMorphIdB_Enc;
uniform float uMorphIdC_Enc;

bool idMatches(float a, float b) { return abs(a - b) <= uIdTolerance; }

float findSelectedId(float value) {
  if (value <= 0.0) return -1.0;
  for (int i = 0; i < 16; i++) {
    if (i >= uSelectedCount) break;
    if (idMatches(value, uSelectedIds[i])) return uSelectedIds[i];
  }
  return -1.0;
}

void main() {
  vec4 base = texture(uSceneColor, vUV);
  float idValue = texture(uSelMask, vUV).r;
  float matchedId = findSelectedId(idValue);

  // If not selected, return base color
  if (matchedId < 0.0) {
    outColor = base;
    return;
  }

  // Check if this ID is part of the Morph Group
  bool isMorphTarget = false;
  if (uMorphActive > 0) {
      if (idMatches(idValue, uMorphIdA_Enc) || 
          idMatches(idValue, uMorphIdB_Enc) || 
          idMatches(idValue, uMorphIdC_Enc)) {
          isMorphTarget = true;
      }
  }

  // --- [FIXED] Edge Detection Logic ---
  float edge = 0.0;
  int t = int(max(1.0, uThickness));
  
  // Loop from -t to +t to check ALL neighbors within the radius
  for (int y = -t; y <= t; y++) {
    for (int x = -t; x <= t; x++) {
      // Skip the center pixel
      if (x == 0 && y == 0) continue;

      // Use uTexel directly, do NOT scale by 't' here
      vec2 uv = vUV + vec2(float(x), float(y)) * uTexel;
      float neighbor = texture(uSelMask, uv).r;
      
      // If a neighbor has a different ID, we are on an edge
      if (!idMatches(neighbor, matchedId)) {
        edge = 1.0;
        // Optimization: break out of inner loop
        break; 
      }
    }
    // Optimization: break out of outer loop
    if (edge > 0.5) break;
  }
  // ------------------------------------

  if (edge > 0.5) {
    vec3 finalColor;

    if (isMorphTarget) {
        // PRIORITY 1: Purple for Morph Targets
        finalColor = vec3(0.8, 0.2, 1.0); 
    } else {
        // PRIORITY 2: Orange/Yellow for standard selection
        bool isActive = (uActiveId > 0.0) && idMatches(idValue, uActiveId);
        finalColor = isActive ? uActiveOutlineColor : uOutlineColor;
    }
    
    outColor = vec4(finalColor, 1.0);
  } else {
    outColor = base;
  }
}
`;