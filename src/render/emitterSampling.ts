import * as THREE from 'three';
import type { WebGLPathTracer } from 'three-gpu-pathtracer';
import { stableTraceNumerics } from './traceNumerics';
import { stableTraceSamples } from './traceFireflies';
import { importanceSampleLights } from './lightImportance';

/** Adapter for the pinned three-gpu-pathtracer 0.0.26 shader. The library samples
 * area lights with MIS, but adds mesh emission again when the same ray reaches
 * the physical LED immediately behind its sampled light. Preserve visible emitters
 * on camera/transmission rays; count secondary-ray emission only once.
 * Keep the guard: a library upgrade must explicitly review this integration. */
export function configureEmitterSampling(tracer: WebGLPathTracer, importance = true) {
  const material = (tracer as unknown as { _pathTracer: { material: THREE.ShaderMaterial } })
    ._pathTracer.material;
  const trace = 'int hitType = traceScene( ray, state.fogMaterial, surfaceHit );';
  const mis = 'float misWeight = misHeuristic( scatterRec.pdf, lightRec.pdf / lightsDenom );';
  const emit = 'gl_FragColor.rgb += ( surf.emission * state.throughputColor );';
  for (const marker of [trace, mis, emit]) {
    if (material.fragmentShader.split(marker).length !== 2)
      throw new Error('Renderöinnin valolaskennan versio ei vastaa sovellusta.');
  }
  material.fragmentShader = material.fragmentShader
    .replace(trace, `${trace}\n bool nivoSampledEmitter = false;`)
    .replace(mis, `nivoSampledEmitter = true;\n ${mis}`)
    .replace(emit, `if ( ! nivoSampledEmitter ) { ${emit} }`);
  material.fragmentShader = stableTraceNumerics(material.fragmentShader);
  if (importance) material.fragmentShader = importanceSampleLights(material.fragmentShader);
  material.fragmentShader = stableTraceSamples(material.fragmentShader);
  // Integrate coverage within this pixel. The library's two-pixel-wide tent
  // footprint softens fine cabinet gaps and silhouettes even after convergence.
  const jitter =
    'vec2 jitteredUv = vUv + vec2( tentFilter( ruv.x ) * ssd.x, tentFilter( ruv.y ) * ssd.y );';
  if (material.fragmentShader.split(jitter).length !== 2)
    throw new Error('Renderöinnin kameranäytteistyksen versio ei vastaa sovellusta.');
  material.fragmentShader = material.fragmentShader.replace(
    jitter,
    'vec2 jitteredUv = vUv + (ruv - 0.5) * ssd;',
  );
  // Call after setScene: initialize the three scene-dependent feature switches
  // together. Each setDefine in the library's onBeforeRender otherwise launches
  // a separate compilation, including costly fog/DOF shaders we don't use.
  const uniforms = material.uniforms;
  // The default stratified sampler repeats one 64 × 64 blue-noise tile and
  // shares its scalar offset across every sampling dimension. Sheltered LED
  // lighting exposes that fixed screen-space pattern as resolution increases.
  // Use the library's per-pixel, per-bounce scrambled Sobol sequence instead:
  // neighboring pixels have distinct streams and later samples refine them.
  // Shared by interactive refinement and full-size image exports.
  material.defines.RANDOM_TYPE = 1;
  material.defines.FEATURE_DOF = uniforms.physicalCamera.value.bokehSize === 0 ? 0 : 1;
  material.defines.FEATURE_BACKGROUND_MAP = uniforms.backgroundMap.value ? 1 : 0;
  material.defines.FEATURE_FOG = uniforms.materials.value.features.isUsed('FOG') ? 1 : 0;
  material.needsUpdate = true;
}
