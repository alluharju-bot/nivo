import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
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

/** The real three-attachment path must copy every output. Geometry coverage
 * belongs to the new pixel footprint, even while coarse radiance fades out. */
export function exerciseTraceImageChannels() {
  const renderer = new THREE.WebGLRenderer();
  renderer.setSize(8, 8);
  const source = new THREE.WebGLRenderTarget(2, 2, {
    count: 3,
    type: THREE.FloatType,
    depthBuffer: false,
  });
  const material = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    uniforms: { next: { value: false } },
    vertexShader: 'void main(){gl_Position=vec4(position.xy,0.0,1.0);}',
    fragmentShader: `uniform bool next;
      layout(location=1) out vec4 diffuse;
      layout(location=2) out vec4 coverage;
      void main(){
        gl_FragColor=next?vec4(0,0,1,1):vec4(1,0,0,1);
        diffuse=next?vec4(0,0,0.5,1):vec4(0.25,0,0,1);
        coverage=next?vec4(-0.5,0.75,6,1):vec4(0.25,-0.5,1.25,1);
      }`,
  });
  const quad = new FullScreenQuad(material),
    image = traceImage();
  const setTarget = renderer.setRenderTarget.bind(renderer);
  let copied: Parameters<typeof renderer.setRenderTarget>[0] = null;
  renderer.setRenderTarget = (target, ...rest) => {
    if (target && target !== source) copied = target;
    setTarget(target, ...rest);
  };
  const sample = (size: number, next: boolean, count: number) => {
    source.setSize(size, size);
    material.uniforms.next.value = next;
    renderer.setRenderTarget(source);
    quad.render(renderer);
    renderer.setRenderTarget(null);
    image.capture(renderer, source, count);
    const channels = [0, 1, 2].map((index) => {
      const pixels = new Float32Array(4);
      renderer.readRenderTargetPixels(copied!, 0, 0, 1, 1, pixels, undefined, index);
      return [...pixels];
    });
    return { channels, weight: image.historyWeight, error: renderer.getContext().getError() };
  };
  try {
    const initial = sample(2, false, 8);
    const first = sample(4, true, 1);
    const complete = sample(4, true, 8);
    image.clear();
    const reset = sample(2, false, 1);
    return { initial, first, complete, reset };
  } finally {
    image.dispose();
    source.dispose();
    quad.dispose();
    material.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
