import * as THREE from 'three';
import { configureTraceTextures, checkTraceUpload } from './traceTextures';
import { WebGLPathTracer, GradientEquirectTexture } from 'three-gpu-pathtracer';
import type { RenderSnapshot } from './snapshot';
import { configureEmitterSampling } from './emitterSampling';

export type RenderJobOptions = { width: number; samples: number };
export type RenderJobProgress = {
  phase: 'preparing' | 'rendering' | 'saving';
  samples: number;
  target: number;
  elapsed: number;
  width: number;
  height: number;
};

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
/** A finite render on its own canvas. It continues when the modeling workspace is opened. */
export async function renderSnapshot(
  snapshot: RenderSnapshot,
  options: RenderJobOptions,
  signal: AbortSignal,
  onProgress: (progress: RenderJobProgress) => void,
): Promise<Blob> {
  let renderer: THREE.WebGLRenderer | undefined,
    tracer: WebGLPathTracer | undefined,
    environment: GradientEquirectTexture | undefined;
  const { width, samples: target } = options,
    height = Math.max(1, Math.round(width / snapshot.aspect));
  const started = performance.now();
  const check = () => {
    if (signal.aborted) throw new DOMException('Renderöinti keskeytettiin.', 'AbortError');
  };
  const report = (phase: RenderJobProgress['phase']) =>
    onProgress({
      phase,
      samples: Math.min(target, Math.floor(tracer?.samples ?? 0)),
      target,
      elapsed: (performance.now() - started) / 1000,
      width,
      height,
    });
  try {
    check();
    if (
      !Number.isInteger(width) ||
      width < 64 ||
      width > 4096 ||
      !Number.isInteger(target) ||
      target < 1 ||
      target > 4096 ||
      !Number.isFinite(height) ||
      height > 4096 ||
      width * height > 12_000_000
    )
      throw new Error('Kuvan koko tai näytemäärä on liian suuri.');
    report('preparing');
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
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = snapshot.exposure;
    environment = new GradientEquirectTexture(256);
    configureTraceEnvironment(environment, snapshot.scene);
    snapshot.scene.environment = environment;
    tracer = new WebGLPathTracer(renderer);
    configureEmitterSampling(tracer);
    tracer.tiles.set(Math.ceil(width / 256), Math.ceil(height / 256));
    tracer.bounces = 10;
    tracer.transmissiveBounces = 12;
    tracer.filterGlossyFactor = 0.5;
    tracer.renderScale = 1;
    tracer.minSamples = 1;
    tracer.fadeDuration = 0;
    tracer.renderDelay = 0;
    tracer.rasterizeScene = false;
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
    await Promise.all(
      [...images].map((image) =>
        image.complete && image.naturalWidth ? undefined : image.decode(),
      ),
    );
    check();
    configureTraceTextures(snapshot.scene, renderer, tracer);
    tracer.setScene(snapshot.scene, snapshot.camera);
    checkTraceUpload(renderer);
    let lastReport = 0;
    while (tracer.samples < target) {
      await animationFrame(signal);
      check();
      if (document.hidden) continue;
      if (renderer.getContext().isContextLost())
        throw new Error('Näytönohjaimen yhteys katkesi. Kokeile pienempää kuvakokoa.');
      tracer.renderSample();
      if (tracer.samples === 1) checkTraceUpload(renderer);
      if (performance.now() - lastReport > 400) {
        report('rendering');
        lastReport = performance.now();
      }
    }
    report('saving');
    check();
    const blob = await new Promise<Blob>((resolve, reject) =>
      renderer!.domElement.toBlob(
        (value) => (value ? resolve(value) : reject(new Error('Kuvan tallennus epäonnistui.'))),
        'image/png',
      ),
    );
    check();
    return blob;
  } finally {
    tracer?.dispose();
    environment?.dispose();
    snapshot.dispose();
    renderer?.dispose();
    renderer?.forceContextLoss();
  }
}
