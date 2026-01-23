import { SDF_VS, SDF_FS } from "./shaders/sdf.js";

function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(gl, vsSource, fsSource) {
  const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
  if (!vs || !fs) return null;
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

const MAX_POINT_LIGHTS = 4;

export class SDFRenderer {
  constructor(gl) {
    this.gl = gl;
    this.program = createProgram(gl, SDF_VS, SDF_FS);

    this.uView   = gl.getUniformLocation(this.program, "uView");
    this.uProj   = gl.getUniformLocation(this.program, "uProj");
    this.uInvView = gl.getUniformLocation(this.program, "uInvView");
    this.uInvProj = gl.getUniformLocation(this.program, "uInvProj");
    this.uCamPos = gl.getUniformLocation(this.program, "uCameraPos");
    this.uLightDir = gl.getUniformLocation(this.program, "uLightDir");

    // Morph uniforms
    this.uMorphT = gl.getUniformLocation(this.program, "uMorphT");
    this.uMorphIdA = gl.getUniformLocation(this.program, "uMorphIdA");
    this.uMorphIdB = gl.getUniformLocation(this.program, "uMorphIdB");

    // PBR uniforms
    this.uAOIntensity = gl.getUniformLocation(this.program, "uAOIntensity");
    this.uPointLightCount = gl.getUniformLocation(this.program, "uPointLightCount");
    this.uPointLightPos = [];
    this.uPointLightColor = [];
    this.uPointLightIntensity = [];
    this.uPointLightRadius = [];
    
    for (let i = 0; i < MAX_POINT_LIGHTS; i++) {
      this.uPointLightPos.push(gl.getUniformLocation(this.program, `uPointLightPos[${i}]`));
      this.uPointLightColor.push(gl.getUniformLocation(this.program, `uPointLightColor[${i}]`));
      this.uPointLightIntensity.push(gl.getUniformLocation(this.program, `uPointLightIntensity[${i}]`));
      this.uPointLightRadius.push(gl.getUniformLocation(this.program, `uPointLightRadius[${i}]`));
    }

    this.uAreaLightEnabled = gl.getUniformLocation(this.program, "uAreaLightEnabled");
    this.uAreaLightPos = gl.getUniformLocation(this.program, "uAreaLightPos");
    this.uAreaLightColor = gl.getUniformLocation(this.program, "uAreaLightColor");
    this.uAreaLightIntensity = gl.getUniformLocation(this.program, "uAreaLightIntensity");
    this.uAreaLightRight = gl.getUniformLocation(this.program, "uAreaLightRight");
    this.uAreaLightUp = gl.getUniformLocation(this.program, "uAreaLightUp");
    this.uAreaLightSize = gl.getUniformLocation(this.program, "uAreaLightSize");

    this.uShapeCount = gl.getUniformLocation(this.program, "uShapeCount");
    this.uShapePos   = gl.getUniformLocation(this.program, "uShapePos");
    this.uShapeType  = gl.getUniformLocation(this.program, "uShapeType");
    this.uShapeParams= gl.getUniformLocation(this.program, "uShapeParams");
    this.uShapeRot   = gl.getUniformLocation(this.program, "uShapeRot");
    this.uShapeScale = gl.getUniformLocation(this.program, "uShapeScale");
    this.uShapeColor = gl.getUniformLocation(this.program, "uShapeColor");
    this.uBooleanCount = gl.getUniformLocation(this.program, "uBooleanCount");
    this.uBooleanOp = gl.getUniformLocation(this.program, "uBooleanOp");
    this.uBooleanShapeType = gl.getUniformLocation(this.program, "uBooleanShapeType");
    this.uBooleanPos = gl.getUniformLocation(this.program, "uBooleanPos");
    this.uBooleanRot = gl.getUniformLocation(this.program, "uBooleanRot");
    this.uBooleanScale = gl.getUniformLocation(this.program, "uBooleanScale");
    this.uBooleanParams = gl.getUniformLocation(this.program, "uBooleanParams");
    this.uBooleanSmooth = gl.getUniformLocation(this.program, "uBooleanSmooth");
  }

  setShapes({ count, positions, rotations, types, params, scales }) {
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.uniform1i(this.uShapeCount, count);
    gl.uniform3fv(this.uShapePos, positions);
    gl.uniform4fv(this.uShapeRot, rotations);
    gl.uniform1iv(this.uShapeType, types);
    gl.uniform4fv(this.uShapeParams, params);
  }

  draw({ 
    view, proj, invView, invProj, cameraPos, width, height, shapeData, lightDir,
    morphT = 0.0,
    morphIdA, // Optional args
    morphIdB,
    aoIntensity = 1.0,
    pointLights = [],
    areaLight = null,
  }) {
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.viewport(0, 0, width, height);

    if (lightDir) gl.uniform3fv(this.uLightDir, lightDir);

    // --- MORPH FIX ---
    // Use the argument if provided, otherwise check the global window object
    const finalIdA = (morphIdA !== undefined) ? morphIdA : (window.morphIdA || 0);
    const finalIdB = (morphIdB !== undefined) ? morphIdB : (window.morphIdB || 1);

    gl.uniform1f(this.uMorphT, morphT);
    gl.uniform1i(this.uMorphIdA, finalIdA);
    gl.uniform1i(this.uMorphIdB, finalIdB);
    // -----------------

    gl.uniform1f(this.uAOIntensity, aoIntensity);

    const lightCount = Math.min(pointLights.length, MAX_POINT_LIGHTS);
    gl.uniform1i(this.uPointLightCount, lightCount);
    
    for (let i = 0; i < MAX_POINT_LIGHTS; i++) {
      if (i < lightCount) {
        const light = pointLights[i];
        gl.uniform3fv(this.uPointLightPos[i], light.position || [0, 5, 0]);
        gl.uniform3fv(this.uPointLightColor[i], light.color || [1, 1, 1]);
        gl.uniform1f(this.uPointLightIntensity[i], light.intensity ?? 10.0);
        gl.uniform1f(this.uPointLightRadius[i], light.radius ?? 0.0);
      } else {
        gl.uniform3fv(this.uPointLightPos[i], [0, 0, 0]);
        gl.uniform3fv(this.uPointLightColor[i], [0, 0, 0]);
        gl.uniform1f(this.uPointLightIntensity[i], 0);
        gl.uniform1f(this.uPointLightRadius[i], 0);
      }
    }

    if (areaLight && areaLight.enabled) {
      gl.uniform1i(this.uAreaLightEnabled, 1);
      gl.uniform3fv(this.uAreaLightPos, areaLight.position || [0, 5, 0]);
      gl.uniform3fv(this.uAreaLightColor, areaLight.color || [1, 1, 1]);
      gl.uniform1f(this.uAreaLightIntensity, areaLight.intensity ?? 5.0);
      gl.uniform3fv(this.uAreaLightRight, areaLight.right || [1, 0, 0]);
      gl.uniform3fv(this.uAreaLightUp, areaLight.up || [0, 0, 1]);
      gl.uniform2fv(this.uAreaLightSize, areaLight.size || [2, 2]);
    } else {
      gl.uniform1i(this.uAreaLightEnabled, 0);
    }

    gl.uniformMatrix4fv(this.uView, false, view);
    gl.uniformMatrix4fv(this.uProj, false, proj);
    gl.uniformMatrix4fv(this.uInvView, false, invView);
    gl.uniformMatrix4fv(this.uInvProj, false, invProj);
    gl.uniform3fv(this.uCamPos, cameraPos);

    gl.uniform1i(this.uShapeCount, shapeData.count);
    gl.uniform3fv(this.uShapePos, shapeData.positions);
    gl.uniform4fv(this.uShapeRot, shapeData.rotations);
    gl.uniform1iv(this.uShapeType, shapeData.types);
    gl.uniform4fv(this.uShapeParams, shapeData.params);
    gl.uniform3fv(this.uShapeScale, shapeData.scales);
    gl.uniform3fv(this.uShapeColor, shapeData.colors);
    gl.uniform1iv(this.uBooleanCount, shapeData.booleanCounts);
    gl.uniform1iv(this.uBooleanOp, shapeData.booleanOps);
    gl.uniform1iv(this.uBooleanShapeType, shapeData.booleanTypes);
    gl.uniform3fv(this.uBooleanPos, shapeData.booleanPositions);
    gl.uniform4fv(this.uBooleanRot, shapeData.booleanRotations);
    gl.uniform3fv(this.uBooleanScale, shapeData.booleanScales);
    gl.uniform4fv(this.uBooleanParams, shapeData.booleanParams);
    gl.uniform1fv(this.uBooleanSmooth, shapeData.booleanSmooths);

    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}