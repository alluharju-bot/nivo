/** Pinned tracer adapter, applied after lobe separation. Both light branches
 * used to inline the full shadow traversal, BSDF and diffuse-share calculation.
 * Select the sample first, then evaluate it once. Preserve the Sobol dimensions,
 * PDFs, MIS, transmission and multiplication order of both original branches. */
export function shareDirectLightEvaluation(shader: string, importance: boolean) {
  const start =
    'vec3 directLightContribution( vec3 worldWo, SurfaceRecord surf, RenderState state, vec3 rayOrigin ) {';
  if (shader.split(start).length !== 2)
    throw new Error('Renderöinnin suoran valon versio ei vastaa sovellusta.');
  const at = shader.indexOf(start);
  let end = at + start.length,
    depth = 1;
  for (; end < shader.length && depth; end++) {
    if (shader[end] === '{') depth++;
    if (shader[end] === '}') depth--;
  }
  const original = shader.slice(at, end);
  if (
    depth ||
    (original.match(/! attenuateHit\(/g)?.length ?? 0) !== 2 ||
    (original.match(/= bsdfResult\(/g)?.length ?? 0) !== 2 ||
    (original.match(/nivoDirectShare = nivoDiffuseFraction\(/g)?.length ?? 0) !== 2
  )
    throw new Error('Renderöinnin suoran valon laskenta ei vastaa sovellusta.');
  return (
    shader.slice(0, at) +
    /* glsl */ `
    ${start}
      nivoDirectShare = vec3(0.0);
      ${importance ? 'nivoLightNormal = surf.volumeParticle ? vec3(0.0) : surf.faceNormal;' : ''}
      vec3 result = vec3(0.0);
      vec3 incoming = vec3(0.0), direction = vec3(0.0);
      float pdf = 0.0, distance = INFINITY;
      bool punctual = false, fromEnvironment = false;
      if (lightsDenom != 0.0 && rand(5) < float(lights.count) / lightsDenom) {
        LightRecord light = randomLightSample(lights.tex, iesProfiles, lights.count, rayOrigin, rand3(6));
        incoming = light.emission;
        direction = light.direction;
        distance = light.dist;
        pdf = light.pdf;
        punctual = light.type == SPOT_LIGHT_TYPE || light.type == DIR_LIGHT_TYPE || light.type == POINT_LIGHT_TYPE;
      } else if (envMapInfo.totalSum != 0.0 && environmentIntensity != 0.0) {
        fromEnvironment = true;
        vec3 envColor, envDirection;
        pdf = sampleEquirectProbability(rand2(7), envColor, envDirection);
        direction = invEnvRotation3x3 * envDirection;
        incoming = envColor;
      }
      // The environment's scale stays after attenuation, matching the original
      // product order rather than changing floating-point rounding of bright paths.
      if (!surf.volumeParticle && dot(surf.faceNormal, direction) < 0.0) pdf = 0.0;
      Ray shadowRay;
      shadowRay.origin = rayOrigin;
      shadowRay.direction = direction;
      vec3 attenuation;
      if (pdf > 0.0 && isDirectionValid(direction, surf.normal, surf.faceNormal)
          && !attenuateHit(state, shadowRay, distance, attenuation)) {
        vec3 sampleColor;
        float materialPdf = bsdfResult(worldWo, direction, surf, sampleColor);
        nivoDirectShare = nivoDiffuseFraction(worldWo, direction, surf, sampleColor);
        if (materialPdf > 0.0 && all(greaterThanEqual(sampleColor, vec3(0.0)))) {
          pdf /= lightsDenom;
          float weight = punctual ? 1.0 : misHeuristic(pdf, materialPdf);
          if (fromEnvironment) attenuation *= environmentIntensity;
          result = attenuation * incoming * state.throughputColor * sampleColor * weight / pdf;
        }
      }
      return result;
    }
    ` +
    shader.slice(end)
  );
}
