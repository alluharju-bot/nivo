import * as THREE from 'three';
import type { WebGLPathTracer } from 'three-gpu-pathtracer';
import { resetTraceMaterialIndices } from './traceMaterials';
import { prepareLobeTargets } from './traceLobes';
import { prepareTextureAtlas } from './traceTextureAtlas';
import type { traceDiagnostics } from './traceDiagnostics';

type TraceRenderer = {
  _primaryTarget: THREE.WebGLRenderTarget;
  _blendTargets: THREE.WebGLRenderTarget[];
  _blendQuad: { material: THREE.Material };
  _compilePromise: Promise<unknown> | null;
  compileMaterial(): Promise<unknown>;
  material: THREE.ShaderMaterial;
  camera: THREE.Camera | null;
  setCamera(camera: THREE.Camera): void;
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
export function traceResources(
  tracer: WebGLPathTracer,
  diagnostics?: ReturnType<typeof traceDiagnostics>,
) {
  prepareLobeTargets(tracer);
  prepareTextureAtlas(tracer);
  const internal = tracer as unknown as Internals;
  const renderers = [internal._pathTracer, internal._lowResPathTracer];
  let compilationError: unknown;
  // compileAsync keeps a program reference while polling KHR completion. A
  // material can replace/dispose that program before the poll finishes. Guard
  // programs when compilation starts, not just the current material at dispose
  // time (which no longer owns earlier shader variants).
  const guarded = new WeakSet<object>();
  const guardCompilations = () => {
    for (const program of internal._renderer.info.programs ?? []) {
      if (guarded.has(program)) continue;
      const p = program as unknown as { program?: WebGLProgram; isReady(): boolean };
      const ready = p.isReady.bind(p);
      p.isReady = () => !p.program || ready();
      guarded.add(program);
    }
  };
  guardCompilations();
  for (const r of renderers) {
    const compile = r.compileMaterial.bind(r);
    r.compileMaterial = () => {
      const finish = diagnostics?.compile(r.material.fragmentShader.length);
      // The pinned library attaches only .then() to this promise. Catch here
      // so a rejected compile cannot become an unhandled rejection while its
      // isCompiling flag leaves the preview waiting forever.
      // compileAsync otherwise prepares the canvas/sRGB/tone-mapped variant.
      // Tracing actually draws into a linear float target: that mismatch caused
      // a second, synchronous compilation on the very first sample, bypassing
      // both the preparation status and its watchdog.
      const renderer = internal._renderer;
      const target = renderer.getRenderTarget();
      const face = renderer.getActiveCubeFace(),
        mip = renderer.getActiveMipmapLevel();
      try {
        renderer.setRenderTarget(r._primaryTarget);
        return compile().then(
          () => finish?.(),
          (error: unknown) => {
            compilationError =
              error instanceof Error
                ? error
                : new Error(String(error ?? 'Renderiohjelman valmistelu epäonnistui.'));
            finish?.((compilationError as Error).message);
          },
        );
      } catch (error) {
        finish?.(error instanceof Error ? error.message : String(error));
        throw error;
      } finally {
        renderer.setRenderTarget(target, face, mip);
        guardCompilations();
      }
    };
  }
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
  // Nivo owns the coarse-to-fine preview. Switching projection must not launch
  // an unused second tracer shader, especially while a previous view is closing.
  internal._lowResPathTracer.setCamera = (camera) => {
    internal._lowResPathTracer.camera = camera;
  };
  let disposed = false;
  return {
    get compiling() {
      return !!internal._pathTracer._compilePromise;
    },
    checkCompilation() {
      if (compilationError) throw compilationError;
    },
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
        guardCompilations();
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
