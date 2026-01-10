// scene.js
// Pure scene state + mutation logic 

import { quat } from "https://cdn.jsdelivr.net/npm/gl-matrix@3.4.3/esm/index.js";

/* =================================================
   Scene constants
================================================= */

export const MAX_SHAPES = 16;

export const SHAPE_SPHERE  = 0;
export const SHAPE_BOX     = 1;
export const SHAPE_CYL     = 2;
export const SHAPE_CAPSULE = 3;
export const SHAPE_TORUS   = 4;

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
  });

  const newIndex = shapes.length - 1;
  selectedShapes.length = 0;
  selectedShapes.push(newIndex);
  selectedShape = newIndex;

  if (onSelectionChanged) {
    onSelectionChanged(selectedShape, selectedShapes);
  }
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
  colorOut
) {
  for (let i = 0; i < shapes.length; i++) {
    const s = shapes[i];
    posOut.set(s.pos, i * 3);
    typeOut[i] = s.type;
    paramOut.set(s.params, i * 4);
    rotOut.set(s.rotation, i * 4);
    scaleOut.set(s.scale, i * 3);
    colorOut.set(s.color || [0.8, 0.8, 0.8], i * 3); // Default to gray if color missing
  }
}

// Callback setter for main.js
export function setOnSelectionChanged(cb) {
  onSelectionChanged = cb;
}