/** One independent Sobol path per pixel per iteration. Re-entering the complete
 * integrator for selected pixels triggered GPU hangs on the gel/mirror scene.
 * More iterations retain all physical paths
 * without a second, divergent invocation inside the same fragment. */
export function traceSamplingShader(shader: string) {
  const main = 'void main() {',
    background = 'return backgroundIntensity * sampleEquirectColor( backgroundMap, sampleDir );';
  if ([main, background].some((marker) => shader.split(marker).length !== 2))
    throw new Error('Renderöinnin näytteistyksen versio ei vastaa sovellusta.');
  // Every tracer lookup uses a single-level, non-mipmapped texture. Implicit
  // gradients serve no purpose here, and are undefined across divergent rays.
  // D3D's compiler can try to unroll the entire path/light loop to calculate
  // those gradients. Explicit LOD preserves the same texels and filtering
  // without imposing that dependency on the Windows shader compiler.
  const explicit = shader.replace(/\b(?:texture2D|texture)\s*\(/g, 'nivoTextureLevel0(');
  return (
    `vec4 nivoTextureLevel0(sampler2D map, vec2 uv) { return textureLod(map, uv, 0.0); }
    vec4 nivoTextureLevel0(sampler2DArray map, vec3 uv) { return textureLod(map, uv, 0.0); }
    uniform vec3 nivoBackgroundColor;
    ${explicit}`
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
