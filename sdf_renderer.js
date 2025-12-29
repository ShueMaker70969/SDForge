export class SDFRenderer {
  constructor(gl, vsSource, fsSource) {
    this.gl = gl;
    this.program = createProgram(gl, vsSource, fsSource);

    this.uView     = gl.getUniformLocation(this.program, "uView");
    this.uProj     = gl.getUniformLocation(this.program, "uProj");
    this.uCamPos   = gl.getUniformLocation(this.program, "uCameraPos");
  }

  draw(camera) {
    const gl = this.gl;

    gl.useProgram(this.program);

    gl.uniformMatrix4fv(this.uView, false, camera.view);
    gl.uniformMatrix4fv(this.uProj, false, camera.proj);
    gl.uniform3fv(this.uCamPos, camera.eye);

    // Fullscreen triangle (no VAO needed)
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
