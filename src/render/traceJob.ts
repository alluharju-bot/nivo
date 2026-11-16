import * as THREE from 'three';
import { configureTraceTextures, checkTraceUpload } from './traceTextures';
import { WebGLPathTracer, GradientEquirectTexture } from 'three-gpu-pathtracer';
import type { RenderSnapshot } from './snapshot';
import { configureEmitterSampling } from './emitterSampling';
import { gpuQueue } from './gpuQueue';
import { traceLighting } from './traceLighting';
import { reflectionGuides } from './reflectionGuides';
import { traceGuides, type DenoiseGuides } from './traceGuides';
import { temporalDiffuse } from './temporalDiffuse';
import { imageLook } from './imageLook';
import { traceResources } from './traceResources';
import { prepareTraceMaterials } from './traceMaterials';
import { prepareWithin, traceWaitWatchdog } from './tracePreparation';
import { traceDiagnostics } from './traceDiagnostics';
import { yieldRenderWork } from './renderYield';
import { stillFrameTracker } from './stillFrame';

export type RenderJobOptions = {
  width: number;
  samples: number;
  denoise?: boolean;
  bounces?: number;
  /** Opt in only when applyFrame reports every scene change. */
  reuseStillFrames?: boolean;
  /** Camera-motion diffuse lighting history; does not alter ray sampling. */
  temporal?: boolean;
};
export type RenderFrameTiming = {
  frame: number;
  reused?: boolean;
  preparationMs: number;
  samplingMs: number;
  firstSampleMs: number;
  finishingMs: number;
  writingMs: number;
  pathGpuMs: number;
  presentationGpuMs: number;
};
export type RenderJobDiagnostics = {
  backend: 'WebGL2';
  temporal: { enabled: boolean; bytes: number; accumulatedFrames: number };
  width: number;
  height: number;
  targetSamples: number;
  bounces: number;
  sceneUpdates: number;
  cameraUpdates: number;
  reusedFrames: number;
  sceneUpdateMs: number;
  textureBytes: number;
  gpuTimer: boolean;
  gpu?: ReturnType<typeof gpuQueue>['timings'];
  timing: ReturnType<ReturnType<typeof traceDiagnostics>['timing']>;
  recentFrames: RenderFrameTiming[];
};
export type RenderJobProgress = {
  phase: 'preparing' | 'rendering' | 'saving';
  samples: number;
  target: number;
  elapsed: number;
  width: number;
  height: number;
  frame?: number;
  frames?: number;
  detail?: string;
  diagnostics?: RenderJobDiagnostics;
};

export type RenderFramePreview = { frame: number; samples: number; complete: boolean };

export function configureTraceEnvironment(
  environment: GradientEquirectTexture,
  scene: THREE.Scene,
) {
  const background =
    scene.background instanceof THREE.Color ? scene.background : new THREE.Color('#e8ece9');
  environment.topColor.copy(background).lerp(new THREE.Color('#eaf1ff'), 0.35);
  environment.bottomColor.copy(background).multiplyScalar(0.65);
  environment.update();
}
function animationFrame(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      cancelAnimationFrame(frame);
      reject(new DOMException('Renderöinti keskeytettiin.', 'AbortError'));
    };
    const frame = requestAnimationFrame(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    });
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  });
}
/** Promise continuations run before paint. Two frames let React and the browser
 * display the current stage before synchronous scene/shader preparation starts. */
export async function yieldRenderUI(signal: AbortSignal) {
  await animationFrame(signal);
  await animationFrame(signal);
}
/** A finite render on its own canvas. It continues when the modeling workspace is opened. */
export async function renderSnapshot(
  snapshot: RenderSnapshot,
  options: RenderJobOptions,
  signal: AbortSignal,
  onProgress: (progress: RenderJobProgress) => void,
): Promise<Blob> {
  let blob: Blob | undefined;
  await renderFrames(
    snapshot,
    options,
    signal,
    onProgress,
    1,
    () => false,
    async (canvas) => {
      blob = await canvasPNG(canvas);
    },
  );
  return blob!;
}

export const canvasPNG = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error('Kuvan tallennus epäonnistui.'))),
      'image/png',
    ),
  );

/** One owned scene and GPU session for the entire sequence. Camera-only frames
 * reuse the BVH; animated geometry refreshes it before any samples are taken. */
export async function renderFrames(
  snapshot: RenderSnapshot,
  options: RenderJobOptions,
  signal: AbortSignal,
  onProgress: (progress: RenderJobProgress) => void,
  frames: number,
  applyFrame: (index: number) => boolean,
  saveFrame: (canvas: HTMLCanvasElement, index: number) => Promise<void>,
  onPreview?: (canvas: HTMLCanvasElement, preview: RenderFramePreview) => void,
): Promise<void> {
  let renderer: THREE.WebGLRenderer | undefined,
    tracer: WebGLPathTracer | undefined,
    environment: GradientEquirectTexture | undefined;
  let queue: ReturnType<typeof gpuQueue> | undefined;
  let resources: ReturnType<typeof traceResources> | undefined;
  let disposeSnapshotGeometry: (() => void) | undefined;
  const { width, samples: target } = options,
    height = Math.max(1, Math.round(width / snapshot.aspect));
  const bounces = options.bounces ?? 16;
  const started = performance.now();
  const diagnostics = traceDiagnostics();
  let sceneUpdates = 0,
    cameraUpdates = 0,
    reusedFrames = 0,
    sceneUpdateMs = 0;
  const recentFrames: RenderFrameTiming[] = [];
  const denoise = traceLighting();
  const temporal = options.temporal && options.denoise !== false ? temporalDiffuse() : undefined;
  const stabilizeDiffuse = temporal
    ? (surface: THREE.WebGLRenderTarget, guide: DenoiseGuides) =>
        temporal.draw(renderer!, surface, guide, snapshot.camera)
    : undefined;
  const reflections = reflectionGuides();
  const guides = traceGuides();
  const look = imageLook(snapshot.look);
  let filtered: THREE.WebGLRenderTarget | undefined;
  let frame = 0;
  let frameSampled = false;
  const check = () => {
    if (signal.aborted) throw new DOMException('Renderöinti keskeytettiin.', 'AbortError');
  };
  const report = (phase: RenderJobProgress['phase'], detail?: string) =>
    onProgress({
      phase,
      detail,
      samples: frameSampled ? Math.min(target, Math.floor(tracer?.samples ?? 0)) : 0,
      target,
      elapsed: (performance.now() - started) / 1000,
      width,
      height,
      frame,
      frames,
      diagnostics: {
        backend: 'WebGL2',
        temporal: {
          enabled: !!temporal,
          bytes: temporal?.bytes ?? 0,
          accumulatedFrames: temporal?.accumulatedFrames ?? 0,
        },
        width,
        height,
        targetSamples: target,
        bounces,
        sceneUpdates,
        cameraUpdates,
        reusedFrames,
        sceneUpdateMs,
        textureBytes: Number(renderer?.domElement.dataset.traceTextureBytes ?? 0),
        gpuTimer: queue?.timerAvailable ?? false,
        gpu: queue?.timings,
        timing: diagnostics.timing(),
        recentFrames: [...recentFrames],
      },
    });
  try {
    check();
    if (
      !Number.isInteger(width) ||
      width < 64 ||
      width > 4096 ||
      !Number.isInteger(target) ||
      target < 1 ||
      target > 65536 ||
      !Number.isInteger(bounces) ||
      bounces < 1 ||
      bounces > 16 ||
      !Number.isInteger(frames) ||
      frames < 1 ||
      frames > 216000 ||
      !Number.isFinite(height) ||
      height > 4096 ||
      width * height > 12_000_000
    )
      throw new Error('Kuvan koko tai näytemäärä on liian suuri.');
    report('preparing', 'Valmistellaan näytönohjainta');
    await yieldRenderUI(signal);
    check();
    renderer = new THREE.WebGLRenderer({
      preserveDrawingBuffer: true,
      antialias: false,
      powerPreference: 'high-performance',
    });
    if (!renderer.extensions.has('EXT_color_buffer_float'))
      throw new Error(
        'Tämä selain ei tue tarkentuvaa kuvarenderöintiä. Voit tallentaa nopean esikatselun PNG-kuvana.',
      );
    if (Math.max(width, height) > renderer.capabilities.maxTextureSize)
      throw new Error('Näytönohjain ei tue valittua kuvakokoa.');
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    renderer.toneMapping = snapshot.toneMapping;
    renderer.toneMappingExposure = snapshot.exposure;
    environment = new GradientEquirectTexture(256);
    configureTraceEnvironment(environment, snapshot.scene);
    snapshot.scene.environment ??= environment;
    tracer = new WebGLPathTracer(renderer);
    resources = traceResources(tracer, diagnostics);
    resources.resize(width, height);
    tracer.tiles.set(Math.ceil(width / 256), Math.ceil(height / 256));
    tracer.bounces = bounces;
    tracer.transmissiveBounces = Math.min(12, Math.max(4, bounces));
    tracer.filterGlossyFactor = 0;
    tracer.renderScale = 1;
    tracer.minSamples = 1;
    tracer.fadeDuration = 0;
    tracer.renderDelay = 0;
    tracer.rasterizeScene = false;
    // Present at complete sample boundaries, never copy the canvas per tile.
    tracer.renderToCanvas = false;
    tracer.textureSize.set(1024, 1024);
    const images = new Set<HTMLImageElement>();
    snapshot.scene.traverse((object) => {
      if (!(object as THREE.Mesh).isMesh) return;
      const material = (object as THREE.Mesh).material;
      for (const m of Array.isArray(material) ? material : [material])
        for (const value of Object.values(m))
          if (value instanceof THREE.Texture && value.image instanceof HTMLImageElement)
            images.add(value.image);
    });
    report('preparing', 'Ladataan materiaaleja ja tekstuureja');
    await yieldRenderUI(signal);
    await prepareWithin(
      Promise.all(
        [...images].map((image) =>
          image.complete && image.naturalWidth ? undefined : image.decode(),
        ),
      ),
      signal,
    );
    check();
    report('preparing', 'Valmistellaan geometriaa ja materiaaleja');
    await yieldRenderUI(signal);
    applyFrame(0);
    disposeSnapshotGeometry = prepareTraceMaterials(snapshot.scene);
    configureTraceTextures(snapshot.scene, renderer, tracer);
    report('preparing', 'Rakennetaan renderöintinäkymää ja renderiohjelmaa');
    await yieldRenderUI(signal);
    resources.prepareScene();
    const updateScene = () => {
      const begin = performance.now();
      tracer!.setScene(snapshot.scene, snapshot.camera);
      sceneUpdateMs += performance.now() - begin;
      sceneUpdates++;
    };
    updateScene();
    configureEmitterSampling(tracer);
    checkTraceUpload(renderer);
    let lastReport = 0,
      lastPreview = 0,
      previewSample = 0;
    const pulse = (phase: RenderJobProgress['phase'], detail?: string) => {
      if (performance.now() - lastReport >= 400) {
        report(phase, detail);
        lastReport = performance.now();
      }
    };
    let checkedFirstSample = false;
    const waiting = traceWaitWatchdog();
    queue = gpuQueue(renderer.getContext() as WebGL2RenderingContext);
    const drain = async () => {
      while (!queue!.ready()) {
        check();
        if (renderer!.getContext().isContextLost())
          throw new Error('Näytönohjaimen yhteys katkesi.');
        if (document.hidden) {
          waiting.reset();
          await animationFrame(signal);
          continue;
        }
        waiting.check('gpu');
        await yieldRenderWork(signal);
      }
      waiting.reset();
    };
    const stillFrame = stillFrameTracker();
    stillFrame(snapshot.camera, false);
    for (frame = 0; frame < frames; frame++) {
      const frameStarted = frame === 0 ? started : performance.now();
      const beforeGPU = queue.timings;
      let firstSampleMs = 0;
      check();
      frameSampled = false;
      previewSample = 0;
      lastPreview = 0;
      if (frame > 0) {
        report('preparing', 'Valmistellaan seuraavan ruudun kameraa ja objekteja');
        await yieldRenderUI(signal);
        const geometryChanged = applyFrame(frame);
        const same = stillFrame(snapshot.camera, geometryChanged);
        if (options.reuseStillFrames && same) {
          // The previous fully denoised canvas is still valid. Encode a frame
          // at the next timestamp, without tracing/denoising the same image again.
          const writingStarted = performance.now();
          frameSampled = true;
          report('saving', 'Tallennetaan pysähdyksen valmista kuvaa');
          await saveFrame(renderer.domElement, frame);
          check();
          reusedFrames++;
          recentFrames.push({
            frame,
            reused: true,
            preparationMs: writingStarted - frameStarted,
            samplingMs: 0,
            firstSampleMs: 0,
            finishingMs: 0,
            writingMs: performance.now() - writingStarted,
            pathGpuMs: 0,
            presentationGpuMs: 0,
          });
          if (recentFrames.length > 8) recentFrames.shift();
          report('saving', 'Pysähdyksen ruutu tallennettu');
          onPreview?.(renderer.domElement, { frame, samples: target, complete: true });
          await yieldRenderUI(signal);
          continue;
        }
        if (geometryChanged) {
          temporal?.invalidate();
          snapshot.scene.updateMatrixWorld(true);
          updateScene();
          // setScene updates geometry/uniforms but retains the already patched shader.
        } else {
          tracer.updateCamera();
          cameraUpdates++;
        }
        denoise.clear();
        guides.invalidate();
        reflections.invalidate();
        waiting.reset();
      }
      const sampleStarted = performance.now();
      while (!frameSampled || tracer.samples < target) {
        await yieldRenderWork(signal);
        check();
        if (document.hidden) {
          waiting.reset();
          pulse('preparing', 'Tauolla — palaa tälle välilehdelle');
          await animationFrame(signal);
          continue;
        }
        if (renderer.getContext().isContextLost())
          throw new Error('Näytönohjaimen yhteys katkesi. Kokeile pienempää kuvakokoa.');
        // Do not let the refresh rate impose one animation frame per tiny tile.
        // Keep batches short and wait without blocking for the previous GPU batch
        // so a background export cannot build an unbounded command queue.
        resources.checkCompilation();
        if (!queue.ready()) {
          // ANGLE can finish cold shader/texture setup at the first draw, after
          // compileAsync resolves. Give the first sample the preparation budget;
          // subsequent work retains the shorter GPU-stall limit.
          waiting.check(checkedFirstSample ? 'gpu' : 'compiling');
          pulse(
            checkedFirstSample ? 'rendering' : 'preparing',
            checkedFirstSample
              ? 'Näytönohjain laskee ruutua'
              : 'Valmistellaan näytönohjaimen ensimmäistä näytettä',
          );
          continue;
        }
        if (resources.compiling) {
          waiting.check('compiling');
          pulse('preparing', 'Käännetään näytönohjaimen renderiohjelmaa');
          continue;
        }
        waiting.reset();
        const batchStart = performance.now();
        queue.begin();
        let submitted = 0;
        for (
          let tile = 0;
          tile < queue.tiles && (!frameSampled || tracer.samples < target);
          tile++
        ) {
          const before = frameSampled ? Math.floor(tracer.samples) : 0;
          tracer.renderSample();
          frameSampled = true;
          submitted++;
          const samples = Math.floor(tracer.samples);
          if (samples >= 1 && !firstSampleMs) firstSampleMs = performance.now() - sampleStarted;
          if (samples > before && options.denoise !== false) {
            queue.measure('presentation', () => {
              const guide = guides.ensure(
                renderer!,
                snapshot.scene,
                snapshot.camera,
                width,
                height,
              );
              denoise.observe(renderer!, tracer!.target, samples, guide.albedo);
            });
          }
          if (
            onPreview &&
            samples > before &&
            samples < target &&
            (previewSample === 0 || performance.now() - lastPreview >= 750)
          ) {
            // Reuse the export canvas: no second trace, PNG encoding or pixel
            // readback during sampling. Final denoising still happens below.
            queue.measure('presentation', () => {
              look.draw(renderer!, tracer!.target.texture);
              onPreview(renderer!.domElement, { frame, samples, complete: false });
            });
            previewSample = samples;
            lastPreview = performance.now();
          }
          if (performance.now() - batchStart >= 6) break;
        }
        queue.submit(submitted);
        if (!checkedFirstSample && tracer.samples >= 1) {
          checkTraceUpload(renderer);
          checkedFirstSample = true;
        }
        pulse('rendering', 'Ruutu tarkentuu');
      }
      await drain();
      const samplingFinished = performance.now();
      report(
        'saving',
        options.denoise !== false ? 'Viimeistellään ja tallennetaan ruutua' : 'Tallennetaan ruutua',
      );
      await yieldRenderUI(signal);
      queue.begin();
      queue.measure('presentation', () => {
        if (options.denoise !== false) {
          const guide = guides.ensure(renderer!, snapshot.scene, snapshot.camera, width, height);
          guide.reflection = reflections.ensure(renderer!, tracer!, width, height);
          if (look.active) {
            filtered ??= new THREE.WebGLRenderTarget(width, height, {
              type: THREE.HalfFloatType,
              depthBuffer: false,
            });
            denoise.draw(renderer!, tracer!.target, target, guide, filtered, stabilizeDiffuse);
            look.draw(renderer!, filtered.texture);
          } else denoise.draw(renderer!, tracer!.target, target, guide, null, stabilizeDiffuse);
        } else look.draw(renderer!, tracer!.target.texture);
      });
      queue.submit();
      await drain();
      check();
      const writingStarted = performance.now();
      await saveFrame(renderer.domElement, frame);
      check();
      recentFrames.push({
        frame,
        preparationMs: sampleStarted - frameStarted,
        samplingMs: samplingFinished - sampleStarted,
        firstSampleMs,
        finishingMs: writingStarted - samplingFinished,
        writingMs: performance.now() - writingStarted,
        pathGpuMs: queue.timings.pathGpuMs - beforeGPU.pathGpuMs,
        presentationGpuMs: queue.timings.presentationGpuMs - beforeGPU.presentationGpuMs,
      });
      if (recentFrames.length > 8) recentFrames.shift();
      report('saving', 'Ruutu tallennettu');
      onPreview?.(renderer.domElement, { frame, samples: target, complete: true });
      // Let even the last frame paint before releasing this WebGL context.
      await yieldRenderUI(signal);
    }
  } finally {
    queue?.dispose();
    if (resources) resources.dispose();
    else tracer?.dispose();
    disposeSnapshotGeometry?.();
    temporal?.dispose();
    denoise.dispose();
    reflections.dispose();
    guides.dispose();
    look.dispose();
    filtered?.dispose();
    environment?.dispose();
    snapshot.dispose();
    renderer?.dispose();
    renderer?.forceContextLoss();
  }
}
