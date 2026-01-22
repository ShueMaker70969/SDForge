import { loadSceneData, serializeScene } from "../scene.js";
import { syncShapesToRenderer } from "./shape_buffers.js";

export function exportSceneText(lightAngle) {
  const payload = serializeScene();
  payload.lightAngle = lightAngle;
  return JSON.stringify(payload);
}

export function importSceneText(
  text,
  {
    sdfRenderer,
    onLightAngleChange,
  } = {},
) {
  if (!text) {
    alert("Scene text is empty.");
    return false;
  }

  let data = null;
  try {
    data = JSON.parse(text);
  } catch (err) {
    console.error("Failed to parse scene text", err);
    alert("Invalid scene data (parse error).");
    return false;
  }

  const light = (typeof data.lightAngle === "number" && Number.isFinite(data.lightAngle))
    ? data.lightAngle
    : null;

  if (!loadSceneData(data)) {
    alert("Scene data did not contain valid shapes.");
    return false;
  }

  if (typeof onLightAngleChange === "function" && light !== null) {
    onLightAngleChange(light);
  }

  if (sdfRenderer) {
    syncShapesToRenderer(sdfRenderer);
  }

  return true;
}
