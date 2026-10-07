import { expect, it } from 'vitest';
import * as PathTracing from 'three-gpu-pathtracer';
import type { ShaderMaterial } from 'three';
import { configureEmitterSampling } from './emitterSampling';

it('integrates with the installed tracer shader and rejects incompatible upgrades', () => {
  // The installed runtime exports this deprecated class; its public types omit it.
  const { PhysicalPathTracingMaterial } = PathTracing as unknown as {
    PhysicalPathTracingMaterial: new () => ShaderMaterial;
  };
  const material = new PhysicalPathTracingMaterial();
  const tracer = { _pathTracer: { material } } as unknown as PathTracing.WebGLPathTracer;
  try {
    expect(() => configureEmitterSampling(tracer)).not.toThrow();
    expect(material.fragmentShader).toContain('if ( ! nivoSampledEmitter )');
    material.fragmentShader = material.fragmentShader.replace(
      'int hitType = traceScene( ray, state.fogMaterial, surfaceHit );',
      'int hitType = traceSceneChanged();',
    );
    expect(() => configureEmitterSampling(tracer)).toThrow('valolaskennan versio');
  } finally {
    material.dispose();
  }
});
