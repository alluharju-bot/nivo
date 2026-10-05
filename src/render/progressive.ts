import * as THREE from 'three';
import { configureTraceTextures, checkTraceUpload } from './traceTextures';
import { omitPreviewLights } from './lights';
import type { WebGLPathTracer, GradientEquirectTexture } from 'three-gpu-pathtracer';
import { configureTraceEnvironment } from './traceJob';

export type TraceStatus = {
  state: 'off' | 'loading' | 'rendering' | 'paused' | 'complete' | 'error';
  samples: number;
  target?: number;
  message?: string;
};
export type TraceOptions = { quality: 'draft' | 'full'; maxSamples: number };
export const traceDefaults: TraceOptions = { quality: 'draft', maxSamples: 256 };
/** Opt-in preview. Finite image jobs have their own renderer and lifecycle. */
export function progressiveRenderer(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  onStatus: (status: TraceStatus) => void,
  ready: () => Promise<void> = async () => {},
) {
  let tracer: WebGLPathTracer | undefined, environment: GradientEquirectTexture | undefined;
  let enabled = false,
    disposed = false,
    paused = false,
    complete = false,
    dirty = true,
    frame = 0,
    request = 0,
    lastStatus = 0;
  let preparing = false,
    sceneVersion = 0;
  let options = { ...traceDefaults };
  const status = (state: TraceStatus['state'], message?: string) =>
    onStatus({
      state,
      samples: Math.floor(tracer?.samples ?? 0),
      target: options.maxSamples,
      message,
    });
  const fail = (error: unknown) => {
    enabled = false;
    cancelAnimationFrame(frame);
    renderer.setRenderTarget(null);
    if (!renderer.getContext().isContextLost()) renderer.render(scene, camera);
    status('error', error instanceof Error ? error.message : String(error));
  };
  const quality = () => {
    if (!tracer) return;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    tracer.renderScale =
      options.quality === 'full' ? 1 : Math.min(0.65, 1000 / Math.max(size.x, size.y));
    tracer.bounces = options.quality === 'full' ? 10 : 6;
    tracer.transmissiveBounces = options.quality === 'full' ? 12 : 8;
    tracer.filterGlossyFactor = 0.5;
  };
  const rebuild = () => {
    const snapshot = scene.clone();
    omitPreviewLights(snapshot);
    configureTraceEnvironment(environment!, scene);
    snapshot.environment = environment!;
    snapshot.environmentIntensity = scene.environmentIntensity;
    snapshot.traverse((object) => {
      if ((object as THREE.Sprite).isSprite) object.visible = false;
    });
    configureTraceTextures(snapshot, renderer, tracer!);
    tracer!.setScene(snapshot, camera);
    checkTraceUpload(renderer);
    dirty = false;
  };
  const loop = () => {
    if (disposed || !enabled || !tracer) return;
    frame = requestAnimationFrame(loop);
    if (document.hidden || paused || complete) return;
    try {
      if (dirty) {
        if (!preparing) {
          preparing = true;
          const version = sceneVersion,
            token = request;
          void ready()
            .then(() => {
              if (!disposed && enabled && token === request && version === sceneVersion) rebuild();
            })
            .catch((e) => {
              if (!disposed && enabled && token === request) fail(e);
            })
            .finally(() => {
              preparing = false;
            });
        }
        return;
      }
      if (renderer.getContext().isContextLost())
        throw new Error('Näytönohjaimen yhteys katkesi. Kokeile nopeaa esikatselua.');
      tracer.renderSample();
      if (tracer.samples === 1) checkTraceUpload(renderer);
      renderer.domElement.dataset.traceSamples = String(Math.floor(tracer.samples));
      if (options.maxSamples > 0 && tracer.samples >= options.maxSamples) {
        complete = true;
        status('complete');
      } else if (performance.now() - lastStatus > 400) {
        status('rendering');
        lastStatus = performance.now();
      }
    } catch (e) {
      fail(e);
    }
  };
  const reset = () => {
    complete = false;
    tracer?.reset();
    renderer.domElement.dataset.traceSamples = '0';
    if (enabled) status(paused ? 'paused' : 'rendering');
  };
  return {
    get active() {
      return enabled;
    },
    configure(next: TraceOptions) {
      options = next;
      quality();
      reset();
    },
    restart() {
      paused = false;
      reset();
    },
    async start() {
      if (enabled) return;
      const token = ++request;
      status('loading');
      try {
        await ready();
        if (disposed || token !== request) return;
        if (!renderer.extensions.has('EXT_color_buffer_float'))
          throw new Error(
            'Tämä selain tai näytönohjain ei tue tarkentuvaa renderöintiä. Nopea esikatselu toimii edelleen.',
          );
        if (!tracer) {
          const module = await import('three-gpu-pathtracer');
          if (disposed || token !== request) return;
          environment = new module.GradientEquirectTexture(128);
          tracer = new module.WebGLPathTracer(renderer);
          tracer.tiles.set(1, 1);
          renderer.domElement.dataset.traceTiles = '1';
          tracer.minSamples = 1;
          tracer.renderDelay = 150;
          tracer.fadeDuration = 0;
          tracer.textureSize.set(1024, 1024);
        }
        enabled = true;
        paused = false;
        complete = false;
        dirty = true;
        quality();
        reset();
        loop();
      } catch (e) {
        if (!disposed && token === request) fail(e);
      }
    },
    stop() {
      request++;
      enabled = false;
      paused = false;
      cancelAnimationFrame(frame);
      status('off');
      renderer.render(scene, camera);
    },
    pause(value: boolean) {
      paused = value;
      status(complete ? 'complete' : value ? 'paused' : 'rendering');
    },
    invalidate(rebuildScene = false) {
      if (rebuildScene) {
        dirty = true;
        sceneVersion++;
      }
      if (enabled && tracer) {
        quality();
        tracer.updateCamera();
        if (!dirty) tracer.updateMaterials();
        if (paused) renderer.render(scene, camera);
        reset();
      }
    },
    async exportPNG() {
      if (!tracer || dirty || tracer.samples < 1)
        throw new Error('Odota ensimmäisen näytteen valmistumista.');
      return new Promise<Blob>((resolve, reject) =>
        renderer.domElement.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('Kuvan vienti epäonnistui.'))),
          'image/png',
        ),
      );
    },
    dispose() {
      disposed = true;
      request++;
      enabled = false;
      cancelAnimationFrame(frame);
      tracer?.dispose();
      environment?.dispose();
    },
  };
}
