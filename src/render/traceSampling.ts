/** One independent Sobol path per pixel per iteration. Re-entering the complete
 * integrator for selected pixels triggered GPU hangs on the gel/mirror scene.
 * More iterations retain all physical paths
 * without a second, divergent invocation inside the same fragment. */
export function traceSamplingShader(shader: string) {
  const main = 'void main() {',
    background = 'return backgroundIntensity * sampleEquirectColor( backgroundMap, sampleDir );';
  if ([main, background].some((marker) => shader.split(marker).length !== 2))
    throw new Error('Renderöinnin näytteistyksen versio ei vastaa sovellusta.');
  return (
    `uniform vec3 nivoBackgroundColor;
    ${shader}`
      .replace(main, 'void nivoTracePath() {\nsobolBounceIndex = 0u;')
      .replace(
        background,
        `
        #if NIVO_SOLID_BACKGROUND == 1
          return backgroundIntensity * nivoBackgroundColor;
        #else
          return backgroundIntensity * sampleEquirectColor( backgroundMap, sampleDir );
        #endif`,
      ) + '\nvoid main() { nivoTracePath(); }'
  );
}
