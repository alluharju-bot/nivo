import * as THREE from 'three';
import { configureTraceTextures, checkTraceUpload } from './traceTextures';
import { omitPreviewLights } from './lights';
import { WebGLPathTracer, GradientEquirectTexture } from 'three-gpu-pathtracer';
import { configureTraceEnvironment } from './traceJob';
import { configureEmitterSampling } from './emitterSampling';
import { traceResources } from './traceResources';
import { traceResolutions } from './traceResolution';
import { traceImage } from './traceImage';
import { traceGuides } from './traceGuides';
import { reflectionGuides } from './reflectionGuides';
import type { ImageLook } from './imageLook';
import { refinementSamples } from './traceRefinement';
import { gpuQueue } from './gpuQueue';
import { isTraceEnvironment } from './environment';
import { prepareTraceMaterials } from './traceMaterials';
import { prepareWithin, traceWaitWatchdog } from './tracePreparation';

export type TraceStatus = {
  state: 'off' | 'loading' | 'rendering' | 'paused' | 'complete' | 'error';
  samples: number;
  target?: number;
  message?: string;
};
export type TraceOptions = { maxSamples: number; denoise?: boolean };
export const traceDefaults: TraceOptions = { maxSamples: 256, denoise: true };
export function traceStatusLabel(trace: TraceStatus) {
  if (trace.message) return trace.message;
  if (trace.state === 'loading') return 'Valmistellaan ensimmäistä näytettä…';
  return `${trace.state === 'complete' ? 'Tavoite saavutettu' : trace.state === 'paused' ? 'Tauolla' : 'Kuva tarkentuu'} · ${trace.samples} näytettä`;
}
/** Adaptive preview. Finite image jobs have their own renderer and lifecycle. */
export function progressiveRenderer(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  onStatus: (status: TraceStatus) => void,
  ready: () => Promise<void> = async () => {},
  look?: ImageLook,
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
  let resources: ReturnType<typeof traceResources> | undefined;
  let resolution = 0,
    needsSize = true;
  const image = traceImage();
  const guides = traceGuides();
  const reflections = reflectionGuides();
  const raster = () =>
    look ? look.renderScene(renderer, scene, camera) : renderer.render(scene, camera);
  const queue = gpuQueue(renderer.getContext() as WebGL2RenderingContext);
  let lastPresented = 0;
  let samplingConfigured = false;
  let snapshot: THREE.Scene | undefined;
  let disposeSnapshotGeometry: (() => void) | undefined;
  let lightingDirty = false;
  let sceneBuilds = 0;
  let startup: Promise<void> | undefined;
  let preparation = new AbortController();
  const waiting = traceWaitWatchdog();
  let phase = '';

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
    request++;
    preparation.abort();
    waiting.reset();
    queue.dispose();
    cancelAnimationFrame(frame);
    // Keep the last visible preview. Submitting another scene render to a
    // driver that has just stopped responding only adds work to the stuck queue.
    renderer.domElement.dataset.tracePhase = 'error';
    renderer.domElement.dataset.traceError = error instanceof Error ? error.message : String(error);
    status('error', error instanceof Error ? error.message : String(error));
  };
  const loading = (next: string, message: string) => {
    renderer.domElement.dataset.tracePhase = next;
    if (phase !== next) {
      phase = next;
      if (!image.ready) status('loading', message);
    }
  };
  const resolutions = () => {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    return traceResolutions(size.x, size.y);
  };
  const quality = () => {
    if (!tracer || !resources) return;
    const sizes = resolutions();
    resolution = Math.min(resolution, sizes.length - 1);
    const size = sizes[resolution];
    resources.resize(size.width, size.height);
    // Bounded GPU batches. Only complete frames are ever presented to the user.
    tracer.tiles.set(Math.ceil(size.width / 256), Math.ceil(size.height / 256));
    renderer.domElement.dataset.traceTiles = String(tracer.tiles.x * tracer.tiles.y);
    renderer.domElement.dataset.traceSize = `${size.width}x${size.height}`;
    renderer.domElement.dataset.traceResolutionStep = String(resolution);
    renderer.domElement.dataset.traceResolutionSteps = String(sizes.length);
    guides.invalidate();
    reflections.invalidate();
    needsSize = false;
  };
  const rebuild = () => {
    disposeSnapshotGeometry?.();
    snapshot = scene.clone();
    omitPreviewLights(snapshot);
    configureTraceEnvironment(environment!, scene);
    snapshot.environment = isTraceEnvironment(scene.environment) ? scene.environment : environment!;
    snapshot.environmentIntensity = scene.environmentIntensity;
    snapshot.traverse((object) => {
      if ((object as THREE.Sprite).isSprite) object.visible = false;
    });
    disposeSnapshotGeometry = prepareTraceMaterials(snapshot);
    configureTraceTextures(snapshot, renderer, tracer!);
    resources!.prepareScene();
    tracer!.setScene(snapshot, camera);
    if (!samplingConfigured) {
      configureEmitterSampling(tracer!);
      samplingConfigured = true;
    }
    renderer.domElement.dataset.traceMaterialUploads = String(++materialUploads);
    checkTraceUpload(renderer);
    dirty = false;
    lightingDirty = false;
    materialsDirty = false;
    renderer.domElement.dataset.traceSceneBuilds = String(++sceneBuilds);
  };
  const updateLighting = () => {
    if (!snapshot || !tracer) return;
    const fresh = scene.clone();
    omitPreviewLights(fresh);
    const oldLights: THREE.Object3D[] = [];
    snapshot.traverse((object) => {
      if ((object as THREE.Light).isLight) oldLights.push(object);
    });
    oldLights.forEach((light) => light.removeFromParent());
    const nextLights: THREE.Light[] = [];
    fresh.updateMatrixWorld(true);
    fresh.traverseVisible((object) => {
      if ((object as THREE.Light).isLight) nextLights.push(object as THREE.Light);
    });
    nextLights.forEach((light) => snapshot!.attach(light));
    snapshot.background = scene.background;
    snapshot.environmentIntensity = scene.environmentIntensity;
    snapshot.environmentRotation.copy(scene.environmentRotation);
    const previousFallback = environment;
    if (!isTraceEnvironment(scene.environment)) environment = new GradientEquirectTexture(128);
    snapshot.environment = isTraceEnvironment(scene.environment) ? scene.environment : environment!;
    configureTraceEnvironment(environment!, scene);
    tracer.updateEnvironment();
    if (previousFallback !== environment) previousFallback?.dispose();
    tracer.updateLights();
    lightingDirty = false;
  };
  const present = () => {
    const size = image.size;
    const guide =
      size && options.denoise !== false && snapshot
        ? guides.ensure(renderer, snapshot, camera, size[0], size[1])
        : undefined;
    if (guide && tracer && size)
      guide.reflection = reflections.ensure(renderer, tracer, size[0], size[1]);
    image.draw(renderer, options.denoise !== false, look, guide);
  };
  const initialize = () => {
    if (tracer) return;
    environment = new GradientEquirectTexture(128);
    tracer = new WebGLPathTracer(renderer);
    resources = traceResources(tracer);
    tracer.renderToCanvas = false;
    renderer.domElement.dataset.tracePresentation = 'whole-frame';
    renderer.domElement.dataset.traceRefinement = 'retained-coarse';
    tracer.renderDelay = 0;
    tracer.bounces = 16;
    tracer.transmissiveBounces = 12;
    // Preserve the authored BRDF on later bounces too. Artificially increasing
    // roughness blurs reflections permanently; more samples cannot undo it.
    tracer.filterGlossyFactor = 0;
    tracer.textureSize.set(1024, 1024);
  };
  const loop = () => {
    if (disposed || !enabled || !tracer) return;
    frame = requestAnimationFrame(loop);
    if (document.hidden || paused || complete) {
      waiting.reset();
      return;
    }
    // Never enqueue expensive GPU work while dragging or during a wheel burst.
    // Camera events draw the live raster scene; refinement resumes after settling.
    if (interacting || performance.now() < settleAt) {
      waiting.reset();
      return;
    }
    try {
      if (renderer.getContext().isContextLost())
        throw new Error(
          'Näytönohjaimen yhteys katkesi. Palauta 3D-näkymä tai käynnistä selain uudelleen.',
        );
      resources?.checkCompilation();
      if (!queue.ready()) {
        loading('gpu', 'Odotetaan näytönohjaimen laskentaa…');
        waiting.check('gpu');
        return;
      }
      if (dirty) {
        if (!preparing) {
          preparing = true;
          const version = sceneVersion,
            token = request;
          loading('assets', 'Ladataan materiaalikuvia ja ympäristövaloa…');
          void prepareWithin(ready(), preparation.signal)
            .then(() => {
              if (!disposed && enabled && token === request && version === sceneVersion) {
                loading('geometry', 'Valmistellaan mallin geometriaa ja materiaaleja…');
                rebuild();
              }
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
      if (lightingDirty) updateLighting();
      if (materialsDirty) {
        // Newly selected maps may still be decoding. Never upload zero-sized images.
        if (preparing) return;
        preparing = true;
        const token = request,
          version = sceneVersion;
        loading('assets', 'Ladataan materiaalikuvia…');
        void prepareWithin(ready(), preparation.signal)
          .then(() => {
            if (disposed || !enabled || token !== request || version !== sceneVersion) return;
            configureTraceTextures(snapshot!, renderer, tracer!);
            tracer!.updateMaterials();
            checkTraceUpload(renderer);
            renderer.domElement.dataset.traceMaterialUploads = String(++materialUploads);
            materialsDirty = false;
          })
          .catch((error) => {
            if (!disposed && enabled && token === request) fail(error);
          })
          .finally(() => {
            preparing = false;
          });
        return;
      }
      resources?.checkCompilation();
      if (resources?.compiling) {
        loading('compiling', 'Valmistellaan renderiohjelmaa näytönohjaimelle…');
        waiting.check('compiling');
        return;
      }
      waiting.reset();
      loading('sampling', 'Lasketaan ensimmäistä näytettä…');
      if (needsSize) quality();
      // Use spare GPU capacity without tying every small tile to a screen
      // refresh. One bounded batch stays in flight, with at most 8 tiles. Stop
      // starting more tiles once CPU submission takes 4 ms; a single driver
      // call cannot be interrupted. Yield to camera and UI events between batches.
      const batchStarted = performance.now();
      queue.begin();
      let submitted = 0;
      for (let tile = 0; tile < queue.tiles; tile++) {
        const before = tracer.samples;
        tracer.renderSample();
        submitted++;
        const samples = Math.floor(tracer.samples);
        if (samples > Math.floor(before)) {
          image.observe(renderer, tracer.target, samples);
          // Denoising is a display cost, not a cost per path-tracing sample.
          // Keep the first, each refinement boundary and the final image exact.
          const boundary = samples === (resolution === 0 ? 4 : refinementSamples);
          if (
            !image.ready ||
            samples === 1 ||
            boundary ||
            samples === options.maxSamples ||
            performance.now() - lastPresented >= 80
          ) {
            image.capture(renderer, tracer.target, samples);
            present();
            lastPresented = performance.now();
            renderer.domElement.dataset.tracePresentedSamples = String(samples);
            renderer.domElement.dataset.tracePhase = 'rendering';
            renderer.domElement.dataset.traceOpacity = '1';
            renderer.domElement.dataset.traceHistoryWeight = String(image.historyWeight);
            renderer.domElement.dataset.tracePresentedSize = renderer.domElement.dataset.traceSize;
          }
          renderer.domElement.dataset.traceSamples = String(samples);
          if (samples === 1) checkTraceUpload(renderer);
          // The coarse image is only a display estimate. Never put its colors
          // into the new tracer's radiance sum or inflate its sample count.
          if (
            resolution < resolutions().length - 1 &&
            samples >= (resolution === 0 ? 4 : refinementSamples)
          ) {
            resolution++;
            needsSize = true;
            tracer.reset();
            break;
          } else if (
            resolution === resolutions().length - 1 &&
            options.maxSamples > 0 &&
            samples >= options.maxSamples
          ) {
            complete = true;
            status('complete');
            break;
          }
        }
        if (tracer.samples === before || performance.now() - batchStarted >= 4) break;
      }
      renderer.domElement.dataset.traceBatchTiles = String(submitted);
      queue.submit(submitted);
      renderer.domElement.dataset.traceGpuMs = queue.milliseconds.toFixed(2);
      renderer.domElement.dataset.traceGpuTimer = String(queue.timerAvailable);
      if (!complete && performance.now() - lastStatus > 400) {
        status(image.ready ? 'rendering' : 'loading');
        lastStatus = performance.now();
      }
    } catch (e) {
      fail(e);
    }
  };
  let resets = 0;
  const reset = (reason: string) => {
    renderer.domElement.dataset.traceReset = String(++resets);
    renderer.domElement.dataset.traceResetReason = reason;
    complete = false;
    resolution = 0;
    needsSize = true;
    lastPresented = 0;
    waiting.reset();
    phase = '';
    image.clear();
    guides.reset();
    reflections.reset();
    if (tracer) tracer.pausePathTracing = false;
    tracer?.reset();
    renderer.domElement.dataset.traceSamples = '0';
    renderer.domElement.dataset.traceOpacity = '0';
    renderer.domElement.dataset.traceHistoryWeight = '0';
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
      reset('resize');
    },
    configure(next: TraceOptions) {
      const sameTarget = next.maxSamples === options.maxSamples;
      options = next;
      if (sameTarget) {
        if (enabled && !interacting) present();
      } else if (tracer && enabled) {
        complete =
          resolution === resolutions().length - 1 &&
          !needsSize &&
          options.maxSamples > 0 &&
          tracer.samples >= options.maxSamples;
        if (!paused) status(complete ? 'complete' : image.ready ? 'rendering' : 'loading');
      }
    },
    restart() {
      paused = false;
      reset('restart');
    },
    start(): Promise<void> {
      if (enabled) {
        if (paused) {
          paused = false;
          status(complete ? 'complete' : tracer!.samples < 1 ? 'loading' : 'rendering');
        }
        return Promise.resolve();
      }
      if (startup) return startup;
      preparation = new AbortController();
      const token = ++request;
      phase = '';
      delete renderer.domElement.dataset.traceError;
      loading('assets', 'Ladataan materiaalikuvia ja ympäristövaloa…');
      startup = (async () => {
        try {
          await prepareWithin(ready(), preparation.signal);
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
          initialize();
          enabled = true;
          paused = false;
          complete = false;
          // The camera can move while tracing is off or being prepared. Refresh
          // its uniforms without rebuilding the already prepared geometry.
          tracer!.setCamera(camera);
          reset('start');
          loop();
        } catch (e) {
          if (!disposed && token === request) fail(e);
        }
      })();
      const pending = startup;
      void pending.finally(() => {
        if (startup === pending) startup = undefined;
      });
      return pending;
    },
    stop() {
      request++;
      preparation.abort();
      startup = undefined;
      waiting.reset();
      enabled = false;
      paused = false;
      cancelAnimationFrame(frame);
      status('off');
      if (!renderer.getContext().isContextLost()) raster();
    },
    release() {
      request++;
      preparation.abort();
      startup = undefined;
      waiting.reset();
      enabled = false;
      paused = false;
      cancelAnimationFrame(frame);
      queue.dispose();
      resources?.dispose();
      resources = undefined;
      tracer = undefined;
      environment?.dispose();
      environment = undefined;
      snapshot = undefined;
      disposeSnapshotGeometry?.();
      disposeSnapshotGeometry = undefined;
      image.clear();
      guides.clear();
      reflections.clear();
      samplingConfigured = false;
      dirty = true;
      needsSize = true;
      resolution = 0;
      delete renderer.domElement.dataset.tracePrepared;
      status('off');
      if (!renderer.getContext().isContextLost()) raster();
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
      materialsDirty ||= updateMaterials;
      if (enabled && tracer) {
        tracer.updateCamera();
        settleAt = performance.now() + 100;
        if (paused) raster();
        reset(rebuildScene ? 'geometry' : updateMaterials ? 'material' : 'camera');
      }
    },
    lighting() {
      lightingDirty = true;
      if (enabled) reset('lighting');
    },
    display() {
      if (!enabled || dirty || interacting) return;
      present();
    },
    async exportPNG() {
      if (!image.ready || dirty) throw new Error('Odota ensimmäisen näytteen valmistumista.');
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
      preparation.abort();
      waiting.reset();
      enabled = false;
      cancelAnimationFrame(frame);
      queue.dispose();
      resources?.dispose();
      image.dispose();
      guides.dispose();
      reflections.dispose();
      environment?.dispose();
      disposeSnapshotGeometry?.();
    },
  };
}
