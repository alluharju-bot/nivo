import * as THREE from 'three';
import { configureTraceTextures, checkTraceUpload } from './traceTextures';
import { omitPreviewLights } from './lights';
import { WebGLPathTracer, GradientEquirectTexture } from 'three-gpu-pathtracer';
import { configureTraceEnvironment } from './traceJob';
import { configureEmitterSampling } from './emitterSampling';
import { traceDenoise } from './traceDenoise';
import { isTraceEnvironment } from './environment';

export type TraceStatus = {
  state: 'off' | 'loading' | 'rendering' | 'paused' | 'complete' | 'error';
  samples: number;
  target?: number;
  message?: string;
};
export type TraceOptions = { quality: 'draft' | 'full'; maxSamples: number; denoise?: boolean };
export const traceDefaults: TraceOptions = { quality: 'draft', maxSamples: 256, denoise: true };
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
  let snapshot: THREE.Scene | undefined;
  let lightingDirty = false;
  let sceneBuilds = 0;
  let warmup: Promise<void> | undefined;
  const denoise = traceDenoise();
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
    tracer.bounces = options.quality === 'full' ? 16 : 8;
    tracer.transmissiveBounces = options.quality === 'full' ? 12 : 8;
    tracer.filterGlossyFactor = options.quality === 'full' ? 0.25 : 0.5;
  };
  const rebuild = () => {
    snapshot = scene.clone();
    omitPreviewLights(snapshot);
    configureTraceEnvironment(environment!, scene);
    snapshot.environment = isTraceEnvironment(scene.environment) ? scene.environment : environment!;
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
    if (!tracer || dirty || tracer.samples < 1) return;
    if (options.denoise !== false && displayedOpacity >= 1 && tracer.samples >= 8)
      denoise.draw(renderer, tracer.target.texture, tracer.samples);
  };
  const initialize = () => {
    if (tracer) return;
    environment = new GradientEquirectTexture(128);
    tracer = new WebGLPathTracer(renderer);
    tracer.tiles.set(1, 1);
    renderer.domElement.dataset.traceTiles = '1';
    tracer.minSamples = 1;
    tracer.renderDelay = 0;
    tracer.fadeDuration = 120;
    const composite = tracer.renderToCanvasCallback;
    tracer.renderToCanvasCallback = (target, output, quad) => {
      composite(target, output, quad);
      displayedOpacity = quad.material.opacity;
      renderer.domElement.dataset.traceOpacity = String(displayedOpacity);
    };
    tracer.rasterizeSceneCallback = () => renderer.render(scene, camera);
    tracer.textureSize.set(1024, 1024);
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
      if (lightingDirty) updateLighting();
      if (materialsDirty) {
        // Newly selected maps may still be decoding. Never upload zero-sized images.
        if (preparing) return;
        preparing = true;
        const token = request,
          version = sceneVersion;
        void ready()
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
      tracer.renderSample();
      present();
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
      const displayOnly =
        next.quality === options.quality && next.maxSamples === options.maxSamples;
      options = next;
      if (displayOnly && tracer && enabled) {
        const pausedBefore = tracer.pausePathTracing;
        tracer.pausePathTracing = true;
        tracer.renderSample();
        present();
        tracer.pausePathTracing = pausedBefore;
        return;
      }
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
        await warmup;
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
        initialize();
        enabled = true;
        paused = false;
        complete = false;
        quality();
        // The camera can move while tracing is off or being prepared. Refresh
        // its uniforms without rebuilding the already prepared geometry.
        tracer!.setCamera(camera);
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
      materialsDirty ||= updateMaterials;
      if (enabled && tracer) {
        tracer.updateCamera();
        settleAt = performance.now() + 100;
        if (paused) renderer.render(scene, camera);
        reset();
      }
    },
    lighting() {
      lightingDirty = true;
      if (enabled) reset();
    },
    display() {
      if (!enabled || !tracer || dirty || tracer.samples < 1) return;
      const wasPaused = tracer.pausePathTracing;
      tracer.pausePathTracing = true;
      tracer.renderSample();
      present();
      tracer.pausePathTracing = wasPaused;
    },
    /** Prepare only on drivers supporting asynchronous compilation. No hidden
     * software-rendered sample is allowed to block modeling for tens of seconds. */
    prepare() {
      if (
        warmup ||
        tracer ||
        disposed ||
        enabled ||
        interacting ||
        !renderer.extensions.has('KHR_parallel_shader_compile') ||
        !renderer.extensions.has('EXT_color_buffer_float')
      )
        return;
      const version = sceneVersion;
      warmup = ready()
        .then(() => {
          if (disposed || enabled || version !== sceneVersion) return;
          initialize();
          rebuild();
          return (
            tracer as unknown as { _pathTracer: { compileMaterial(): Promise<unknown> } }
          )._pathTracer.compileMaterial();
        })
        .then(() => {
          if (!disposed && tracer && !dirty && version === sceneVersion)
            renderer.domElement.dataset.tracePrepared = 'true';
        })
        .catch(() => {
          dirty = true;
        })
        .finally(() => {
          warmup = undefined;
        });
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
      denoise.dispose();
      environment?.dispose();
    },
  };
}
