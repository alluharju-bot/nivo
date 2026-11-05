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

/** Complete-frame cache stays exact while a later GPU tile changes all three
 * live attachments; switching display controls must not expose that partial tile. */
export function exerciseTraceImageChannels() {
  const renderer = new THREE.WebGLRenderer({ preserveDrawingBuffer: true });
  renderer.setSize(8, 8);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  const source = new THREE.WebGLRenderTarget(4, 4, {
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
        gl_FragColor=next?vec4(0,0,1,1):vec4(1.234567,0,0,1);
        diffuse=next?vec4(0,0,0.5,1):vec4(0.25,0,0,1);
        coverage=next?vec4(-0.5,0.75,6,1):vec4(0.25,-0.5,1.25,1);
      }`,
  });
  const quad = new FullScreenQuad(material),
    image = traceImage();
  const setTarget = renderer.setRenderTarget.bind(renderer);
  let cached: Parameters<typeof renderer.setRenderTarget>[0] = null;
  renderer.setRenderTarget = (target, ...rest) => {
    if (target && target !== source) cached = target;
    setTarget(target, ...rest);
  };
  const paint = (next: boolean) => {
    material.uniforms.next.value = next;
    renderer.setRenderTarget(source);
    quad.render(renderer);
    renderer.setRenderTarget(null);
  };
  const screen = (smooth = false) => {
    image.draw(renderer, smooth);
    const p = new Uint8Array(4),
      gl = renderer.getContext();
    gl.readPixels(4, 4, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p);
    return [...p];
  };
  try {
    paint(false);
    image.capture(renderer, source, 8);
    const raw = new Float32Array(4);
    renderer.readRenderTargetPixels(cached!, 0, 0, 1, 1, raw);
    const attachments = cached!.textures.length;
    const channels = [0, 1, 2].map((index) => {
      const p = new Float32Array(4);
      renderer.readRenderTargetPixels(source, 0, 0, 1, 1, p, undefined, index);
      return [...p];
    });
    const before = screen();
    image.invalidateSource();
    paint(true);
    const during = screen(true);
    image.capture(renderer, source, 9);
    renderer.info.autoReset = false;
    renderer.info.reset();
    const after = screen(true);
    const filterDraws = renderer.info.render.calls;
    renderer.info.reset();
    const repeated = screen(true);
    const cachedDraws = renderer.info.render.calls;
    return {
      raw: [...raw],
      attachments,
      channels,
      before,
      during,
      after,
      repeated,
      filterDraws,
      cachedDraws,
      error: renderer.getContext().getError(),
    };
  } finally {
    image.dispose();
    source.dispose();
    quad.dispose();
    material.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
