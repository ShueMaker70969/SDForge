import { mat4, vec3 } from "https://cdn.jsdelivr.net/npm/gl-matrix@3.4.3/esm/index.js";
import { OrbitCamera } from "./camera.js";
import { SDFRenderer } from "./sdf_renderer.js";
import {
  BOOLEAN_OP_INTERSECT,
  BOOLEAN_OP_SMOOTH_UNION,
  BOOLEAN_OP_SUBTRACT,
  BOOLEAN_OP_UNION,
  MAX_BOOLEAN_OPS,
  SHAPE_BOX,
  SHAPE_CAPSULE,
  SHAPE_CYL,
  SHAPE_TORUS,
  addShapeByName,
  applyBooleanOperation,
  applySelection,
  deleteSelectedShapes,
  selectedShape,
  selectedShapes,
  setOnSelectionChanged,
  shapes,
} from "./scene.js";
import { createGizmoController } from "./controls/gizmo.js";
import { setupInputHandlers } from "./controls/input.js";
import { initRenderingContext } from "./rendering/context.js";
import { createRenderLoop } from "./rendering/loop.js";
import { syncShapesToRenderer } from "./scene/shape_buffers.js";
import { exportSceneText, importSceneText } from "./scene/scene_io.js";
import { createUIBindings } from "./ui/ui_bindings.js";

const BOOLEAN_MODE_MAP = {
  union: BOOLEAN_OP_UNION,
  difference: BOOLEAN_OP_SUBTRACT,
  intersect: BOOLEAN_OP_INTERSECT,
  smoothUnion: BOOLEAN_OP_SMOOTH_UNION,
};

window.morphFactor = 0.0;

const canvas = document.getElementById("glcanvas");
const rendering = initRenderingContext(canvas);

const camera = new OrbitCamera();
const sdfRenderer = new SDFRenderer(rendering.gl);

const invView = mat4.create();
const invProj = mat4.create();

const lightingState = {
  baseDir: vec3.normalize(vec3.create(), [0.5, 1.0, 0.3]),
  angle: 0.0,
  direction: vec3.create(),
};

const pbrSettings = { aoIntensity: 1.0 };
const pointLights = [];
const areaLight = {
  enabled: false,
  position: [0, 5, 0],
  color: [1, 1, 1],
  intensity: 5.0,
  right: [1, 0, 0],
  up: [0, 0, 1],
  size: [3, 3],
};

let ui = null;

const gizmo = createGizmoController(rendering.gl, rendering.lineAttributes, {
  onModeChanged: (mode) => {
    if (ui) {
      ui.setGizmoMode(mode);
    }
  },
});

ui = createUIBindings({
  gizmo,
  onLightRotate: (deg) => {
    lightingState.angle = deg * Math.PI / 180.0;
  },
  onAddShape: (typeName) => {
    const index = addShapeByName(typeName);
    if (index !== -1) {
      applySelection(index);
      syncShapesToRenderer(sdfRenderer);
    }
  },
  onDeleteShape: () => {
    deleteSelectedShapes();
    syncShapesToRenderer(sdfRenderer);
  },
  onExportScene: () => exportSceneText(lightingState.angle),
  onImportScene: (text) => {
    importSceneText(text, {
      sdfRenderer,
      onLightAngleChange: (angle) => {
        lightingState.angle = angle;
        ui.setLightSlider(angle * 180 / Math.PI);
      },
    });
  },
  onApplyBoolean: (mode) => {
    const op = BOOLEAN_MODE_MAP[mode] ?? BOOLEAN_OP_UNION;
    const result = applyBooleanOperation(op);
    if (!result.success && result.error) {
      alert(result.error);
    }
    syncShapesToRenderer(sdfRenderer);
  },
  onUpdateShapeColor: (color) => {
    if (selectedShape !== -1 && shapes[selectedShape]) {
      shapes[selectedShape].color = color;
    }
  },
  onUpdateShapeParams: (params) => {
    updateShapeParams(params);
  },
  onUpdateBoxRounding: (rounding) => {
    updateBoxRounding(rounding);
  },
  onPBRUpdate: (settings) => {
    Object.assign(pbrSettings, settings);
  },
  onPointLightUpdate: (lights) => {
    pointLights.length = 0;
    lights.forEach((l) => {
      pointLights.push({
        position: Array.isArray(l.position) ? [...l.position] : [0, 5, 0],
        color: Array.isArray(l.color) ? [...l.color] : [1, 1, 1],
        intensity: l.intensity ?? 10.0,
        radius: l.radius || 0,
      });
    });
  },
  onAreaLightUpdate: (light) => {
    areaLight.enabled = light.enabled;
    areaLight.position = Array.isArray(light.position) ? [...light.position] : [...areaLight.position];
    areaLight.color = Array.isArray(light.color) ? [...light.color] : [...areaLight.color];
    areaLight.intensity = light.intensity ?? areaLight.intensity;
    areaLight.right = [1, 0, 0];
    areaLight.up = [0, 0, 1];
    areaLight.size = Array.isArray(light.size) ? [...light.size] : [...areaLight.size];
  },
});

ui.setLightSlider(lightingState.angle * 180 / Math.PI);

setOnSelectionChanged((active, all) => {
  if (!ui) return;
  const shape = active !== -1 ? shapes[active] : null;
  ui.updateRoundingControl(active, shape ?? null);
  const hasSlots = !!shape && Array.isArray(shape.booleanOps)
    ? shape.booleanOps.length < MAX_BOOLEAN_OPS
    : false;
  ui.updateBooleanControls(all.length, hasSlots);
});

setupInputHandlers({
  canvas,
  camera,
  gizmo,
  ui,
  getInverseMatrices: () => ({ invView, invProj }),
});

syncShapesToRenderer(sdfRenderer);

const renderLoop = createRenderLoop({
  gl: rendering.gl,
  canvas,
  camera,
  sdfRenderer,
  gizmo,
  lineProgram: rendering.lineProgram,
  lineAttributes: rendering.lineAttributes,
  lineUniforms: rendering.lineUniforms,
  gridGeometry: rendering.gridGeometry,
  axisGeometry: rendering.axisGeometry,
  outlineProgram: rendering.outlineProgram,
  outlineUniforms: rendering.outlineUniforms,
  outlineTargets: rendering.outlineTargets,
  lightingState,
  pbrSettingsRef: pbrSettings,
  pointLightsRef: pointLights,
  areaLightRef: areaLight,
  invView,
  invProj,
});

renderLoop.start();

function updateShapeParams(params) {
  if (selectedShape === -1 || !shapes[selectedShape]) return;
  const shape = shapes[selectedShape];

  if (shape.type === SHAPE_TORUS && params.torusThickness !== undefined) {
    shape.params[1] = params.torusThickness;
    syncShapesToRenderer(sdfRenderer);
  }

  if (shape.type === SHAPE_CAPSULE) {
    if (params.capsuleRadius !== undefined) {
      shape.params[0] = params.capsuleRadius;
      syncShapesToRenderer(sdfRenderer);
    }
    if (params.capsuleHeight !== undefined) {
      shape.params[1] = params.capsuleHeight;
      syncShapesToRenderer(sdfRenderer);
    }
  }
}

function updateBoxRounding(rounding) {
  if (selectedShape === -1 || !shapes[selectedShape]) return;
  const shape = shapes[selectedShape];
  if (shape.type === SHAPE_BOX) {
    shape.params[3] = rounding;
    syncShapesToRenderer(sdfRenderer);
  } else if (shape.type === SHAPE_CYL) {
    shape.params[2] = rounding;
    syncShapesToRenderer(sdfRenderer);
  }
}
