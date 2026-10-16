import * as THREE from 'three';
import type { WebGLPathTracer } from 'three-gpu-pathtracer';

/** A bounded second independent path for still-noisy glossy pixels. Both paths
 * form one iteration estimate; every iteration retains equal weight. Choosing
 * the budget from the previous variance never rejects a current bright sample. */
export function adaptiveTraceSamples(shader: string) {
  const main = 'void main() {',
    pixel = 'sobolPixelIndex = ( uint( gl_FragCoord.x ) << 16 ) | uint( gl_FragCoord.y );',
    background = 'return backgroundIntensity * sampleEquirectColor( backgroundMap, sampleDir );';
  if ([main, pixel, background].some((marker) => shader.split(marker).length !== 2))
    throw new Error('Renderöinnin mukautuvan näytteistyksen versio ei vastaa sovellusta.');
  return (
    `uniform sampler2D nivoNoiseVariance;
    uniform vec3 nivoBackgroundColor;
    uniform bool nivoAdaptive;
    bool nivoExtraStream;
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
      )
      .replace(pixel, `${pixel}\nif(nivoExtraStream) sobolPixelIndex ^= 0x9e3779b9u;`) +
    /* glsl */ `
      void main() {
        // Decide from completed history, before drawing this iteration.
        bool extra = false;
        // A separate image background already occupies the 16th sampler on
        // minimum WebGL2 hardware. Keep the normal integrator on that path.
        #if FEATURE_BACKGROUND_MAP == 0 || NIVO_SOLID_BACKGROUND == 1
        vec2 noise = texture2D(nivoNoiseVariance,vUv).rg;
        // A negative mean marks non-glossy pixels in the variance pass. Packing
        // this flag avoids exceeding WebGL2's minimum 16 sampler limit.
        extra = nivoAdaptive && noise.r >= 0.0 && noise.g > max(noise.r * noise.r * 0.0225, 1e-6);
        #endif
        nivoExtraStream = false;
        nivoTracePath();
        if(extra) {
          vec4 beauty = gl_FragColor, diffuse = nivoDiffuseOutput, coverage = nivoCoverageOutput;
          nivoExtraStream = true;
          nivoTracePath();
          gl_FragColor = (gl_FragColor + beauty) * 0.5;
          nivoDiffuseOutput = (nivoDiffuseOutput + diffuse) * 0.5;
          nivoCoverageOutput = (nivoCoverageOutput + coverage) * 0.5;
        }
      }`
  );
}
export function setTraceNoise(
  tracer: WebGLPathTracer,
  variance: THREE.Texture | undefined,
  samples: number,
) {
  const m = (tracer as unknown as { _pathTracer: { material: THREE.ShaderMaterial } })._pathTracer
    .material;
  m.uniforms.nivoAdaptive.value = !!variance && samples >= 8;
  m.uniforms.nivoNoiseVariance.value = variance ?? null;
}
