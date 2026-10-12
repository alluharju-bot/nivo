/** Limit rare indirect samples before averaging, not already converged pixels.
 * RGB is scaled together to preserve hue. Camera-visible emission/background and
 * the first surface's direct lighting keep their full range. Like Cycles' indirect
 * clamp, this is biased: extremely bright caustics may lose energy. */
export const indirectSampleLimit = 10;
export const fireflyGLSL = /* glsl */ `
  void nivoAddRadiance(inout vec3 direct, inout vec3 indirect, vec3 incoming, bool cameraPath) {
    if (any(isnan(incoming)) || any(isinf(incoming))) return;
    incoming = max(incoming, vec3(0.0));
    if (cameraPath) direct += incoming;
    else indirect += incoming;
  }
  vec3 nivoLimitIndirect(vec3 indirect) {
    float peak = max(indirect.r, max(indirect.g, indirect.b));
    return indirect * min(1.0, ${indirectSampleLimit.toFixed(1)} / max(peak, 1e-8));
  }
`;

/** Guarded adapter for the pinned path tracer; all seven radiance contributions
 * must be routed, including MIS/non-MIS alternatives and early path exits. */
export function stableTraceSamples(shader: string) {
  const main = 'void main() {',
    trace = 'int hitType = traceScene( ray, state.fogMaterial, surfaceHit );',
    finish = 'gl_FragColor.a *= opacity;';
  const contribution = /gl_FragColor\.rgb\s*\+=\s*([^;]+);/g;
  if (
    [main, trace, finish].some((s) => shader.split(s).length !== 2) ||
    [...shader.matchAll(contribution)].length !== 7
  )
    throw new Error('Renderöinnin näytelaskennan versio ei vastaa sovellusta.');
  return shader
    .replace(main, `${fireflyGLSL}\n${main}\nvec3 nivoIndirect = vec3(0.0);`)
    .replace(trace, `${trace}\nbool nivoCameraPath = state.firstRay || state.transmissiveRay;`)
    .replace(
      contribution,
      (_, value: string) =>
        `nivoAddRadiance(gl_FragColor.rgb, nivoIndirect, ${value}, nivoCameraPath);`,
    )
    .replace(finish, `gl_FragColor.rgb += nivoLimitIndirect(nivoIndirect);\n${finish}`);
}
