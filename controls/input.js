import { vec3, vec4 } from "https://cdn.jsdelivr.net/npm/gl-matrix@3.4.3/esm/index.js";
import {
  addShapeByName,
  applySelection,
  clearSelection,
  deleteSelectedShapes,
  duplicateActiveShape,
  selectedShape,
  selectedShapes,
} from "../scene.js";

let canvasRef = null;
let cameraRef = null;
let gizmoRef = null;
let uiRef = null;
let getMatricesRef = null;

let dragging = false;
let lastX = 0;
let lastY = 0;
let button = 0;
let ctrlDown = false;

let pendingPick = null;
const pickPixel = new Uint8Array(4);
let sceneGeometryChangedCb = null;

export function setupInputHandlers({
  canvas,
  camera,
  gizmo,
  ui,
  getInverseMatrices,
  onSceneGeometryChanged,
}) {
  canvasRef = canvas;
  cameraRef = camera;
  gizmoRef = gizmo;
  uiRef = ui;
  getMatricesRef = getInverseMatrices;
  sceneGeometryChangedCb = onSceneGeometryChanged;

  canvas.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mouseup", onMouseUp);
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("keydown", onKeyDown);
  canvas.addEventListener("wheel", onWheel, { passive: true });
  canvas.addEventListener("contextmenu", preventContextMenu);
}

export function disposeInputHandlers() {
  if (!canvasRef) return;
  canvasRef.removeEventListener("mousedown", onMouseDown);
  canvasRef.removeEventListener("wheel", onWheel);
  canvasRef.removeEventListener("contextmenu", preventContextMenu);
  window.removeEventListener("mouseup", onMouseUp);
  window.removeEventListener("mousemove", onMouseMove);
  window.removeEventListener("keydown", onKeyDown);
}

export function processPendingPick(gl, outlineFBO) {
  if (!pendingPick) return;

  gl.bindFramebuffer(gl.FRAMEBUFFER, outlineFBO);
  gl.readBuffer(gl.COLOR_ATTACHMENT1);
  gl.readPixels(
    pendingPick.x,
    pendingPick.y,
    1,
    1,
    gl.RED,
    gl.UNSIGNED_BYTE,
    pickPixel,
  );
  gl.readBuffer(gl.COLOR_ATTACHMENT0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  const value = pickPixel[0];
  const additive = pendingPick.additive;
  pendingPick = null;

  const shapeIndex = value > 0 ? value - 1 : -1;
  if (shapeIndex === -1) {
    if (!additive) {
      clearSelection();
    }
    return;
  }

  applySelection(shapeIndex, { additive });
}

function onMouseDown(e) {
  if (e.button === 0) {
    const ray = computeMouseRay(e.clientX, e.clientY);
    gizmoRef?.setLastMouseRay(ray);

    if (gizmoRef?.isDragging()) {
      gizmoRef.resetDrag();
      return;
    }

    if (gizmoRef && gizmoRef.getMode() !== "select") {
      if (gizmoRef.handleMouseDown(ray)) {
        return;
      }
      gizmoRef.setMode("select");
    }

    queuePickRequest(e.clientX, e.clientY, e.shiftKey);
    return;
  }
  if (e.button === 2) { // right click
    gizmoRef?.cancelDrag();
  }

  if (e.button !== 1) {
    dragging = false;
    return;
  }

  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
  button = e.button;
  e.preventDefault();
}

function onMouseUp() {
  dragging = false;
  gizmoRef?.resetDrag();
}

function onMouseMove(e) {
  const ray = computeMouseRay(e.clientX, e.clientY);
  gizmoRef?.setLastMouseRay(ray);

  if (gizmoRef?.isDragging()) {
    gizmoRef.handleMouseMove(ray);
    return;
  }

  if (!dragging) return;

  const dx = (e.clientX - lastX) / canvasRef.width;
  const dyRaw = (e.clientY - lastY) / canvasRef.height;
  const dyRotate = uiRef?.invertY ? -dyRaw : dyRaw;
  const dyPan = dyRaw;

  lastX = e.clientX;
  lastY = e.clientY;

  if (button === 1) {
    if (e.shiftKey) {
      cameraRef.pan(dx * canvasRef.width, dyPan * canvasRef.height);
    } else {
      cameraRef.rotate(dx, dyRotate);
    }
  }
}

function onWheel(e) {
  cameraRef.zoom(e.deltaY);
}

function preventContextMenu(e) {
  e.preventDefault();
}

window.addEventListener("keyup", e => {
  if (e.key === "Control") {
    gizmoRef.setSnapEnabled(false);
  }
});

function onKeyDown(e) {
  if (shouldIgnoreKey(e.target)) {
    return;
  }
  const key = e.key.toLowerCase();

  if (e.shiftKey && key === "a") {
    const typeName = uiRef ? uiRef.getSelectedShapeType() : "sphere";
    const index = addShapeByName(typeName);
    if (index !== -1) {
      applySelection(index);
      notifySceneGeometryChanged();
    }
    return;
  }

  if (e.key === "Control") {
    gizmoRef.setSnapEnabled(true);
  }

  if (e.shiftKey && key === "d") {
    duplicateActiveShape();
    notifySceneGeometryChanged();
    return;
  }

  if (key === "g") {
    gizmoRef?.setMode("translate");
    return;
  }

  if (key === "r") {
    gizmoRef?.setMode("rotate");
    return;
  }

  if (key === "s") {
    gizmoRef?.setMode("scale");
    return;
  }

  if (key === "x" && gizmoRef?.getMode() === "select" && selectedShapes.length > 0) {
    deleteSelectedShapes();
    notifySceneGeometryChanged();
    return;
  }

  if (key === "x" || key === "y" || key === "z") {
    gizmoRef?.handleKeyboardAxis(key);
    return;
  }

  if (key === "escape") {
    gizmoRef?.setMode("select");
    gizmoRef?.resetDrag();
  }
}

function shouldIgnoreKey(target) {
  return (
    target?.tagName === "INPUT" ||
    target?.tagName === "TEXTAREA" ||
    target?.isContentEditable
  );
}

function computeMouseRay(clientX, clientY) {
  if (!canvasRef || !cameraRef || !getMatricesRef) return null;

  const { invView, invProj } = getMatricesRef();
  const rect = canvasRef.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;

  const normX = (clientX - rect.left) / rect.width;
  const normY = (clientY - rect.top) / rect.height;
  const ndcX = normX * 2 - 1;
  const ndcY = 1 - normY * 2;

  const rayClip = vec4.fromValues(ndcX, ndcY, -1, 1);
  const rayView = vec4.transformMat4(vec4.create(), rayClip, invProj);
  rayView[0] /= rayView[3];
  rayView[1] /= rayView[3];
  rayView[2] /= rayView[3];
  rayView[3] = 0.0;

  const rayWorld4 = vec4.transformMat4(vec4.create(), rayView, invView);
  const rayDir = vec3.normalize(vec3.create(), rayWorld4.slice(0, 3));

  return {
    origin: cameraRef.getEye(),
    dir: rayDir,
  };
}

function queuePickRequest(clientX, clientY, additive) {
  if (!canvasRef) return;
  const rect = canvasRef.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;

  const normX = (clientX - rect.left) / rect.width;
  const normY = (clientY - rect.top) / rect.height;
  if (normX < 0 || normX > 1 || normY < 0 || normY > 1) return;

  const pixelX = Math.min(
    canvasRef.width - 1,
    Math.max(0, Math.floor(normX * canvasRef.width)),
  );
  const pixelYTop = Math.min(
    canvasRef.height - 1,
    Math.max(0, Math.floor(normY * canvasRef.height)),
  );

  pendingPick = {
    x: pixelX,
    y: canvasRef.height - 1 - pixelYTop,
    additive: !!additive,
  };
}

function notifySceneGeometryChanged() {
  if (typeof sceneGeometryChangedCb === "function") {
    sceneGeometryChangedCb();
  }
}
