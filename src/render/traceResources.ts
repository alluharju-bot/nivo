import * as THREE from 'three';
import type { WebGLPathTracer } from 'three-gpu-pathtracer';
import { resetTraceMaterialIndices } from './traceMaterials';
import { prepareLobeTargets } from './traceLobes';

type TraceRenderer = {
  _primaryTarget: THREE.WebGLRenderTarget;
  _blendTargets: THREE.WebGLRenderTarget[];
  _blendQuad: { material: THREE.Material };
  _compilePromise: Promise<unknown> | null;
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
  prepareLobeTargets(tracer);
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
      // Finish outstanding shader compilation before deleting its programs.
      // A cancelled preview may still have compileAsync polling in a timer.
      // Releasing immediately can race the GPU driver's program queries.
      const pending = renderers.flatMap((r) => (r._compilePromise ? [r._compilePromise] : []));
      const release = () => {
        const materials = new Set(renderers.map((r) => r.material));
        // compileAsync may still be polling an earlier camera/define variant.
        // Three deletes its program on material disposal; mark that poll ready
        // instead of querying a deleted WebGLProgram on the next timer tick.
        for (const material of materials) {
          type Program = { program?: WebGLProgram; isReady(): boolean };
          const programs = (
            internal._renderer.properties.get(material) as {
              programs?: Map<string, Program>;
            }
          ).programs;
          for (const program of programs?.values() ?? []) {
            const ready = program.isReady.bind(program);
            program.isReady = () => !program.program || ready();
          }
        }
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
      };
      if (pending.length) void Promise.allSettled(pending).then(release);
      else release();
    },
  };
}
