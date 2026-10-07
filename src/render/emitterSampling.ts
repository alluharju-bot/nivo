import * as THREE from 'three';
import type { WebGLPathTracer } from 'three-gpu-pathtracer';
import { stableTraceNumerics } from './traceNumerics';

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
  material.fragmentShader = stableTraceNumerics(material.fragmentShader);
  // Call after setScene: initialize the three scene-dependent feature switches
  // together. Each setDefine in the library's onBeforeRender otherwise launches
  // a separate compilation, including costly fog/DOF shaders we don't use.
  const uniforms = material.uniforms;
  material.defines.FEATURE_DOF = uniforms.physicalCamera.value.bokehSize === 0 ? 0 : 1;
  material.defines.FEATURE_BACKGROUND_MAP = uniforms.backgroundMap.value ? 1 : 0;
  material.defines.FEATURE_FOG = uniforms.materials.value.features.isUsed('FOG') ? 1 : 0;
  material.needsUpdate = true;
}
