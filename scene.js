// scene.js
// Pure scene state + mutation logic 

import { vec3, quat } from "https://cdn.jsdelivr.net/npm/gl-matrix@3.4.3/esm/index.js";

/* =================================================
   Scene constants
================================================= */

export const MAX_SHAPES = 16;

export const SHAPE_SPHERE  = 0;
export const SHAPE_BOX     = 1;
export const SHAPE_CYL     = 2;
export const SHAPE_CAPSULE = 3;
export const SHAPE_TORUS   = 4;

export const MAX_BOOLEAN_OPS = 4;
export const BOOLEAN_OP_UNION = 0;
export const BOOLEAN_OP_SUBTRACT = 1;
export const BOOLEAN_OP_INTERSECT = 2;
export const BOOLEAN_OP_SMOOTH_UNION = 3;

const DEFAULT_SMOOTH_RADIUS = 0.25;

/* =================================================
   Scene state
================================================= */

export const shapes = [];

export let selectedShape = -1;
export const selectedShapes = [];

// Callback hook (assigned by main.js)
export let onSelectionChanged = null;

/* =================================================
   Shape defaults
================================================= */

function defaultParamsForType(type) {
  switch (type) {
    case SHAPE_SPHERE:
      return [1.0, 0, 0, 0];
    case SHAPE_BOX:
      return [0.75, 0.75, 0.75, 0.0];
    case SHAPE_CYL:
      return [0.7, 1.0, 0, 0.0];
    case SHAPE_CAPSULE:
      return [0.4, 1.0, 0, 0];
    case SHAPE_TORUS:
      return [1.0, 0.25, 0, 0];
    default:
      return [1.0, 0, 0, 0];
  }
}

function defaultColorForType(type) {
  // Default to light grey/white for all shapes (RGB values 0-1)
  return [0.8, 0.8, 0.8]; // Light grey
}

/* =================================================
   Shape creation
================================================= */

function addShapeAtOrigin(type) {
  if (shapes.length >= MAX_SHAPES) {
    console.warn("Max shape count reached");
    return -1;
  }

  const index = shapes.length;

  shapes.push({
    type,
    pos: [0, 1, 0],
    params: defaultParamsForType(type),
    rotation: quat.create(),
    scale: [1, 1, 1],
    color: defaultColorForType(type),
    booleanOps: [],
  });

  return index;
}

export function addShapeByName(typeName) {
  switch (typeName) {
    case "box":
      return addShapeAtOrigin(SHAPE_BOX);
    case "cylinder":
      return addShapeAtOrigin(SHAPE_CYL);
    case "capsule":
      return addShapeAtOrigin(SHAPE_CAPSULE);
    case "torus":
      return addShapeAtOrigin(SHAPE_TORUS);
    case "sphere":
    default:
      return addShapeAtOrigin(SHAPE_SPHERE);
  }
}

/* =================================================
   Selection logic (scene-only)
================================================= */

function isShapeSelected(index) {
  return selectedShapes.includes(index);
}

export function clearSelection() {
  selectedShapes.length = 0;
  selectedShape = -1;

  if (onSelectionChanged) {
    onSelectionChanged(selectedShape, selectedShapes);
  }
}

function addToSelection(index) {
  if (index < 0) return;

  const existing = selectedShapes.indexOf(index);
  if (existing !== -1) {
    selectedShapes.splice(existing, 1);
  }

  selectedShapes.push(index);
  selectedShape = index;
}

function removeFromSelection(index) {
  const idx = selectedShapes.indexOf(index);
  if (idx !== -1) {
    selectedShapes.splice(idx, 1);
  }

  if (selectedShapes.length === 0) {
    selectedShape = -1;
  } else if (selectedShape === index) {
    selectedShape = selectedShapes[selectedShapes.length - 1];
  }
}

export function applySelection(index, options = {}) {
  const additive = !!options.additive;

  let target = index;
  if (target < 0 || target >= shapes.length) {
    target = -1;
  }

  if (target === -1) {
    if (!additive) {
      clearSelection();
    }
    return;
  }

  if (!additive) {
    selectedShapes.length = 0;
    addToSelection(target);
  } else {
    if (isShapeSelected(target)) {
      removeFromSelection(target);
    } else {
      addToSelection(target);
    }
  }

  if (onSelectionChanged) {
    onSelectionChanged(selectedShape, selectedShapes);
  }
}

/* =================================================
   Import / export helpers
================================================= */

function readArray(values, length, fallback) {
  if (!Array.isArray(values)) return fallback.slice();
  const out = [];
  for (let i = 0; i < length; i++) {
    const v = Number(values[i]);
    out.push(Number.isFinite(v) ? v : fallback[i]);
  }
  return out;
}

function safeDivide(a, b) {
  return Math.abs(b) > 1e-5 ? a / b : a;
}

function createRelativeShapeData(source, target) {
  const invTargetRot = quat.invert(quat.create(), target.rotation);
  const relPos = vec3.sub(vec3.create(), source.pos, target.pos);
  vec3.transformQuat(relPos, relPos, invTargetRot);
  relPos[0] = safeDivide(relPos[0], target.scale[0]);
  relPos[1] = safeDivide(relPos[1], target.scale[1]);
  relPos[2] = safeDivide(relPos[2], target.scale[2]);

  const relRot = quat.mul(quat.create(), invTargetRot, source.rotation);
  const relScale = [
    safeDivide(source.scale[0], target.scale[0]),
    safeDivide(source.scale[1], target.scale[1]),
    safeDivide(source.scale[2], target.scale[2]),
  ];

  return {
    type: source.type,
    pos: Array.from(relPos),
    params: [...source.params],
    rotation: relRot,
    scale: relScale,
  };
}

function cloneRelativeShapeData(data) {
  return {
    type: data.type,
    pos: [...data.pos],
    params: [...data.params],
    rotation: quat.clone(data.rotation),
    scale: [...data.scale],
  };
}

function cloneBooleanOps(list = []) {
  if (!Array.isArray(list)) return [];
  return list.map(entry => ({
    op: entry.op,
    smooth: entry.smooth ?? 0,
    shape: cloneRelativeShapeData(entry.shape),
  }));
}

function serializeBooleanOps(list = []) {
  if (!Array.isArray(list) || list.length === 0) return [];
  return list.map(entry => ({
    op: entry.op,
    smooth: Number.isFinite(entry.smooth) ? entry.smooth : 0,
    shape: {
      type: entry.shape?.type ?? SHAPE_SPHERE,
      pos: Array.from(entry.shape?.pos ?? [0, 0, 0]),
      params: Array.from(entry.shape?.params ?? defaultParamsForType(entry.shape?.type ?? SHAPE_SPHERE)),
      rotation: Array.from(entry.shape?.rotation ?? quat.create()),
      scale: Array.from(entry.shape?.scale ?? [1, 1, 1]),
    },
  }));
}

function parseRelativeShapeData(data) {
  if (!data) return null;
  const type = Number(data.type);
  if (!Number.isInteger(type) || type < SHAPE_SPHERE || type > SHAPE_TORUS) {
    return null;
  }
  return {
    type,
    pos: readArray(data.pos, 3, [0, 0, 0]),
    params: readArray(data.params, 4, defaultParamsForType(type)),
    rotation: quat.fromValues(...readArray(data.rotation, 4, [0, 0, 0, 1])),
    scale: readArray(data.scale, 3, [1, 1, 1]),
  };
}

function parseBooleanOps(list = []) {
  if (!Array.isArray(list)) return [];
  const result = [];
  for (const entry of list) {
    if (!entry) continue;
    const op = Number(entry.op);
    if (!Number.isInteger(op) || op < BOOLEAN_OP_UNION || op > BOOLEAN_OP_SMOOTH_UNION) {
      continue;
    }
    const shape = parseRelativeShapeData(entry.shape);
    if (!shape) continue;
    const smooth = Number(entry.smooth);
    result.push({
      op,
      smooth: Number.isFinite(smooth) && smooth > 0 ? smooth : 0,
      shape,
    });
  }
  return result;
}

export function serializeScene() {
  return {
    version: 1,
    shapes: shapes.map(s => ({
      type: s.type,
      pos: [...s.pos],
      params: [...s.params],
      rotation: Array.from(s.rotation ?? quat.create()),
      scale: [...(s.scale ?? [1, 1, 1])],
      color: [...(s.color ?? defaultColorForType(s.type))],
      booleanOps: serializeBooleanOps(s.booleanOps),
    })),
  };
}

export function loadSceneData(data) {
  if (!data || !Array.isArray(data.shapes)) {
    return false;
  }

  const imported = [];
  for (let i = 0; i < data.shapes.length && imported.length < MAX_SHAPES; i++) {
    const src = data.shapes[i];
    if (!src) continue;
    const type = Number(src.type);
    if (!Number.isInteger(type) || type < SHAPE_SPHERE || type > SHAPE_TORUS) {
      continue;
    }

    const defaults = defaultParamsForType(type);
    const shape = {
      type,
      pos: readArray(src.pos, 3, [0, 1, 0]),
      params: readArray(src.params, 4, defaults),
      rotation: quat.fromValues(
        ...readArray(src.rotation, 4, [0, 0, 0, 1])
      ),
      scale: readArray(src.scale, 3, [1, 1, 1]),
      color: readArray(src.color, 3, defaultColorForType(type)),
      booleanOps: parseBooleanOps(src.booleanOps),
    };

    imported.push(shape);
  }

  if (imported.length === 0) {
    return false;
  }

  shapes.length = 0;
  imported.forEach(s => shapes.push(s));
  clearSelection();
  return true;
}

/* =================================================
   Scene mutations
================================================= */

export function deleteSelectedShapes() {
  if (selectedShapes.length === 0) return;

  const toRemove = [...selectedShapes].sort((a, b) => b - a);
  for (const idx of toRemove) {
    if (idx >= 0 && idx < shapes.length) {
      shapes.splice(idx, 1);
    }
  }

  clearSelection();
}

export function duplicateActiveShape() {
  if (selectedShape === -1) return;
  if (shapes.length >= MAX_SHAPES) return;

  const src = shapes[selectedShape];

  shapes.push({
    type: src.type,
    pos: [...src.pos],
    params: [...src.params],
    rotation: quat.clone(src.rotation),
    scale: [...src.scale],
    color: [...src.color],
    booleanOps: cloneBooleanOps(src.booleanOps),
  });

  const newIndex = shapes.length - 1;
  selectedShapes.length = 0;
  selectedShapes.push(newIndex);
  selectedShape = newIndex;

  if (onSelectionChanged) {
    onSelectionChanged(selectedShape, selectedShapes);
  }
}

export function applyBooleanOperation(op) {
  if (selectedShape === -1) {
    return { success: false, error: "No active shape selected." };
  }
  const target = shapes[selectedShape];
  if (!target) {
    return { success: false, error: "Active shape data missing." };
  }
  const operands = selectedShapes.filter(idx => idx !== selectedShape);
  if (operands.length === 0) {
    return { success: false, error: "Select at least one additional shape." };
  }
  const availableSlots = MAX_BOOLEAN_OPS - target.booleanOps.length;
  if (availableSlots <= 0) {
    return { success: false, error: "Active shape already has maximum boolean operations." };
  }
  if (operands.length > availableSlots) {
    return {
      success: false,
      error: `Only ${availableSlots} boolean slots available on the active shape.`,
    };
  }

  for (const idx of operands) {
    const source = shapes[idx];
    if (!source) continue;
    target.booleanOps.push({
      op,
      smooth: op === BOOLEAN_OP_SMOOTH_UNION ? DEFAULT_SMOOTH_RADIUS : 0,
      shape: createRelativeShapeData(source, target),
    });
  }

  const toRemove = [...operands].sort((a, b) => b - a);
  let targetIndex = selectedShape;
  for (const idx of toRemove) {
    if (idx < 0 || idx >= shapes.length) continue;
    shapes.splice(idx, 1);
    if (idx < targetIndex) {
      targetIndex -= 1;
    }
  }

  selectedShapes.length = 0;
  selectedShapes.push(targetIndex);
  selectedShape = targetIndex;

  if (onSelectionChanged) {
    onSelectionChanged(selectedShape, selectedShapes);
  }

  return { success: true };
}

/* =================================================
   GPU data packing (pure)
================================================= */

export function buildShapeUniforms(
  posOut,
  typeOut,
  paramOut,
  rotOut,
  scaleOut,
  colorOut,
  booleanCountOut,
  booleanTypeOut,
  booleanParamOut,
  booleanPosOut,
  booleanRotOut,
  booleanScaleOut,
  booleanOpOut,
  booleanSmoothOut,
) {
  booleanCountOut.fill(0);
  booleanTypeOut.fill(0);
  booleanParamOut.fill(0);
  booleanPosOut.fill(0);
  booleanRotOut.fill(0);
  booleanScaleOut.fill(0);
  booleanOpOut.fill(-1);
  booleanSmoothOut.fill(0);

  for (let i = 0; i < shapes.length; i++) {
    const s = shapes[i];
    posOut.set(s.pos, i * 3);
    typeOut[i] = s.type;
    paramOut.set(s.params, i * 4);
    rotOut.set(s.rotation, i * 4);
    scaleOut.set(s.scale, i * 3);
    colorOut.set(s.color || [0.8, 0.8, 0.8], i * 3); // Default to gray if color missing

     const boolList = Array.isArray(s.booleanOps) ? s.booleanOps : [];
     const count = Math.min(boolList.length, MAX_BOOLEAN_OPS);
     const baseIndex = i * MAX_BOOLEAN_OPS;
     booleanCountOut[i] = count;
     for (let j = 0; j < count; j++) {
       const entry = boolList[j];
       const targetIndex = baseIndex + j;
       const relShape = entry.shape || {};
       booleanOpOut[targetIndex] = entry.op ?? BOOLEAN_OP_UNION;
       booleanTypeOut[targetIndex] = relShape.type ?? SHAPE_SPHERE;
       booleanPosOut.set(relShape.pos ?? [0, 0, 0], targetIndex * 3);
       booleanParamOut.set(relShape.params ?? defaultParamsForType(relShape.type ?? SHAPE_SPHERE), targetIndex * 4);
       const rotation = relShape.rotation ?? quat.create();
       booleanRotOut.set(rotation, targetIndex * 4);
       booleanScaleOut.set(relShape.scale ?? [1, 1, 1], targetIndex * 3);
       const smoothValue = entry.smooth ?? 0;
       booleanSmoothOut[targetIndex] = Number.isFinite(smoothValue) ? smoothValue : 0;
     }
  }
}

// Callback setter for main.js
export function setOnSelectionChanged(cb) {
  onSelectionChanged = cb;
}
