import { vec3 } from "https://cdn.jsdelivr.net/npm/gl-matrix@3.4.3/esm/index.js";
export class OrbitCamera {
  constructor() {
    this.target = vec3.fromValues(0, 0, 0);
    this.radius = 12;
    this.azimuth = Math.PI / 4;
    this.elevation = Math.PI / 6;
  }

  getEye() {
    const x = this.target[0] + this.radius * Math.cos(this.elevation) * Math.sin(this.azimuth);
    const y = this.target[1] + this.radius * Math.sin(this.elevation);
    const z = this.target[2] + this.radius * Math.cos(this.elevation) * Math.cos(this.azimuth);
    return vec3.fromValues(x, y, z);
  }

  rotate(dx, dy) {
    const speed = 2 * Math.PI;
    this.azimuth -= dx * speed;
    this.elevation -= dy * speed;
    this.elevation = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.elevation));
  }

  zoom(delta) {
    this.radius *= (1 + delta * 0.001);
    this.radius = Math.max(2, Math.min(50, this.radius));
  }

  pan(dx, dy) {
    const eye = this.getEye();
    const forward = vec3.normalize(vec3.create(), vec3.sub(vec3.create(), this.target, eye));
    const right = vec3.normalize(vec3.create(), vec3.cross(vec3.create(), forward, [0,1,0]));
    const up = vec3.cross(vec3.create(), right, forward);

    const scale = this.radius * 0.002;
    vec3.scaleAndAdd(this.target, this.target, right, -dx * scale);
    vec3.scaleAndAdd(this.target, this.target, up,  dy * scale);
  }
}