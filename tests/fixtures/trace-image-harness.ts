import * as THREE from 'three';
import { traceImage } from '../../src/render/traceImage';

/** Real GPU exercise of the retained-image lifecycle with deterministic colors. */
export function exerciseTraceImage() {
  const renderer = new THREE.WebGLRenderer({ preserveDrawingBuffer: true });
  renderer.setSize(8, 8);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  const source = new THREE.WebGLRenderTarget(2, 2, { type: THREE.FloatType, depthBuffer: false });
  const image = traceImage();
  const paint = (color: string, size: number) => {
    source.setSize(size, size);
    renderer.setRenderTarget(source);
    renderer.setClearColor(color, 1);
    renderer.clear();
    renderer.setRenderTarget(null);
  };
  const read = (samples: number, smooth = false) => {
    image.capture(renderer, source, samples);
    image.draw(renderer, smooth);
    const gl = renderer.getContext();
    const pixel = new Uint8Array(4);
    gl.readPixels(4, 4, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    return {
      pixel: [...pixel],
      weight: image.historyWeight,
      textures: renderer.info.memory.textures,
      error: gl.getError(),
    };
  };
  try {
    paint('#ff0000', 2);
    const initial = read(4);
    paint('#0000ff', 4);
    const first = read(1);
    const halfway = read(4);
    const complete = read(8);
    const converged = read(64);
    paint('#00ff00', 8);
    const secondUpgrade = read(1);
    const filtered = read(4, true);
    image.clear();
    const cleared = {
      ready: image.ready,
      weight: image.historyWeight,
      textures: renderer.info.memory.textures,
    };
    paint('#0000ff', 2);
    const afterReset = read(1);
    return {
      initial,
      first,
      halfway,
      complete,
      converged,
      secondUpgrade,
      filtered,
      cleared,
      afterReset,
    };
  } finally {
    image.dispose();
    source.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
