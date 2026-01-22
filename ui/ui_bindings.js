import { UIOptions } from "../ui_options.js";

export function createUIBindings({
  gizmo,
  onLightRotate,
  onAddShape,
  onDeleteShape,
  onExportScene,
  onImportScene,
  onApplyBoolean,
  onUpdateShapeColor,
  onUpdateShapeParams,
  onUpdateBoxRounding,
  onPBRUpdate,
  onPointLightUpdate,
  onAreaLightUpdate,
}) {
  const ui = new UIOptions();
  ui.setGizmoMode(gizmo.getMode());
  ui.updateBooleanControls(0, false);

  ui.onLightRotate = (deg) => {
    onLightRotate?.(deg);
  };

  ui.onGizmoModeChange = (mode) => {
    gizmo.setMode(mode, "ui");
  };

  ui.onDeleteShape = () => {
    onDeleteShape?.();
  };

  ui.onAddShape = (typeName) => {
    onAddShape?.(typeName);
  };

  ui.onExportScene = () => {
    const text = onExportScene?.();
    if (typeof text === "string") {
      ui.setSceneText(text);
    }
    return text;
  };

  ui.onImportScene = (text) => {
    onImportScene?.(text);
  };

  ui.onApplyBoolean = (mode) => {
    onApplyBoolean?.(mode);
  };

  ui.onUpdateShapeColor = (color) => {
    onUpdateShapeColor?.(color);
  };

  ui.onUpdateShapeParams = (params) => {
    onUpdateShapeParams?.(params);
  };

  ui.onUpdateBoxRounding = (rounding) => {
    onUpdateBoxRounding?.(rounding);
  };

  ui.onPBRUpdate = (settings) => {
    onPBRUpdate?.(settings);
  };

  ui.onPointLightUpdate = (lights) => {
    onPointLightUpdate?.(lights);
  };

  ui.onAreaLightUpdate = (light) => {
    onAreaLightUpdate?.(light);
  };

  return ui;
}
