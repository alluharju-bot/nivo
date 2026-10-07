import * as THREE from 'three';
import { configureTraceTextures, checkTraceUpload } from './traceTextures';
import { omitPreviewLights } from './lights';
import { WebGLPathTracer, GradientEquirectTexture } from 'three-gpu-pathtracer';
import { configureTraceEnvironment } from './traceJob';
import { configureEmitterSampling } from './emitterSampling';

export type TraceStatus = {
  state: 'off' | 'loading' | 'rendering' | 'paused' | 'complete' | 'error';
  samples: number;
  target?: number;
  message?: string;
};
export type TraceOptions = { quality: 'draft' | 'full'; maxSamples: number };
export const traceDefaults: TraceOptions = { quality: 'draft', maxSamples: 256 };
export function traceStatusLabel(trace: TraceStatus) {
  if (trace.message) return trace.message;
  if (trace.state === 'loading') return 'Valmistellaan ensimmäistä näytettä…';
  return `${trace.state === 'complete' ? 'Tavoite saavutettu' : trace.state === 'paused' ? 'Tauolla' : 'Kuva tarkentuu'} · ${trace.samples} näytettä`;
}
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
  let interacting = false,
    settleAt = 0,
    materialsDirty = false;
  let materialUploads = 0;
  let displayedOpacity = 0;
  let samplingConfigured = false;
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
      options.quality === 'full' ? 1 : Math.min(0.65, 800 / Math.max(size.x, size.y));
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
    if (!samplingConfigured) {
      configureEmitterSampling(tracer!);
      samplingConfigured = true;
    }
    renderer.domElement.dataset.traceMaterialUploads = String(++materialUploads);
    checkTraceUpload(renderer);
    dirty = false;
    materialsDirty = false;
  };
  const loop = () => {
    if (disposed || !enabled || !tracer) return;
    frame = requestAnimationFrame(loop);
    if (document.hidden || paused || complete) return;
    // Never enqueue expensive GPU work while dragging or during a wheel burst.
    // Camera events draw the live raster scene; refinement resumes after settling.
    if (interacting || performance.now() < settleAt) return;
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
      if (materialsDirty) {
        tracer.updateMaterials();
        renderer.domElement.dataset.traceMaterialUploads = String(++materialUploads);
        materialsDirty = false;
      }
      tracer.renderSample();
      if (tracer.samples === 1) checkTraceUpload(renderer);
      renderer.domElement.dataset.traceSamples = String(Math.floor(tracer.samples));
      renderer.domElement.dataset.traceSize = `${tracer.target.width}x${tracer.target.height}`;
      if (options.maxSamples > 0 && tracer.samples >= options.maxSamples) {
        // Finish compositing even when a small sample target is reached before
        // the fade has finished. Otherwise the frozen image is partly raster.
        tracer.pausePathTracing = true;
        if (displayedOpacity >= 1) {
          complete = true;
          status('complete');
        }
      } else if (performance.now() - lastStatus > 400) {
        status(tracer.samples < 1 ? 'loading' : 'rendering');
        lastStatus = performance.now();
      }
    } catch (e) {
      fail(e);
    }
  };
  const reset = () => {
    complete = false;
    displayedOpacity = 0;
    if (tracer) tracer.pausePathTracing = false;
    tracer?.reset();
    renderer.domElement.dataset.traceSamples = '0';
    renderer.domElement.dataset.traceOpacity = '0';
    if (enabled)
      status(
        paused ? 'paused' : interacting ? 'rendering' : 'loading',
        !paused && interacting ? 'Kamera liikkuu · tarkennus jatkuu pysähdyttyä' : undefined,
      );
  };
  return {
    get active() {
      return enabled;
    },
    resize() {
      quality();
      reset();
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
      if (enabled) {
        if (paused) {
          paused = false;
          status(tracer!.samples < 1 ? 'loading' : 'rendering');
        }
        return;
      }
      const token = ++request;
      status('loading');
      try {
        await ready();
        // Let React commit and the browser paint the preparation message before
        // synchronous driver work. A resolved texture promise alone only yields
        // to another microtask and can leave the old raster UI on screen.
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
        if (disposed || token !== request) return;
        if (!renderer.extensions.has('EXT_color_buffer_float'))
          throw new Error(
            'Tämä selain tai näytönohjain ei tue tarkentuvaa renderöintiä. Nopea esikatselu toimii edelleen.',
          );
        if (!tracer) {
          // Load code with the app. A Pages update must not strand an open tab with
          // a deleted lazy chunk; GPU resources are still created only on request.
          environment = new GradientEquirectTexture(128);
          tracer = new WebGLPathTracer(renderer);
          tracer.tiles.set(1, 1);
          renderer.domElement.dataset.traceTiles = '1';
          tracer.minSamples = 1;
          tracer.renderDelay = 100;
          tracer.fadeDuration = 180;
          const composite = tracer.renderToCanvasCallback;
          tracer.renderToCanvasCallback = (target, output, quad) => {
            composite(target, output, quad);
            displayedOpacity = quad.material.opacity;
            renderer.domElement.dataset.traceOpacity = String(displayedOpacity);
          };
          // The trace scene excludes preview lights. Its raster fallback would
          // otherwise turn off LED illumination whenever the camera moves.
          tracer.rasterizeSceneCallback = () => renderer.render(scene, camera);
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
    interaction(value: boolean) {
      interacting = value;
      renderer.domElement.dataset.traceInteractive = String(value);
      if (!value) settleAt = performance.now() + 180;
      if (enabled && !paused && !complete)
        status(
          value ? 'rendering' : 'loading',
          value ? 'Kamera liikkuu · tarkennus jatkuu pysähdyttyä' : undefined,
        );
    },
    invalidate(rebuildScene = false, updateMaterials = false) {
      if (rebuildScene) {
        dirty = true;
        sceneVersion++;
      }
      if (enabled && tracer) {
        tracer.updateCamera();
        materialsDirty ||= updateMaterials;
        settleAt = performance.now() + 180;
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
