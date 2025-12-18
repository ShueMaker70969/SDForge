float mapScene(vec3 p) {
    float d = sdfSphere(p - vec3(0.0, 0.0, 0.0), 1.0);

    float box = sdfBox(p - vec3(1.5, 0.0, 0.0), vec3(0.5));
    d = opUnion(d, box);

    return d;
}
