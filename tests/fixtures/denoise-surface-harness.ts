import * as THREE from 'three';
import { traceDenoise } from '../../src/render/traceDenoise';
import { traceGuides } from '../../src/render/traceGuides';

/** The same isotropic radiance noise on a front-facing and grazing-angle wall.
 * Depth changes across a plane are not a silhouette and must not stretch noise.
 * Use the real raster guides, including their GPU format and interpolation. */
export function exerciseSurfaceDenoise() {
  const size = 128;
  const renderer = new THREE.WebGLRenderer();
  renderer.setSize(size, size);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  const target = new THREE.WebGLRenderTarget(size, size, {
    type: THREE.FloatType,
    depthBuffer: false,
  });
  const denoise = traceDenoise(),
    guides = traceGuides();
  const scene = new THREE.Scene();
  const material = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.6 });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(20000, 20000), material);
  const foreground = new THREE.Mesh(new THREE.PlaneGeometry(128, 256), material);
  scene.add(plane);
  const camera = new THREE.OrthographicCamera(-128, 128, 128, -128, 1, 20000);
  camera.position.z = 6000;
  const textures: THREE.Texture[] = [];
  const texture = (data: Float32Array) => {
    const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.FloatType);
    t.needsUpdate = true;
    textures.push(t);
    return t;
  };
  const source = new Float32Array(size * size * 4),
    variance = source.slice(),
    truth = source.slice();
  let seed = 419;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const random = seed / 4294967296;
      // A smooth real lighting gradient with moderate noise and rare bright paths.
      const expected = 0.4 + (0.3 * x) / size;
      const value = expected + (random - 0.5) * 0.2 + (random > 0.99 ? 1.98 : -0.02);
      const i = (y * size + x) * 4;
      source.set([value, value, value, 1], i);
      truth.set([expected, expected, expected, 1], i);
      variance.set([0, 0.04, 0, 1], i);
    }
  const map = texture(source),
    moments = texture(variance);
  const results = [];
  try {
    for (const perspective of [false, true])
      for (const angle of [0, 80]) {
        const view = perspective ? new THREE.PerspectiveCamera(2.45, 1, 1, 20000) : camera;
        view.position.z = 6000;
        plane.rotation.y = THREE.MathUtils.degToRad(angle);
        guides.invalidate();
        const guide = guides.ensure(renderer, scene, view, size, size);
        denoise.draw(renderer, map, 70, guide, target, moments);
        const pixels = source.slice();
        renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels);
        let dx = 0,
          dy = 0,
          error = 0,
          mean = 0,
          expectedMean = 0,
          count = 0;
        const residual = (i: number) => pixels[i] - truth[i];
        for (let y = 12; y < size - 12; y++)
          for (let x = 12; x < size - 12; x++) {
            const i = (y * size + x) * 4;
            dx += (residual(i + 4) - residual(i)) ** 2;
            dy += (residual(i + size * 4) - residual(i)) ** 2;
            error += residual(i) ** 2;
            mean += pixels[i];
            expectedMean += truth[i];
            count++;
          }
        results.push({
          perspective,
          angle,
          anisotropy: dx / dy,
          rmse: Math.sqrt(error / count),
          brightness: mean / expectedMean,
        });
      }
    // Identical paint and normals on two separate parallel surfaces must still
    // reject each other at the silhouette, even when measured noise is high.
    plane.rotation.y = 0;
    foreground.position.set(64, 0, 400);
    scene.add(foreground);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4,
          v = x < size / 2 ? 0.4 : 0.8;
        source.set([v, v, v, 1], i);
        variance.set([0, 1, 0, 1], i);
      }
    map.needsUpdate = moments.needsUpdate = true;
    guides.invalidate();
    denoise.draw(
      renderer,
      map,
      70,
      guides.ensure(renderer, scene, camera, size, size),
      target,
      moments,
    );
    const edge = source.slice();
    renderer.readRenderTargetPixels(target, 0, 0, size, size, edge);
    let edgeError = 0;
    for (let y = 12; y < size - 12; y++)
      for (let x = 59; x < 69; x++) {
        const i = (y * size + x) * 4;
        edgeError = Math.max(edgeError, Math.abs(edge[i] - source[i]));
      }
    // Converged lighting has detail without any albedo/normal boundary: a
    // small soft highlight and a hard shadow on one uniformly painted wall.
    scene.remove(foreground);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const v = (x < 64 ? 0.2 : 0.8) + 0.6 * Math.exp(-0.5 * ((x - 32) / 4) ** 2);
        source.set([v, v, v, 1], i);
        variance.set([0, 0, 0, 1], i);
      }
    map.needsUpdate = moments.needsUpdate = true;
    guides.invalidate();
    denoise.draw(
      renderer,
      map,
      4096,
      guides.ensure(renderer, scene, camera, size, size),
      target,
      moments,
    );
    const detail = source.slice();
    renderer.readRenderTargetPixels(target, 0, 0, size, size, detail);
    const value = (x: number) => detail[(64 * size + x) * 4];
    const highlightContrast = (value(32) - 0.2) / 0.6;
    const shadowContrast = (value(65) - value(62)) / 0.6;
    return {
      results,
      edgeError,
      highlightContrast,
      shadowContrast,
      error: renderer.getContext().getError(),
    };
  } finally {
    textures.forEach((t) => t.dispose());
    target.dispose();
    denoise.dispose();
    guides.dispose();
    plane.geometry.dispose();
    foreground.geometry.dispose();
    material.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
