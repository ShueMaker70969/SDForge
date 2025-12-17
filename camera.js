// camera.js

// Uses global vec3 from gl-matrix (loaded in index.html)

export class OrbitCamera {
  constructor(target = vec3.fromValues(0, 0, 0)) {
    this.target = target;
    this.radius = 8.0;
    this.azimuth = Math.PI / 4;
    this.elevation = Math.PI / 6;
  }

  getEye() {
    const { radius, azimuth, elevation, target } = this;
    const x = target[0] + radius * Math.cos(elevation) * Math.sin(azimuth);
    const y = target[1] + radius * Math.sin(elevation);
    const z = target[2] + radius * Math.cos(elevation) * Math.cos(azimuth);
    return vec3.fromValues(x, y, z);
  }

  rotate(dxNorm, dyNorm) {
    const rotSpeed = 2 * Math.PI;
    this.azimuth -= dxNorm * rotSpeed;
    this.elevation -= dyNorm * rotSpeed;

    const maxElev = Math.PI / 2 - 0.01;
    const minElev = -Math.PI / 2 + 0.01;
    this.elevation = Math.max(minElev, Math.min(maxElev, this.elevation));
  }

  zoom(delta) {
    const zoomFactor = 1.0 + delta * 0.001;
    this.radius *= zoomFactor;
    this.radius = Math.max(1.0, Math.min(50.0, this.radius));
  }

  pan(dx, dy) {
    const eye = this.getEye();
    const forward = vec3.create();
    vec3.sub(forward, this.target, eye);
    vec3.normalize(forward, forward);

    const up = vec3.fromValues(0, 1, 0);
    const right = vec3.create();
    vec3.cross(right, forward, up);
    vec3.normalize(right, right);

    const realUp = vec3.create();
    vec3.cross(realUp, right, forward);
    vec3.normalize(realUp, realUp);

    const panSpeed = this.radius * 0.001;
    const panX = -dx * panSpeed;
    const panY = dy * panSpeed;

    const panVec = vec3.create();
    const tmp = vec3.create();

    vec3.scale(tmp, right, panX);
    vec3.add(panVec, panVec, tmp);
    vec3.scale(tmp, realUp, panY);
    vec3.add(panVec, panVec, tmp);

    vec3.add(this.target, this.target, panVec);
  }
}
