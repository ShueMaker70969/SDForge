// ==========================
// SDF PRIMITIVES
// ==========================

// Sphere
float sdfSphere(vec3 p, float r) {
    return length(p) - r;
}

// Axis-aligned box
float sdfBox(vec3 p, vec3 b) {
    vec3 d = abs(p) - b;
    return length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0);
}

// Plane (infinite)
float sdfPlane(vec3 p, vec3 n, float h) {
    return dot(p, normalize(n)) + h;
}

// Capsule (line segment)
float sdfCapsule(vec3 p, vec3 a, vec3 b, float r) {
    vec3 pa = p - a;
    vec3 ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h) - r;
}

// Cylinder (finite)
float sdfCylinder(vec3 p, float r, float h) {
    vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h);
    return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}
