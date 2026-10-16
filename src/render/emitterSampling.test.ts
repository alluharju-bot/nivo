import { expect, it } from 'vitest';
import * as PathTracing from 'three-gpu-pathtracer';
import { Color, DataTexture, type ShaderMaterial } from 'three';
import { configureEmitterSampling } from './emitterSampling';

it('integrates with the installed tracer shader and rejects incompatible upgrades', () => {
  // The installed runtime exports this deprecated class; its public types omit it.
  const { PhysicalPathTracingMaterial } = PathTracing as unknown as {
    PhysicalPathTracingMaterial: new () => ShaderMaterial;
  };
  const material = new PhysicalPathTracingMaterial();
  let compilations = 0;
  material.addEventListener('recompilation' as 'dispose', () => compilations++);
  const tracer = { _pathTracer: { material } } as unknown as PathTracing.WebGLPathTracer;
  try {
    expect(() => configureEmitterSampling(tracer)).not.toThrow();
    expect(material.fragmentShader).toContain('if ( ! nivoSampledEmitter )');
    expect(material.fragmentShader).toContain('return ratio * ratio;');
    expect(material.fragmentShader).toContain(
      'gl_FragColor.rgb += nivoLimitIndirect(nivoIndirect);',
    );
    expect(material.fragmentShader.match(/nivoAddRadiance\(gl_FragColor.rgb/g)).toHaveLength(7);
    expect(material.fragmentShader).not.toContain('return pow( ( 1.0 - eta )');
    expect(compilations).toBe(1);
    // The first sample must not prepare separate unused fog/depth-of-field
    // programs after the adapter already prepared the scene's actual shader.
    (material as unknown as { onBeforeRender: () => void }).onBeforeRender();
    expect(compilations).toBe(1);
    expect(material.defines).toMatchObject({ FEATURE_DOF: 0, FEATURE_FOG: 0 });
    // A divergent ray loop must not require quad derivatives for texture LOD.
    // This includes environment, light-profile and Sobol lookups, not just PBR maps.
    expect(material.fragmentShader).not.toMatch(/\b(?:texture2D|texture)\s*\(/);
    expect(material.fragmentShader).toContain('textureLod(map, uv, 0.0)');
    material.fragmentShader = material.fragmentShader.replace(
      'int hitType = traceScene( ray, state.fogMaterial, surfaceHit );',
      'int hitType = traceSceneChanged();',
    );
    expect(() => configureEmitterSampling(tracer)).toThrow('valolaskennan versio');
  } finally {
    material.dispose();
  }
});

it('compiles once for a solid background and updates its color without recompilation', () => {
  const { PhysicalPathTracingMaterial } = PathTracing as unknown as {
    PhysicalPathTracingMaterial: new () => ShaderMaterial;
  };
  const material = new PhysicalPathTracingMaterial(),
    map = new DataTexture();
  material.uniforms.backgroundMap.value = map;
  let compilations = 0;
  material.addEventListener('recompilation' as 'dispose', () => compilations++);
  const scene = { background: new Color('#aabbcc') };
  const tracer = { scene, _pathTracer: { material } } as unknown as PathTracing.WebGLPathTracer;
  try {
    configureEmitterSampling(tracer);
    (material as unknown as { onBeforeRender: () => void }).onBeforeRender();
    expect(compilations).toBe(1);
    expect(material.defines.NIVO_SOLID_BACKGROUND).toBe(1);
    scene.background.set('#bbccdd');
    (material as unknown as { onBeforeRender: () => void }).onBeforeRender();
    expect(compilations).toBe(1);
    expect(material.uniforms.nivoBackgroundColor.value.equals(scene.background)).toBe(true);
  } finally {
    material.dispose();
    map.dispose();
  }
});
