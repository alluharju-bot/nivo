/** Conditional importance sampling of analytic lights. The environment keeps
 * its existing probability. Both NEE and BSDF-hit MIS use the same conditional
 * PDF; no light is brightened, moved, or added. A 10% uniform mixture retains
 * support for every light, including grazing/very distant lights. */
const helpers = /* glsl */ `
  vec3 nivoLightNormal = vec3(0.0);
  float nivoLightWeight(Light light, vec3 origin) {
    float power = max(0.0, dot(light.color, vec3(0.2126, 0.7152, 0.0722)) * light.intensity);
    if (light.type == DIR_LIGHT_TYPE) return power * (dot(nivoLightNormal, nivoLightNormal) > 0.0 ? max(0.0, dot(nivoLightNormal, light.u)) : 1.0);
    vec3 offset = (light.type == POINT_LIGHT_TYPE ? light.u : light.position) - origin;
    float distance2 = max(dot(offset, offset), 1e-6);
    if (dot(nivoLightNormal, nivoLightNormal) > 0.0) power *= max(0.0, dot(nivoLightNormal, normalize(offset)));
    if (light.type == RECT_AREA_LIGHT_TYPE || light.type == CIRC_AREA_LIGHT_TYPE) {
      float cosine = max(0.0, dot(normalize(offset), normalize(cross(light.u, light.v))));
      return power * max(light.area, 0.0) * cosine / max(distance2, light.area);
    }
    return power / pow(distance2, max(light.decay, 0.0) * 0.5);
  }
  float nivoLightTotal(sampler2D map, uint count, vec3 origin) {
    float total = 0.0;
    for (uint i = 0u; i < count; i++) total += nivoLightWeight(readLightInfo(map, i), origin);
    return total;
  }
  float nivoLightProbability(sampler2D map, uint count, uint index, vec3 origin) {
    if (count > 64u) return 1.0 / float(count);
    float total = nivoLightTotal(map, count, origin);
    return total > 0.0 ? 0.9 * nivoLightWeight(readLightInfo(map, index), origin) / total + 0.1 / float(count) : 1.0 / float(count);
  }
`;

export function importanceSampleLights(shader: string) {
  const start =
    'LightRecord randomLightSample( sampler2D lights, sampler2DArray iesProfiles, uint lightCount, vec3 rayOrigin, vec3 ruv ) {';
  const direct =
    'vec3 directLightContribution( vec3 worldWo, SurfaceRecord surf, RenderState state, vec3 rayOrigin ) {';
  const pick = 'uint l = uint( ruv.x * float( lightCount ) );';
  const hit = 'misHeuristic( scatterRec.pdf, lightRec.pdf / lightsDenom )';
  for (const marker of [start, pick, hit, direct])
    if (shader.split(marker).length !== 2)
      throw new Error('Renderöinnin valonäytteistys ei vastaa kirjastoversiota.');
  shader = shader
    .replace(
      direct,
      `${direct}\n nivoLightNormal = surf.volumeParticle ? vec3(0.0) : surf.faceNormal;`,
    )
    .replace(start, `${helpers}\n${start}`)
    .replace(
      pick,
      /* glsl */ `
    uint l = min(uint(ruv.x * float(lightCount)), lightCount - 1u);
    float probability = 1.0 / float(lightCount);
    if (lightCount <= 64u) {
      // Weighted reservoir with a remapped uniform variate. After either
      // branch u is uniform again, so the next replacement has probability
      // weight / total. Read each light record once, without a 64-entry array.
      bool uniformChoice = ruv.x < 0.1;
      float u = uniformChoice ? ruv.x / 0.1 : (ruv.x - 0.1) / 0.9;
      l = min(uint(u * float(lightCount)), lightCount - 1u);
      float total = 0.0, chosenWeight = 0.0;
      for (uint i = 0u; i < lightCount; i++) {
        float weight = nivoLightWeight(readLightInfo(lights, i), rayOrigin);
        total += weight;
        if (uniformChoice) {
          if (i == l) chosenWeight = weight;
        } else if (weight > 0.0) {
          float p = weight / total;
          if (u < p) { l = i; chosenWeight = weight; u /= p; }
          else u = (u - p) / max(1.0 - p, 1e-8);
        }
      }
      if (total > 0.0) probability = 0.9 * chosenWeight / total + 0.1 / float(lightCount);
    }
  `,
    )
    .replace(
      hit,
      'misHeuristic( scatterRec.pdf, lightRec.pdf * float(lights.count) * nivoLightProbability(lights.tex, lights.count, i, ray.origin) / lightsDenom )',
    );
  // This return belongs to randomLightSample, before the next helper function.
  const offset = shader.indexOf(start);
  const tail = shader.slice(offset);
  const at = tail.indexOf('return result;');
  if (at < 0) throw new Error('Renderöinnin valonäytteen tulos puuttuu.');
  return (
    shader.slice(0, offset + at) +
    'result.pdf *= probability * float(lightCount);\n' +
    shader.slice(offset + at)
  );
}
