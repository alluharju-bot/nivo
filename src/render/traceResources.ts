import * as THREE from 'three';
import type { WebGLPathTracer } from 'three-gpu-pathtracer';
import { resetTraceMaterialIndices } from './traceMaterials';

type TraceRenderer = {
  _primaryTarget: THREE.WebGLRenderTarget;
  _blendTargets: THREE.WebGLRenderTarget[];
  _blendQuad: { material: THREE.Material };
  material: THREE.ShaderMaterial;
  setSize(width: number, height: number): void;
  dispose(): void;
};
type Internals = {
  _renderer: THREE.WebGLRenderer;
  _pathTracer: TraceRenderer;
  _lowResPathTracer: TraceRenderer;
  _internalBackground?: THREE.Texture;
  _colorBackground?: THREE.Texture;
  _generator: { geometry: THREE.BufferGeometry };
};

/** Pinned three-gpu-pathtracer 0.0.26 adapter. Its fullscreen targets don't
 * need depth, and its public dispose omits the low-resolution renderer and
 * material-owned textures. Never dispose the input scene's shared maps here. */
export function traceResources(tracer: WebGLPathTracer) {
  const internal = tracer as unknown as Internals;
  const renderers = [internal._pathTracer, internal._lowResPathTracer];
  // Three's WebGLArrayRenderTarget replaces its texture after construction;
  // in this pinned version texture.renderTarget is null. Once uploaded, the
  // owning framebuffer is available in the renderer's texture properties.
  type ArrayTarget = THREE.WebGLRenderTarget & { fsQuad: { material: THREE.Material } };
  const targetOf = (texture: THREE.Texture) =>
    (texture.renderTarget as ArrayTarget | null) ??
    (internal._renderer.properties.get(texture) as { __renderTarget?: ArrayTarget }).__renderTarget;
  if (renderers.some((r) => !r?._primaryTarget || r._blendTargets?.length !== 2))
    throw new Error('Renderöinnin muistinhallinnan versio ei vastaa sovellusta.');
  for (const r of renderers) {
    for (const target of [r._primaryTarget, ...r._blendTargets]) {
      target.depthBuffer = false;
      target.stencilBuffer = false;
    }
    for (const key of ['textures', 'iesProfiles']) {
      const target = targetOf(r.material.uniforms[key].value);
      if (target) target.depthBuffer = false;
    }
  }
  // Nivo displays complete samples itself; the library's second tracer is unused.
  tracer.dynamicLowRes = false;
  tracer.synchronizeRenderSize = false;
  let disposed = false;
  return {
    prepareScene() {
      resetTraceMaterialIndices(internal._generator.geometry);
    },
    resize(width: number, height: number) {
      internal._pathTracer.setSize(width, height);
      // Leave the unused low-resolution buffers at 1 × 1.
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      const materials = new Set(renderers.map((r) => r.material));
      tracer.dispose();
      internal._lowResPathTracer.dispose();
      for (const r of renderers) r._blendQuad.material.dispose();
      for (const material of materials) {
        for (const key of [
          'bvh',
          'attributesArray',
          'materialIndexAttribute',
          'materials',
          'envMapInfo',
          'stratifiedTexture',
          'stratifiedOffsetTexture',
        ])
          material.uniforms[key].value.dispose();
        material.uniforms.lights.value.tex.dispose();
        for (const key of ['textures', 'iesProfiles']) {
          const texture = material.uniforms[key].value;
          const target = targetOf(texture);
          if (target) {
            target.fsQuad.material.dispose();
            target.dispose();
          } else texture.dispose();
        }
        material.dispose();
      }
      internal._internalBackground?.dispose();
      internal._colorBackground?.dispose();
      internal._generator.geometry.dispose();
    },
  };
}
