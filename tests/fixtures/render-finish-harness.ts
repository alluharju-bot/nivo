import * as THREE from 'three';
import { DenoiseMaterial } from 'three-gpu-pathtracer';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { traceVariance } from '../../src/render/traceVariance';
import { traceDenoise } from '../../src/render/traceDenoise';
import { traceGuides } from '../../src/render/traceGuides';
import { imageLook } from '../../src/render/imageLook';

/** Deterministic HDR noise plus real high-frequency albedo: execute the actual
 * GLSL on the GPU and compare radiance, not a screenshot of a different filter. */
export function exerciseDenoise() {
  const size = 64;
  const renderer = new THREE.WebGLRenderer();
  renderer.setSize(size, size);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  const result = new THREE.WebGLRenderTarget(size, size, {
    type: THREE.FloatType,
    depthBuffer: false,
  });
  const denoise = traceDenoise();
  const textures: THREE.Texture[] = [];
  const texture = (data: Float32Array) => {
    const map = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.FloatType);
    map.needsUpdate = true;
    textures.push(map);
    return map;
  };
  const albedo = new Float32Array(size * size * 4),
    normals = albedo.slice();
  for (let i = 0; i < albedo.length; i += 4) {
    albedo.set([0.5, 0.5, 0.5, 1], i);
    normals.set([0.5, 0.5, 1, 8], i);
  }
  const guides = { albedo: texture(albedo), normal: texture(normals) };
  const trials = [];
  const read = () => {
    const pixels = new Float32Array(size * size * 4);
    renderer.readRenderTargetPixels(result, 0, 0, size, size, pixels);
    return pixels;
  };
  const rmse = (pixels: Float32Array, truth: Float32Array) =>
    Math.sqrt(
      pixels.reduce((sum, n, i) => (i % 4 === 3 ? sum : sum + (n - truth[i]) ** 2), 0) /
        (size * size * 3),
    );
  const old = new DenoiseMaterial({ sigma: 0.87, kSigma: 1, threshold: 0.0164 });
  const quad = new FullScreenQuad(old);
  try {
    for (const brightness of [0.04, 8]) {
      const data = new Float32Array(size * size * 4),
        truth = data.slice();
      let seed = 813;
      for (let i = 0; i < data.length; i += 4) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const n = brightness * (1 + (seed / 4294967296 - 0.5) * 0.3);
        data.set([n, n, n, 1], i);
        truth.set([brightness, brightness, brightness, 1], i);
      }
      const map = texture(data);
      old.map = map;
      renderer.setRenderTarget(result);
      quad.render(renderer);
      renderer.setRenderTarget(null);
      const priorError = rmse(read(), truth) / brightness;
      const errors = [64, 450, 4096].map((samples) => {
        denoise.draw(renderer, map, samples, guides, result);
        return rmse(read(), truth) / brightness;
      });
      trials.push({
        brightness,
        raw: rmse(data, truth) / brightness,
        prior: priorError,
        filtered: errors,
      });
    }
    // Alternating one-pixel wood-like stripes must retain their contrast while
    // independent per-pixel noise decreases along the grain.
    const source = new Float32Array(size * size * 4),
      truth = source.slice(),
      guide = source.slice();
    let seed = 419;
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const i = (y * size + x) * 4;
        const color = x % 2 ? 0.6 : 0.4;
        const v = color * (1 + (seed / 4294967296 - 0.5) * 0.16);
        source.set([v * 6, v * 4, v * 2, 1], i);
        truth.set([color * 6, color * 4, color * 2, 1], i);
        guide.set([color, color * 0.65, color * 0.3, 1], i);
      }
    denoise.draw(renderer, texture(source), 450, { ...guides, albedo: texture(guide) }, result);
    const pixels = read();
    let light = 0,
      dark = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if ((i / 4) % 2) light += pixels[i];
      else dark += pixels[i];
    }
    return {
      trials,
      grain: {
        raw: rmse(source, truth),
        filtered: rmse(pixels, truth),
        contrast: (light - dark) / ((size * size) / 2),
      },
      error: renderer.getContext().getError(),
    };
  } finally {
    textures.forEach((t) => t.dispose());
    result.dispose();
    denoise.dispose();
    quad.dispose();
    old.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}

export function exerciseGuidesAndLooks() {
  const renderer = new THREE.WebGLRenderer({ preserveDrawingBuffer: true });
  renderer.setSize(128, 128);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#dce2e5');
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(0, 0, 4);
  const material = new THREE.MeshPhysicalMaterial({ color: '#99734b', roughness: 0.8 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 1), material);
  scene.add(mesh, new THREE.HemisphereLight(0xffffff, 0x303030, 3));
  const guides = traceGuides(),
    look = imageLook();
  const raw = new THREE.WebGLRenderTarget(128, 128, { type: THREE.HalfFloatType });
  const read = () => {
    const gl = renderer.getContext(),
      bytes = new Uint8Array(128 * 128 * 4);
    gl.readPixels(0, 0, 128, 128, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
    return bytes;
  };
  try {
    renderer.setRenderTarget(raw);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    const baseTextures = renderer.info.memory.textures;
    const first = guides.ensure(renderer, scene, camera, 128, 128);
    const guideTextures = renderer.info.memory.textures;
    const same = guides.ensure(renderer, scene, camera, 128, 128);
    const retained = mesh.material === material && scene.background instanceof THREE.Color;
    const programs = renderer.info.programs!.map((p) => p.id);
    guides.reset();
    guides.ensure(renderer, scene, camera, 128, 128);
    const reusedPrograms = programs.every((id) => renderer.info.programs!.some((p) => p.id === id));
    material.color.set('#334488');
    guides.invalidate();
    const painted = guides.ensure(renderer, scene, camera, 128, 128);
    const guideCopy = new THREE.MeshBasicMaterial({ map: painted.albedo, toneMapped: false });
    const guideQuad = new FullScreenQuad(guideCopy);
    guideQuad.render(renderer);
    const guidePixel = read().slice((64 * 128 + 64) * 4, (64 * 128 + 64) * 4 + 3);
    const changedGuide = [51, 68, 136].every((v, i) => Math.abs(v - guidePixel[i]) <= 2);
    guideQuad.dispose();
    guideCopy.dispose();
    look.draw(renderer, raw.texture);
    const base = read();
    look.configure({ look: 'dream', lookStrength: 1 });
    look.draw(renderer, raw.texture);
    const dream = read();
    look.configure({ look: 'mist', lookStrength: 1 });
    look.draw(renderer, raw.texture);
    const mist = read();
    look.configure({ look: 'soft', lookStrength: 0 });
    look.draw(renderer, raw.texture);
    const zero = read();
    look.configure({ look: 'standard' });
    look.draw(renderer, raw.texture);
    const reset = read();
    const different = (a: Uint8Array, b: Uint8Array) =>
      a.reduce((s, n, i) => s + Math.abs(n - b[i]), 0) / a.length;
    guides.clear();
    const released = renderer.info.memory.textures;
    return {
      baseTextures,
      reusedPrograms,
      changedGuide,
      guideTextures,
      released,
      retained,
      reused: first.albedo === same.albedo,
      dream: different(base, dream),
      mist: different(base, mist),
      zero: different(base, zero),
      reset: different(base, reset),
      error: renderer.getContext().getError(),
    };
  } finally {
    raw.dispose();
    guides.dispose();
    look.dispose();
    mesh.geometry.dispose();
    material.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}

export function exerciseVariance() {
  const size = 64,
    samples = 256;
  const renderer = new THREE.WebGLRenderer();
  renderer.setSize(size, size);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  const source = new THREE.WebGLRenderTarget(size, size, {
    type: THREE.FloatType,
    depthBuffer: false,
  });
  const output = source.clone();
  const variance = traceVariance(),
    denoise = traceDenoise();
  const means = new Float32Array(size * size * 4),
    albedo = means.slice(),
    normals = means.slice(),
    truth = means.slice();
  const textures: THREE.DataTexture[] = [];
  const tex = (data: Float32Array) => {
    const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.FloatType);
    t.needsUpdate = true;
    textures.push(t);
    return t;
  };
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const a = x < 32 ? 0.5 : x % 2 ? 0.6 : 0.4;
      albedo.set([a, a, a, 1], i);
      normals.set([0.5, 0.5, 1, 8], i);
      truth.set([a * 8, a * 6, a * 4, 1], i);
    }
  const guides = { albedo: tex(albedo), normal: tex(normals) },
    map = tex(means);
  const copy = new THREE.MeshBasicMaterial({
    map,
    toneMapped: false,
    depthTest: false,
    depthWrite: false,
  });
  const quad = new FullScreenQuad(copy);
  let seed = 952;
  const read = () => {
    const v = means.slice();
    renderer.readRenderTargetPixels(output, 0, 0, size, size, v);
    return v;
  };
  const error = (v: Float32Array, left: boolean) => {
    let sum = 0,
      n = 0;
    for (let y = 4; y < size - 4; y++)
      for (let x = 4; x < size - 4; x++)
        if (x < 28 === left && (left || x > 36)) {
          const i = (y * size + x) * 4;
          sum += (v[i] - truth[i]) ** 2;
          n++;
        }
    return Math.sqrt(sum / n);
  };
  try {
    for (let n = 1; n <= samples; n++) {
      for (let i = 0; i < means.length; i += 4) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        // High-variance but nonnegative indirect illumination.
        const noise = seed / 4294967296 < 0.15 ? 1 / 0.15 : 0;
        for (let c = 0; c < 3; c++) means[i + c] += (truth[i + c] * noise - means[i + c]) / n;
        means[i + 3] = 1;
      }
      map.needsUpdate = true;
      renderer.setRenderTarget(source);
      quad.render(renderer);
      renderer.setRenderTarget(null);
      variance.update(renderer, source, n);
    }
    denoise.draw(renderer, source.texture, samples, guides, output);
    const prior = read();
    denoise.draw(renderer, source.texture, samples, guides, output, variance.texture);
    const filtered = read();
    copy.map = variance.texture!;
    renderer.setRenderTarget(output);
    quad.render(renderer);
    renderer.setRenderTarget(null);
    const moments = read();
    const varianceMean =
      moments.reduce((sum, v, i) => sum + (i % 4 === 1 ? v : 0), 0) / (size * size);
    const memory = renderer.info.memory.textures;
    const result = {
      varianceMean,
      raw: error(means, true),
      prior: error(prior, true),
      filtered: error(filtered, true),
      grainRaw: error(means, false),
      grainFiltered: error(filtered, false),
      error: renderer.getContext().getError(),
      memory,
    };
    variance.clear();
    denoise.clear();
    return { ...result, released: memory - renderer.info.memory.textures };
  } finally {
    variance.dispose();
    denoise.dispose();
    quad.dispose();
    copy.dispose();
    textures.forEach((t) => t.dispose());
    source.dispose();
    output.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
