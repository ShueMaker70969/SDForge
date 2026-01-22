export const OUTLINE_VS = `#version 300 es
precision highp float;

out vec2 vUV;

// Fullscreen triangle (no VBO needed)
void main() {
  // gl_VertexID: 0,1,2
  vec2 p = vec2(
    (gl_VertexID == 1) ? 3.0 : -1.0,
    (gl_VertexID == 2) ? 3.0 : -1.0
  );
  vUV = 0.5 * (p + 1.0);
  gl_Position = vec4(p, 0.0, 1.0);
}
`;

export const OUTLINE_FS = `#version 300 es
precision highp float;

in vec2 vUV;
out vec4 outColor;

uniform sampler2D uSceneColor;
uniform sampler2D uSelMask;

uniform vec2 uTexel;        // (1/width, 1/height)
uniform vec3 uOutlineColor; // selection color
uniform vec3 uActiveOutlineColor;
uniform float uThickness;   // e.g. 2.0
uniform float uIdTolerance;
uniform float uActiveId;
uniform int uSelectedCount;
uniform float uSelectedIds[16];

bool idMatches(float a, float b) {
  return abs(a - b) <= uIdTolerance;
}

float findSelectedId(float value) {
  if (value <= 0.0) {
    return -1.0;
  }
  for (int i = 0; i < 16; i++) {
    if (i >= uSelectedCount) break;
    if (idMatches(value, uSelectedIds[i])) {
      return uSelectedIds[i];
    }
  }
  return -1.0;
}

void main() {
  vec4 base = texture(uSceneColor, vUV);
  float idValue = texture(uSelMask, vUV).r;
  float matchedId = findSelectedId(idValue);

  if (matchedId < 0.0) {
    outColor = base;
    return;
  }

  bool isActive = (uActiveId > 0.0) && idMatches(idValue, uActiveId);

  float edge = 0.0;
  int t = int(max(1.0, uThickness));

  for (int y = -6; y <= 6; y++) {
    for (int x = -6; x <= 6; x++) {
      if (abs(x) > t || abs(y) > t) continue;
      vec2 uv = vUV + vec2(float(x), float(y)) * uTexel;
      float neighbor = texture(uSelMask, uv).r;
      if (!idMatches(neighbor, matchedId)) {
        edge = 1.0;
      }
    }
  }

  if (edge > 0.5) {
    vec3 color = isActive ? uActiveOutlineColor : uOutlineColor;
    outColor = vec4(color, 1.0);
  } else {
    outColor = base;
  }
}
`;