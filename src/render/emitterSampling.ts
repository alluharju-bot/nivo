import * as THREE from 'three';
import type { WebGLPathTracer } from 'three-gpu-pathtracer';

/** Adapter for the pinned three-gpu-pathtracer 0.0.26 shader. The library samples
 * area lights with MIS, but adds mesh emission again when the same ray reaches
 * the physical LED immediately behind its sampled light. Preserve visible emitters
 * on camera/transmission rays; count secondary-ray emission only once.
 * Keep the guard: a library upgrade must explicitly review this integration. */
export function configureEmitterSampling(tracer: WebGLPathTracer) {
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
  material.needsUpdate = true;
}
