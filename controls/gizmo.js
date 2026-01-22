import { vec3, quat } from "https://cdn.jsdelivr.net/npm/gl-matrix@3.4.3/esm/index.js";
import { shapes, selectedShape } from "../scene.js";

const GIZMO_LENGTH = 1.2;
const GIZMO_ROTATION_SEGMENTS = 64;
const GIZMO_ROTATION_RADIUS = GIZMO_LENGTH;
const GIZMO_ROTATION_PICK_WIDTH = 0.12;
const GIZMO_HIGHLIGHT_COLOR = [1.0, 1.0, 0.0];
const GIZMO_AXIS_COLORS = [
  [1, 0, 0],
  [0, 0, 1],
  [0, 1, 0],
];

const GIZMO_DIRS = [
  vec3.fromValues(1, 0, 0),
  vec3.fromValues(0, 1, 0),
  vec3.fromValues(0, 0, 1),
];

export function createGizmoController(gl, attributeLocations, options = {}) {
  if (!gl) throw new Error("createGizmoController requires a WebGL context");

  const state = {
    mode: "select",
    dragging: false,
    dragType: null,
    activeAxisIndex: -1,
    axisConstraint: null,
    lastMouseRay: null,
    startPos: vec3.create(),
    startT: 0,
    startScale: 1,
    rotationAxis: vec3.create(),
    rotationStartVec: vec3.create(),
    rotationCurrentVec: vec3.create(),
    rotationStartQuat: quat.create(),
    rotationDeltaQuat: quat.create(),
  };

  const buffers = {
    position: gl.createBuffer(),
    color: gl.createBuffer(),
  };

  const callbacks = {
    onModeChanged: options.onModeChanged ?? (() => {}),
  };

  const attributes = {
    position: attributeLocations.position,
    color: attributeLocations.color,
  };

  function setMode(mode, source = "code") {
    if (!mode || mode === state.mode) {
      if (source !== "ui") {
        callbacks.onModeChanged(state.mode);
      }
      return;
    }

    state.mode = mode;
    resetDrag();
    if (source !== "ui") {
      callbacks.onModeChanged(state.mode);
    }
  }

  function getMode() {
    return state.mode;
  }

  function getActiveAxis() {
    return state.activeAxisIndex;
  }

  function isDragging() {
    return state.dragging;
  }

  function resetDrag() {
    state.dragging = false;
    state.dragType = null;
    state.activeAxisIndex = -1;
    state.axisConstraint = null;
  }

  function draw(shape) {
    if (!shape || state.mode === "select") {
      return;
    }
    if (state.mode === "rotate") {
      drawRotationGizmo(gl, buffers, attributes, shape.pos, state.activeAxisIndex);
    } else if (state.mode === "scale") {
      drawScaleGizmo(gl, buffers, attributes, shape, shape.pos, state.activeAxisIndex);
    } else {
      drawTranslationGizmo(gl, buffers, attributes, shape.pos, state.activeAxisIndex);
    }
  }

  function setLastMouseRay(ray) {
    state.lastMouseRay = ray;
  }

  function handleMouseMove(ray) {
    if (!state.dragging || selectedShape === -1 || state.activeAxisIndex === -1) {
      return;
    }
    if (!ray) return;

    const shape = shapes[selectedShape];
    if (!shape) return;

    if (state.dragType === "translate") {
      const axisDir = GIZMO_DIRS[state.activeAxisIndex];
      const t = projectRayToAxis(ray.origin, ray.dir, state.startPos, axisDir);
      if (t !== null) {
        const delta = t - state.startT;
        const newPos = vec3.scaleAndAdd([], state.startPos, axisDir, delta);
        shape.pos = newPos;
      }
    } else if (state.dragType === "rotate") {
      handleRotationDrag(shape, ray.dir, ray.origin, state);
    } else if (state.dragType === "scale") {
      const axisDir = getScaleGizmoDirs(shape)[state.activeAxisIndex];
      const t = projectRayToAxis(ray.origin, ray.dir, state.startPos, axisDir);
      if (t !== null) {
        const delta = t - state.startT;
        const factor = Math.exp(delta * 0.3);
        shape.scale[state.activeAxisIndex] = Math.max(0.05, state.startScale * factor);
      }
    }
  }

  function handleMouseDown(ray) {
    if (!ray || selectedShape === -1 || state.mode === "select") {
      return false;
    }
    const shape = shapes[selectedShape];
    if (!shape) return false;

    if (state.mode === "rotate") {
      const pick = pickRotationAxis(ray, shape.pos);
      if (pick.axis !== -1 && pick.hitPoint) {
        beginRotationDrag(shape, pick.axis, pick.hitPoint, state);
        return true;
      }
    } else if (state.mode === "translate") {
      const axisIndex = pickTranslationAxis(ray, shape.pos);
      if (axisIndex !== -1) {
        beginTranslationDrag(shape, axisIndex, ray, state);
        return true;
      }
    } else if (state.mode === "scale") {
      const axis = pickScaleAxis(ray, shape.pos, shape);
      if (axis !== -1) {
        beginScaleDrag(shape, axis, ray, state);
        return true;
      }
    }

    return false;
  }

  function handleKeyboardAxis(axisChar) {
    if (!axisChar) {
      resetDrag();
      return;
    }
    if (state.axisConstraint === axisChar) {
      resetDrag();
      return;
    }
    state.axisConstraint = axisChar;
    const started = beginKeyboardGizmoDrag(state);
    if (!started) {
      state.axisConstraint = null;
    }
  }

  return {
    setMode,
    getMode,
    draw,
    isDragging,
    resetDrag,
    getActiveAxis,
    handleMouseDown,
    handleMouseMove,
    handleKeyboardAxis,
    setLastMouseRay,
    get lastMouseRay() {
      return state.lastMouseRay;
    },
  };
}

function drawTranslationGizmo(gl, buffers, attrs, pos, activeAxis = -1) {
  const verts = new Float32Array([
    pos[0], pos[1], pos[2],
    pos[0] + GIZMO_LENGTH, pos[1], pos[2],

    pos[0], pos[1], pos[2],
    pos[0], pos[1] + GIZMO_LENGTH, pos[2],

    pos[0], pos[1], pos[2],
    pos[0], pos[1], pos[2] + GIZMO_LENGTH,
  ]);

  const colors = new Float32Array([
    ...(activeAxis === 0 ? GIZMO_HIGHLIGHT_COLOR : GIZMO_AXIS_COLORS[0]),
    ...(activeAxis === 0 ? GIZMO_HIGHLIGHT_COLOR : GIZMO_AXIS_COLORS[0]),
    ...(activeAxis === 1 ? GIZMO_HIGHLIGHT_COLOR : GIZMO_AXIS_COLORS[1]),
    ...(activeAxis === 1 ? GIZMO_HIGHLIGHT_COLOR : GIZMO_AXIS_COLORS[1]),
    ...(activeAxis === 2 ? GIZMO_HIGHLIGHT_COLOR : GIZMO_AXIS_COLORS[2]),
    ...(activeAxis === 2 ? GIZMO_HIGHLIGHT_COLOR : GIZMO_AXIS_COLORS[2]),
  ]);

  gl.disable(gl.DEPTH_TEST);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
  gl.vertexAttribPointer(attrs.position, 3, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, buffers.color);
  gl.bufferData(gl.ARRAY_BUFFER, colors, gl.DYNAMIC_DRAW);
  gl.vertexAttribPointer(attrs.color, 3, gl.FLOAT, false, 0, 0);

  gl.drawArrays(gl.LINES, 0, 6);
  gl.enable(gl.DEPTH_TEST);
}

function drawRotationGizmo(gl, buffers, attrs, pos, activeAxis = -1) {
  gl.disable(gl.DEPTH_TEST);
  const circleVerts = new Float32Array(GIZMO_ROTATION_SEGMENTS * 3);
  const circleColors = new Float32Array(GIZMO_ROTATION_SEGMENTS * 3);

  for (let axisIndex = 0; axisIndex < GIZMO_DIRS.length; axisIndex++) {
    const axis = GIZMO_DIRS[axisIndex];
    const { tangent, bitangent } = buildCircleBasis(axis);
    const color = activeAxis === axisIndex ? GIZMO_HIGHLIGHT_COLOR : GIZMO_AXIS_COLORS[axisIndex];
    const offset = vec3.create();

    for (let i = 0; i < GIZMO_ROTATION_SEGMENTS; i++) {
      const t = (i / GIZMO_ROTATION_SEGMENTS) * Math.PI * 2;
      const cosT = Math.cos(t);
      const sinT = Math.sin(t);
      vec3.scale(offset, tangent, cosT * GIZMO_ROTATION_RADIUS);
      vec3.scaleAndAdd(offset, offset, bitangent, sinT * GIZMO_ROTATION_RADIUS);

      const idx = i * 3;
      circleVerts[idx] = pos[0] + offset[0];
      circleVerts[idx + 1] = pos[1] + offset[1];
      circleVerts[idx + 2] = pos[2] + offset[2];
      circleColors.set(color, idx);
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
    gl.bufferData(gl.ARRAY_BUFFER, circleVerts, gl.DYNAMIC_DRAW);
    gl.vertexAttribPointer(attrs.position, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.color);
    gl.bufferData(gl.ARRAY_BUFFER, circleColors, gl.DYNAMIC_DRAW);
    gl.vertexAttribPointer(attrs.color, 3, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.LINE_LOOP, 0, GIZMO_ROTATION_SEGMENTS);
  }

  gl.enable(gl.DEPTH_TEST);
}

function drawScaleGizmo(gl, buffers, attrs, shape, pos, activeAxis = -1) {
  const dirs = getScaleGizmoDirs(shape);
  const verts = new Float32Array(18);
  const colors = new Float32Array(18);

  for (let i = 0; i < 3; i++) {
    const d = dirs[i];
    const base = i * 6;
    verts[base] = pos[0];
    verts[base + 1] = pos[1];
    verts[base + 2] = pos[2];
    verts[base + 3] = pos[0] + d[0] * GIZMO_LENGTH;
    verts[base + 4] = pos[1] + d[1] * GIZMO_LENGTH;
    verts[base + 5] = pos[2] + d[2] * GIZMO_LENGTH;

    const color = activeAxis === i ? GIZMO_HIGHLIGHT_COLOR : GIZMO_AXIS_COLORS[i];
    colors.set(color, base);
    colors.set(color, base + 3);
  }

  gl.disable(gl.DEPTH_TEST);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
  gl.vertexAttribPointer(attrs.position, 3, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, buffers.color);
  gl.bufferData(gl.ARRAY_BUFFER, colors, gl.DYNAMIC_DRAW);
  gl.vertexAttribPointer(attrs.color, 3, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.LINES, 0, 6);
  gl.enable(gl.DEPTH_TEST);
}

function getScaleGizmoDirs(shape) {
  const dirs = [
    vec3.fromValues(1, 0, 0),
    vec3.fromValues(0, 1, 0),
    vec3.fromValues(0, 0, 1),
  ];

  if (!shape) return dirs;

  for (let i = 0; i < 3; i++) {
    vec3.transformQuat(dirs[i], dirs[i], shape.rotation);
    vec3.normalize(dirs[i], dirs[i]);
  }

  return dirs;
}

function buildCircleBasis(axis) {
  const helper = Math.abs(axis[1]) < 0.99 ? vec3.fromValues(0, 1, 0) : vec3.fromValues(1, 0, 0);
  const tangent = vec3.normalize(vec3.create(), vec3.cross(vec3.create(), axis, helper));
  const bitangent = vec3.normalize(vec3.create(), vec3.cross(vec3.create(), tangent, axis));
  return { tangent, bitangent };
}

function beginTranslationDrag(shape, axisIndex, ray, state) {
  state.activeAxisIndex = axisIndex;
  state.dragging = true;
  state.dragType = "translate";
  vec3.copy(state.startPos, shape.pos);
  const t = projectRayToAxis(ray.origin, ray.dir, state.startPos, GIZMO_DIRS[axisIndex]);
  state.startT = t ?? 0;
  return true;
}

function beginRotationDrag(shape, axisIndex, hitPoint, state) {
  const axisDir = GIZMO_DIRS[axisIndex];
  if (!projectPointToPlaneVector(hitPoint, shape.pos, axisDir, state.rotationStartVec)) {
    return false;
  }
  state.activeAxisIndex = axisIndex;
  state.dragging = true;
  state.dragType = "rotate";
  vec3.copy(state.rotationAxis, axisDir);
  quat.copy(state.rotationStartQuat, shape.rotation);
  return true;
}

function beginScaleDrag(shape, axisIndex, ray, state) {
  state.activeAxisIndex = axisIndex;
  state.dragging = true;
  state.dragType = "scale";
  vec3.copy(state.startPos, shape.pos);
  const dirs = getScaleGizmoDirs(shape);
  const t = projectRayToAxis(ray.origin, ray.dir, state.startPos, dirs[axisIndex]);
  state.startT = t ?? 0;
  state.startScale = shape.scale[axisIndex];
  return true;
}

function handleRotationDrag(shape, rayDir, rayOrigin, state) {
  const hit = intersectRayPlane(rayOrigin, rayDir, shape.pos, state.rotationAxis);
  if (!hit) return;
  if (!projectPointToPlaneVector(hit, shape.pos, state.rotationAxis, state.rotationCurrentVec)) {
    return;
  }
  const angle = signedAngleBetween(state.rotationStartVec, state.rotationCurrentVec, state.rotationAxis);
  if (!isFinite(angle) || Math.abs(angle) < 1e-4) {
    return;
  }
  quat.setAxisAngle(state.rotationDeltaQuat, state.rotationAxis, angle);
  quat.mul(shape.rotation, state.rotationDeltaQuat, state.rotationStartQuat);
  quat.normalize(shape.rotation, shape.rotation);
  quat.copy(state.rotationStartQuat, shape.rotation);
  vec3.copy(state.rotationStartVec, state.rotationCurrentVec);
}

function pickTranslationAxis(ray, origin) {
  const threshold = 0.15;
  let bestAxis = -1;
  let bestDist = Infinity;

  for (let i = 0; i < GIZMO_DIRS.length; i++) {
    const dir = GIZMO_DIRS[i];
    const { t, dist } = closestPointParamsOnLines(origin, dir, ray.origin, ray.dir);
    if (dist < threshold && t >= 0 && t <= GIZMO_LENGTH) {
      if (dist < bestDist) {
        bestDist = dist;
        bestAxis = i;
      }
    }
  }

  return bestAxis;
}

function pickRotationAxis(ray, origin) {
  let bestAxis = -1;
  let bestDiff = GIZMO_ROTATION_PICK_WIDTH;
  let bestPoint = null;

  for (let i = 0; i < GIZMO_DIRS.length; i++) {
    const axisDir = GIZMO_DIRS[i];
    const hit = intersectRayPlane(ray.origin, ray.dir, origin, axisDir);
    if (!hit) continue;

    const offset = vec3.sub([], hit, origin);
    const axisComponent = vec3.dot(offset, axisDir);
    vec3.scaleAndAdd(offset, offset, axisDir, -axisComponent);
    const dist = vec3.length(offset);
    const diff = Math.abs(dist - GIZMO_ROTATION_RADIUS);

    if (diff <= GIZMO_ROTATION_PICK_WIDTH && diff < bestDiff) {
      bestDiff = diff;
      bestAxis = i;
      bestPoint = hit;
    }
  }

  return { axis: bestAxis, hitPoint: bestPoint };
}

function pickScaleAxis(ray, origin, shape) {
  const dirs = getScaleGizmoDirs(shape);
  const threshold = 0.15;
  let bestAxis = -1;
  let bestDist = Infinity;

  for (let i = 0; i < 3; i++) {
    const dir = dirs[i];
    const { t, dist } = closestPointParamsOnLines(origin, dir, ray.origin, ray.dir);
    if (dist < threshold && t >= 0 && t <= GIZMO_LENGTH) {
      if (dist < bestDist) {
        bestDist = dist;
        bestAxis = i;
      }
    }
  }
  return bestAxis;
}

function projectRayToAxis(rayOrigin, rayDir, axisOrigin, axisDir) {
  const { t, dist } = closestPointParamsOnLines(axisOrigin, axisDir, rayOrigin, rayDir);
  if (!isFinite(dist)) return null;
  return t;
}

function closestPointParamsOnLines(p0, d0, p1, d1) {
  const r = vec3.sub([], p0, p1);
  const a = vec3.dot(d0, d0);
  const e = vec3.dot(d1, d1);
  const b = vec3.dot(d0, d1);
  const c = vec3.dot(d0, r);
  const f = vec3.dot(d1, r);
  const denom = a * e - b * b;
  if (Math.abs(denom) < 1e-6) {
    return { t: 0, dist: Infinity };
  }
  const t = (b * f - c * e) / denom;
  const s = (a * f - b * c) / denom;
  const p = vec3.scaleAndAdd([], p0, d0, t);
  const q = vec3.scaleAndAdd([], p1, d1, s);
  const dist = vec3.length(vec3.sub([], p, q));
  return { t, dist };
}

function intersectRayPlane(rayOrigin, rayDir, planePoint, planeNormal) {
  const denom = vec3.dot(planeNormal, rayDir);
  if (Math.abs(denom) < 1e-6) return null;
  const t = vec3.dot(vec3.sub([], planePoint, rayOrigin), planeNormal) / denom;
  if (t < 0) return null;
  return vec3.scaleAndAdd([], rayOrigin, rayDir, t);
}

function projectPointToPlaneVector(point, origin, axisDir, out) {
  vec3.sub(out, point, origin);
  const axisComponent = vec3.dot(out, axisDir);
  vec3.scaleAndAdd(out, out, axisDir, -axisComponent);
  const len = vec3.length(out);
  if (len < 1e-4) return false;
  vec3.scale(out, out, 1 / len);
  return true;
}

function signedAngleBetween(a, b, axisDir) {
  const crossVec = vec3.cross([], a, b);
  const sinTerm = vec3.dot(crossVec, axisDir);
  const cosTerm = vec3.dot(a, b);
  return Math.atan2(sinTerm, cosTerm);
}

function beginKeyboardGizmoDrag(state) {
  if (selectedShape === -1) return false;
  if (!state.axisConstraint) return false;
  const axisIndex = axisCharToIndex(state.axisConstraint);
  if (axisIndex === -1) return false;
  if (state.mode === "select") return false;

  const ray = state.lastMouseRay;
  const shape = shapes[selectedShape];
  if (!ray || !shape) return false;

  if (state.mode === "translate") {
    return beginTranslationDrag(shape, axisIndex, ray, state);
  }
  if (state.mode === "rotate") {
    const hit = intersectRayPlane(ray.origin, ray.dir, shape.pos, GIZMO_DIRS[axisIndex]);
    if (!hit) return false;
    return beginRotationDrag(shape, axisIndex, hit, state);
  }
  if (state.mode === "scale") {
    return beginScaleDrag(shape, axisIndex, ray, state);
  }
  return false;
}

function axisCharToIndex(axis) {
  if (axis === "x") return 0;
  if (axis === "y") return 2;
  if (axis === "z") return 1;
  return -1;
}
