import {
  MAX_BOOLEAN_OPS,
  MAX_SHAPES,
  buildShapeUniforms,
  shapes,
} from "../scene.js";

const shapeBuffers = {
  positions: new Float32Array(MAX_SHAPES * 3),
  types: new Int32Array(MAX_SHAPES),
  params: new Float32Array(MAX_SHAPES * 4),
  rotations: new Float32Array(MAX_SHAPES * 4),
  scales: new Float32Array(MAX_SHAPES * 3),
  colors: new Float32Array(MAX_SHAPES * 3),
  booleanCounts: new Int32Array(MAX_SHAPES),
  booleanTypes: new Int32Array(MAX_SHAPES * MAX_BOOLEAN_OPS),
  booleanParams: new Float32Array(MAX_SHAPES * MAX_BOOLEAN_OPS * 4),
  booleanPositions: new Float32Array(MAX_SHAPES * MAX_BOOLEAN_OPS * 3),
  booleanRotations: new Float32Array(MAX_SHAPES * MAX_BOOLEAN_OPS * 4),
  booleanScales: new Float32Array(MAX_SHAPES * MAX_BOOLEAN_OPS * 3),
  booleanOps: new Int32Array(MAX_SHAPES * MAX_BOOLEAN_OPS),
  booleanSmooths: new Float32Array(MAX_SHAPES * MAX_BOOLEAN_OPS),
};

const uploadBuffers = {
  positions: new Float32Array(MAX_SHAPES * 3),
  types: new Int32Array(MAX_SHAPES),
  params: new Float32Array(MAX_SHAPES * 4),
  rotations: new Float32Array(MAX_SHAPES * 4),
};

export function buildSceneUniformBuffers() {
  buildShapeUniforms(
    shapeBuffers.positions,
    shapeBuffers.types,
    shapeBuffers.params,
    shapeBuffers.rotations,
    shapeBuffers.scales,
    shapeBuffers.colors,
    shapeBuffers.booleanCounts,
    shapeBuffers.booleanTypes,
    shapeBuffers.booleanParams,
    shapeBuffers.booleanPositions,
    shapeBuffers.booleanRotations,
    shapeBuffers.booleanScales,
    shapeBuffers.booleanOps,
    shapeBuffers.booleanSmooths,
  );
}

export function getShapeUniformData() {
  return shapeBuffers;
}

export function syncShapesToRenderer(sdfRenderer) {
  shapes.forEach((s, i) => {
    uploadBuffers.positions.set(s.pos, i * 3);
    uploadBuffers.types[i] = s.type;
    uploadBuffers.params.set(s.params, i * 4);
    uploadBuffers.rotations.set(s.rotation, i * 4);
  });

  sdfRenderer.setShapes({
    count: shapes.length,
    positions: uploadBuffers.positions,
    types: uploadBuffers.types,
    params: uploadBuffers.params,
    rotations: uploadBuffers.rotations,
  });
}
