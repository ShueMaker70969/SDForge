import { mat4, vec3, quat } from "https://cdn.jsdelivr.net/npm/gl-matrix@3.4.3/esm/index.js";
import { processPendingPick } from "../controls/input.js";
import {
  MAX_SHAPES,
  selectedShape,
  selectedShapes,
  shapes,
} from "../scene.js";
import { buildSceneUniformBuffers, getShapeUniformData } from "../scene/shape_buffers.js";

const SECONDARY_OUTLINE_COLOR = [1.0, 0.8, 0.0];
const ACTIVE_OUTLINE_COLOR = [1.0, 0.5, 0.0];
const SHAPE_ID_SCALE = 255;
const SHAPE_ID_TOLERANCE = 0.25 / SHAPE_ID_SCALE;

export function createRenderLoop({
  gl,
  canvas,
  camera,
  sdfRenderer,
  gizmo,
  lineProgram,
  lineAttributes,
  lineUniforms,
  gridGeometry,
  axisGeometry,
  outlineProgram,
  outlineUniforms,
  outlineTargets,
  lightingState,
  pbrSettingsRef,
  textureSettingsRef,
  textureTypeMap,
  pointLightsRef,
  areaLightRef,
  invView,
  invProj,
}) {
  const view = mat4.create();
  const proj = mat4.create();
  const selectedIdArray = new Float32Array(MAX_SHAPES);

  function render() {
    updateLightDirection(lightingState);
    buildSceneUniformBuffers();
    const shapeData = getShapeUniformData();

    selectedIdArray.fill(0);
    const selectionCount = Math.min(selectedShapes.length, MAX_SHAPES);
    for (let i = 0; i < selectionCount; i++) {
      selectedIdArray[i] = (selectedShapes[i] + 1) / SHAPE_ID_SCALE;
    }

    mat4.lookAt(view, camera.getEye(), camera.target, [0, 1, 0]);
    mat4.perspective(
      proj,
      Math.PI / 4,
      canvas.width / canvas.height,
      0.1,
      100.0,
    );

    mat4.invert(invView, view);
    mat4.invert(invProj, proj);

    drawScenePass({
      gl,
      camera,
      view,
      proj,
      invView,
      invProj,
      sdfRenderer,
      outlineTargets,
      lineProgram,
      lineAttributes,
      lineUniforms,
      gridGeometry,
      axisGeometry,
      shapeData,
      lightingState,
      pbrSettingsRef,
      textureSettingsRef,
      textureTypeMap,
      pointLightsRef,
      areaLightRef,
    });

    drawOutlinePass({
      gl,
      canvas,
      outlineProgram,
      outlineUniforms,
      outlineTargets,
      selectedIdArray,
      selectionCount,
    });

    drawGizmo({
      gl,
      lineProgram,
      lineUniforms,
      view,
      proj,
      gizmo,
    });

    processPendingPick(gl, outlineTargets.framebuffer);
    requestAnimationFrame(render);
  }

  return {
    start: () => {
      requestAnimationFrame(render);
    },
  };
}

function drawScenePass({
  gl,
  camera,
  view,
  proj,
  invView,
  invProj,
  sdfRenderer,
  outlineTargets,
  lineProgram,
  lineAttributes,
  lineUniforms,
  gridGeometry,
  axisGeometry,
  shapeData,
  lightingState,
  pbrSettingsRef,
  textureSettingsRef,
  textureTypeMap,
  pointLightsRef,
  areaLightRef,
}) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, outlineTargets.framebuffer);
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  gl.clearColor(0.08, 0.08, 0.08, 1);

  gl.enable(gl.DEPTH_TEST);
  gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  sdfRenderer.draw({
    view,
    proj,
    invView,
    invProj,
    cameraPos: camera.getEye(),
    width: gl.canvas.width,
    height: gl.canvas.height,
    morphT: window.morphFactor ?? 0,
    shapeData: {
      count: shapes.length,
      positions: shapeData.positions,
      rotations: shapeData.rotations,
      types: shapeData.types,
      params: shapeData.params,
      scales: shapeData.scales,
      colors: shapeData.colors,
      booleanCounts: shapeData.booleanCounts,
      booleanTypes: shapeData.booleanTypes,
      booleanParams: shapeData.booleanParams,
      booleanPositions: shapeData.booleanPositions,
      booleanRotations: shapeData.booleanRotations,
      booleanScales: shapeData.booleanScales,
      booleanOps: shapeData.booleanOps,
      booleanSmooths: shapeData.booleanSmooths,
    },
    lightDir: lightingState.direction,
    aoIntensity: pbrSettingsRef.aoIntensity,
    textureType: textureTypeMap[textureSettingsRef.type] ?? 0,
    textureScale: textureSettingsRef.scale,
    textureDisplacement: textureSettingsRef.displacement,
    pointLights: pointLightsRef,
    areaLight: areaLightRef,
  });

  gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
  gl.useProgram(lineProgram);
  gl.uniformMatrix4fv(lineUniforms.view, false, view);
  gl.uniformMatrix4fv(lineUniforms.proj, false, proj);

  gl.bindBuffer(gl.ARRAY_BUFFER, gridGeometry.positionBuffer);
  gl.enableVertexAttribArray(lineAttributes.position);
  gl.vertexAttribPointer(lineAttributes.position, 3, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, gridGeometry.colorBuffer);
  gl.enableVertexAttribArray(lineAttributes.color);
  gl.vertexAttribPointer(lineAttributes.color, 3, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.LINES, 0, gridGeometry.vertexCount);

  gl.bindBuffer(gl.ARRAY_BUFFER, axisGeometry.positionBuffer);
  gl.vertexAttribPointer(lineAttributes.position, 3, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, axisGeometry.colorBuffer);
  gl.vertexAttribPointer(lineAttributes.color, 3, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.LINES, 0, axisGeometry.vertexCount);
}

function drawOutlinePass({
  gl,
  canvas,
  outlineProgram,
  outlineUniforms,
  outlineTargets,
  selectedIdArray,
  selectionCount,
}) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.disable(gl.DEPTH_TEST);

  gl.useProgram(outlineProgram);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, outlineTargets.sceneColorTexture);
  gl.uniform1i(outlineUniforms.sceneColor, 0);

  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, outlineTargets.selectionMaskTexture);
  gl.uniform1i(outlineUniforms.selectionMask, 1);

  gl.uniform2f(outlineUniforms.texelSize, 1.0 / canvas.width, 1.0 / canvas.height);
  gl.uniform3f(
    outlineUniforms.outlineColor,
    SECONDARY_OUTLINE_COLOR[0],
    SECONDARY_OUTLINE_COLOR[1],
    SECONDARY_OUTLINE_COLOR[2],
  );
  gl.uniform3f(
    outlineUniforms.activeOutlineColor,
    ACTIVE_OUTLINE_COLOR[0],
    ACTIVE_OUTLINE_COLOR[1],
    ACTIVE_OUTLINE_COLOR[2],
  );
  gl.uniform1f(outlineUniforms.thickness, 2.0);
  const activeIdValue = selectedShape >= 0 ? (selectedShape + 1) / SHAPE_ID_SCALE : 0.0;
  gl.uniform1f(outlineUniforms.activeId, activeIdValue);
  gl.uniform1i(outlineUniforms.selectedCount, selectionCount);
  gl.uniform1fv(outlineUniforms.selectedIds, selectedIdArray);
  gl.uniform1f(outlineUniforms.idTolerance, SHAPE_ID_TOLERANCE);

  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function drawGizmo({
  gl,
  lineProgram,
  lineUniforms,
  view,
  proj,
  gizmo,
}) {
  if (selectedShape === -1 || gizmo.getMode() === "select") {
    return;
  }

  gl.useProgram(lineProgram);
  gl.uniformMatrix4fv(lineUniforms.view, false, view);
  gl.uniformMatrix4fv(lineUniforms.proj, false, proj);
  gl.enable(gl.DEPTH_TEST);
  gizmo.draw(shapes[selectedShape]);
}

function updateLightDirection(lightingState) {
  const q = quat.create();
  quat.setAxisAngle(q, [0, 1, 0], lightingState.angle);
  vec3.transformQuat(lightingState.direction, lightingState.baseDir, q);
}
