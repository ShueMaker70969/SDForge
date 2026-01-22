export const vsSource = `
attribute vec3 aPosition;
attribute vec3 aColor;
uniform mat4 uView;
uniform mat4 uProj;
varying vec3 vColor;
void main() {
  vColor = aColor;
  gl_Position = uProj * uView * vec4(aPosition, 1.0);
}
`;

export const fsSource = `
precision mediump float;
varying vec3 vColor;
void main() {
  gl_FragColor = vec4(vColor, 1.0);
}
`;