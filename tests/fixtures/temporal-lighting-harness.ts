import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { temporalDiffuse } from '../../src/render/temporalDiffuse';
import { screenVertex } from '../../src/render/traceDenoise';

/** GPU checks use known lighting and moving textured geometry. These are not
 * image-perfect assertions about a random path trace or the production shader. */
export function exerciseTemporalLighting() {
  const width = 160,
    height = 96;
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setSize(width, height);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  const options = { type: THREE.FloatType, depthBuffer: false };
  const source = new THREE.WebGLRenderTarget(width, height, options),
    readback = new THREE.WebGLRenderTarget(width, height, options);
  const camera = new THREE.PerspectiveCamera(50, width / height, 1, 20000);
  camera.position.z = 6000;
  const data = [0, 1, 2].map(() => new Float32Array(width * height * 4));
  const textures = data.map((a) => {
    const t = new THREE.DataTexture(a, width, height, THREE.RGBAFormat, THREE.FloatType);
    t.needsUpdate = true;
    return t;
  });
  const copy = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    uniforms: { map: { value: textures[0] } },
    vertexShader: screenVertex,
    fragmentShader:
      'varying vec2 vUv;uniform sampler2D map;void main(){gl_FragColor=texture2D(map,vUv);}',
  });
  const quad = new FullScreenQuad(copy),
    filter = temporalDiffuse();
  const pixels = new Float32Array(width * height * 4),
    truth = pixels.slice();
  const frames: {
    frame: number;
    sourceRmse: number;
    filteredRmse: number;
    detailRatio: number;
    newSurfaceError: number;
  }[] = [];
  const allocations: number[] = [];
  let seed = 7817;
  const sample = (frame: number, noNoise = false, foreground = false, glass = false) => {
    camera.updateMatrixWorld(true);
    const extent = Math.tan(THREE.MathUtils.degToRad(25));
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const newlyVisible =
          foreground &&
          x > width * 0.65 &&
          x < width * 0.85 &&
          y > height * 0.3 &&
          y < height * 0.7;
        const depth = newlyVisible ? 3 : 6;
        const worldX =
          camera.position.x +
          ((((x + 0.5) / width) * 2 - 1) * depth * 1000 * extent * width) / height;
        const worldY = (((y + 0.5) / height) * 2 - 1) * depth * 1000 * extent;
        const paint = 0.35 + 0.09 * Math.sin(worldX * 0.045) + 0.025 * Math.sin(worldY * 0.08);
        const light = newlyVisible ? 0.09 : 0.6 + worldX * 0.000015;
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const noise = noNoise || newlyVisible ? 0 : (seed / 4294967296 - 0.5) * 0.18;
        const colors = [paint, paint * 0.65, paint * 0.3];
        data[0].set([...colors.map((c) => c * (light + noise)), 1], i);
        data[1].set([...colors, glass ? 0 : 0.6], i);
        data[2].set([0.5, 0.5, 1, depth], i);
        truth.set([...colors.map((c) => c * light), 1], i);
      }
    textures.forEach((t) => (t.needsUpdate = true));
    copy.uniforms.map.value = textures[0];
    renderer.setRenderTarget(source);
    quad.render(renderer);
    const result = filter.draw(
      renderer,
      source,
      {
        albedo: textures[1],
        normal: textures[2],
        projectionInverse: camera.projectionMatrixInverse,
      },
      camera,
    );
    allocations.push(filter.bytes);
    copy.uniforms.map.value = result;
    renderer.setRenderTarget(readback);
    quad.render(renderer);
    renderer.readRenderTargetPixels(readback, 0, 0, width, height, pixels);
    let raw = 0,
      filtered = 0,
      rawDetail = 0,
      detail = 0,
      count = 0,
      newSurfaceError = 0;
    for (let y = 5; y < height - 5; y++)
      for (let x = 5; x < width - 5; x++) {
        const i = (y * width + x) * 4;
        raw += (data[0][i] - truth[i]) ** 2;
        filtered += (pixels[i] - truth[i]) ** 2;
        if (!foreground) {
          rawDetail += (truth[i + 4] - truth[i]) ** 2;
          detail += (pixels[i + 4] - pixels[i]) ** 2;
        }
        if (
          foreground &&
          x > width * 0.67 &&
          x < width * 0.83 &&
          y > height * 0.33 &&
          y < height * 0.67
        )
          newSurfaceError = Math.max(newSurfaceError, Math.abs(pixels[i] - truth[i]));
        count++;
      }
    frames.push({
      frame,
      sourceRmse: Math.sqrt(raw / count),
      filteredRmse: Math.sqrt(filtered / count),
      detailRatio: Math.sqrt(detail / Math.max(rawDetail, 1e-20)),
      newSurfaceError,
    });
    return Math.max(...pixels.map((v, i) => Math.abs(v - data[0][i])));
  };
  try {
    for (let f = 0; f < 8; f++) {
      camera.position.x = f * 10;
      sample(f);
    }
    const smooth = frames.slice(3).reduce((s, f) => s + f.filteredRmse / f.sourceRmse, 0) / 5;
    // New foreground cannot inherit the bright wall it just covered.
    sample(8, false, true);
    const disocclusion = frames.at(-1)!.newSurfaceError;
    filter.invalidate();
    sample(9, true);
    camera.position.x += 10;
    sample(10, true);
    const cleanDetail = frames.at(-1)!;
    camera.position.x += 2000;
    const cutError = sample(11);
    filter.invalidate();
    const invalidatedError = sample(12);
    const glassError = sample(13, false, false, true);
    const bytes = filter.bytes;
    const gl = renderer.getContext();
    const error = gl.getError();
    filter.dispose();
    const disposedBytes = filter.bytes;
    // Fail the CLI invocation rather than silently printing an unsuccessful
    // metric. Tolerances allow half-float quantisation across GPU drivers.
    const checks = {
      noiseReduced: smooth < 0.7,
      currentTextureRetained: Math.abs(cleanDetail.detailRatio - 1) < 0.01,
      newSurfaceRejected: disocclusion < 0.001,
      cameraCutRejected: cutError < 0.001,
      geometryResetRejected: invalidatedError < 0.001,
      transmissionUnchanged: glassError < 0.001,
      fixedHistoryAllocation: allocations.every((n) => n === width * height * 40),
      historyReleased: disposedBytes === 0,
      noGLError: error === 0,
    };
    if (Object.values(checks).some((passed) => !passed))
      throw new Error(`Temporal lighting regression: ${JSON.stringify(checks)}`);
    return {
      checks,
      disposedBytes,
      smooth,
      disocclusion,
      cleanDetail,
      cutError,
      invalidatedError,
      glassError,
      bytes,
      error,
      frames,
    };
  } finally {
    filter.dispose();
    source.dispose();
    readback.dispose();
    textures.forEach((t) => t.dispose());
    copy.dispose();
    quad.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
