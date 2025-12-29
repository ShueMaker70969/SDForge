#version 300 es
precision highp float;

out vec4 outColor;

// Camera uniforms
uniform vec3 uCameraPos;
uniform mat4 uView;
uniform mat4 uProj;

// From vertex shader
in vec2 vUV;

// ----------------------------------
// SDF primitives
// ----------------------------------
float sdSphere(vec3 p, float r) {
    return length(p) - r;
}

// ----------------------------------
// Scene SDF
// ----------------------------------
float mapScene(vec3 p) {
    return sdSphere(p - vec3(0.0, 1.0, 0.0), 1.0);
}

// ----------------------------------
// Normal from SDF
// ----------------------------------
vec3 calcNormal(vec3 p) {
    float e = 0.001;
    return normalize(vec3(
        mapScene(p + vec3(e,0,0)) - mapScene(p - vec3(e,0,0)),
        mapScene(p + vec3(0,e,0)) - mapScene(p - vec3(0,e,0)),
        mapScene(p + vec3(0,0,e)) - mapScene(p - vec3(0,0,e))
    ));
}

// ----------------------------------
// Raymarch
// ----------------------------------
bool raymarch(vec3 ro, vec3 rd, out float t) {
    t = 0.0;
    for (int i = 0; i < 128; i++) {
        vec3 p = ro + rd * t;
        float d = mapScene(p);
        if (d < 0.001) return true;
        if (t > 100.0) break;
        t += d;
    }
    return false;
}

// ----------------------------------
// Main
// ----------------------------------
void main() {
    // Screen → NDC
    vec2 ndc = vUV * 2.0 - 1.0;

    // Reconstruct ray in view space
    vec4 rayClip = vec4(ndc, -1.0, 1.0);
    vec4 rayView = inverse(uProj) * rayClip;
    rayView = vec4(rayView.xy, -1.0, 0.0);

    vec3 ro = uCameraPos;
    vec3 rd = normalize((inverse(uView) * rayView).xyz);

    float t;
    if (!raymarch(ro, rd, t)) {
        discard;
    }

    vec3 hitPos = ro + rd * t;
    vec3 normal = calcNormal(hitPos);

    // Simple lighting
    vec3 lightDir = normalize(vec3(0.5, 1.0, 0.3));
    float diff = max(dot(normal, lightDir), 0.0);
    outColor = vec4(vec3(diff), 1.0);

    // Write depth
    vec4 viewPos = uView * vec4(hitPos, 1.0);
    vec4 clipPos = uProj * viewPos;
    float depth = clipPos.z / clipPos.w * 0.5 + 0.5;
    gl_FragDepth = depth;
}
