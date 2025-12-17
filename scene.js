// scene.js

// Uses mat4/vec3 globals from gl-matrix (loaded in index.html)

// All geometry uses the same interleaved layout:
// [x, y, z, r, g, b] → stride = 6 * 4 bytes

export function createPlane(gl, size = 5.0) {
  const positions = new Float32Array([
    -size, 0.0, -size,
     size, 0.0, -size,
     size, 0.0,  size,

    -size, 0.0, -size,
     size, 0.0,  size,
    -size, 0.0,  size,
  ]);

  const colors = new Float32Array([
    0.15, 0.15, 0.18,
    0.15, 0.15, 0.18,
    0.15, 0.15, 0.18,
    0.15, 0.15, 0.18,
    0.15, 0.15, 0.18,
    0.15, 0.15, 0.18,
  ]);

  const interleaved = new Float32Array(positions.length / 3 * 6);
  for (let i = 0; i < positions.length / 3; i++) {
    interleaved[i * 6 + 0] = positions[i * 3 + 0];
    interleaved[i * 6 + 1] = positions[i * 3 + 1];
    interleaved[i * 6 + 2] = positions[i * 3 + 2];
    interleaved[i * 6 + 3] = colors[i * 3 + 0];
    interleaved[i * 6 + 4] = colors[i * 3 + 1];
    interleaved[i * 6 + 5] = colors[i * 3 + 2];
  }

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, interleaved, gl.STATIC_DRAW);

  return { buffer, count: 6 };
}

export function createGrid(gl, size = 5.0, divisions = 20) {
  const positions = [];
  const colors = [];
  const step = (size * 2) / divisions;
  const half = size;

  // Lines parallel to Z
  for (let i = 0; i <= divisions; i++) {
    const x = -half + step * i;
    positions.push(x, 0, -half, x, 0, half);
    const isCenter = Math.abs(x) < 1e-6;
    const col = isCenter ? [0.2, 0.7, 0.2] : [0.25, 0.25, 0.28];
    colors.push(...col, ...col);
  }

  // Lines parallel to X
  for (let i = 0; i <= divisions; i++) {
    const z = -half + step * i;
    positions.push(-half, 0, z, half, 0, z);
    const isCenter = Math.abs(z) < 1e-6;
    const col = isCenter ? [0.7, 0.2, 0.2] : [0.25, 0.25, 0.28];
    colors.push(...col, ...col);
  }

  const pos = new Float32Array(positions);
  const col = new Float32Array(colors);
  const interleaved = new Float32Array(pos.length / 3 * 6);

  for (let i = 0; i < pos.length / 3; i++) {
    interleaved[i * 6 + 0] = pos[i * 3 + 0];
    interleaved[i * 6 + 1] = pos[i * 3 + 1];
    interleaved[i * 6 + 2] = pos[i * 3 + 2];
    interleaved[i * 6 + 3] = col[i * 3 + 0];
    interleaved[i * 6 + 4] = col[i * 3 + 1];
    interleaved[i * 6 + 5] = col[i * 3 + 2];
  }

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, interleaved, gl.STATIC_DRAW);

  return { buffer, count: pos.length / 3 };
}

// ✅ New: Sphere primitive (lat-long tessellation, non-indexed)
export function createSphere(gl, radius = 1.0, slices = 24, stacks = 16, color = [0.4, 0.6, 0.9]) {
  const positions = [];
  const colors = [];

  for (let i = 0; i < stacks; i++) {
    const phi0 = (i / stacks) * Math.PI;
    const phi1 = ((i + 1) / stacks) * Math.PI;

    for (let j = 0; j < slices; j++) {
      const theta0 = (j / slices) * 2.0 * Math.PI;
      const theta1 = ((j + 1) / slices) * 2.0 * Math.PI;

      // 4 corners of the quad
      const p0 = sph(radius, phi0, theta0);
      const p1 = sph(radius, phi1, theta0);
      const p2 = sph(radius, phi1, theta1);
      const p3 = sph(radius, phi0, theta1);

      // Two triangles: p0-p1-p2, p0-p2-p3
      positions.push(...p0, ...p1, ...p2, ...p0, ...p2, ...p3);
      for (let k = 0; k < 6; k++) {
        colors.push(color[0], color[1], color[2]);
      }
    }
  }

  const pos = new Float32Array(positions);
  const col = new Float32Array(colors);
  const interleaved = new Float32Array(pos.length / 3 * 6);

  for (let i = 0; i < pos.length / 3; i++) {
    interleaved[i * 6 + 0] = pos[i * 3 + 0];
    interleaved[i * 6 + 1] = pos[i * 3 + 1];
    interleaved[i * 6 + 2] = pos[i * 3 + 2];
    interleaved[i * 6 + 3] = col[i * 3 + 0];
    interleaved[i * 6 + 4] = col[i * 3 + 1];
    interleaved[i * 6 + 5] = col[i * 3 + 2];
  }

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, interleaved, gl.STATIC_DRAW);

  return { buffer, count: pos.length / 3 };
}

function sph(r, phi, theta) {
  // standard spherical coordinates
  const x = r * Math.sin(phi) * Math.cos(theta);
  const y = r * Math.cos(phi);
  const z = r * Math.sin(phi) * Math.sin(theta);
  return [x, y, z];
}
