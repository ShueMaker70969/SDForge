#define MAX_STEPS 100
#define MAX_DIST  100.0
#define EPSILON   0.001

float raymarch(vec3 ro, vec3 rd) {
    float t = 0.0;

    for (int i = 0; i < MAX_STEPS; i++) {
        vec3 p = ro + rd * t;
        float d = mapScene(p);

        if (d < EPSILON) return t;

        t += d;
        if (t > MAX_DIST) break;
    }

    return -1.0;
}
