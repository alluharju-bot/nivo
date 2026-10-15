import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { traceLighting } from '../../src/render/traceLighting';
import { screenVertex } from '../../src/render/traceDenoise';

export function exerciseReflectedDetail() {
  const size = 64,
    renderer = new THREE.WebGLRenderer();
  renderer.setSize(size, size);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  const source = new THREE.WebGLRenderTarget(size, size, {
    count: 2,
    type: THREE.FloatType,
    depthBuffer: false,
  });
  const output = new THREE.WebGLRenderTarget(size, size, {
    type: THREE.FloatType,
    depthBuffer: false,
  });
  const maps: THREE.DataTexture[] = [];
  const texture = (values: Float32Array) => {
    const t = new THREE.DataTexture(values, size, size, THREE.RGBAFormat, THREE.FloatType);
    t.needsUpdate = true;
    maps.push(t);
    return t;
  };
  const raw = new Float32Array(size * size * 4),
    diffuse = raw.slice(),
    albedo = raw.slice(),
    normal = raw.slice(),
    reflection = raw.slice(),
    refNormal = raw.slice(),
    truth = raw.slice();
  const means = new Float64Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const k = (y * size + x) * 4,
        a = x % 2 === 0 ? 0.45 : 0.55,
        s = Math.floor(x / 8) % 2 === 0 ? 0.2 : 0.6;
      diffuse.set([a * 0.3, a * 0.3, a * 0.3, 1], k);
      albedo.set([a, a, a, 0.24], k);
      normal.set([0.5, 0.5, 1, 5], k);
      refNormal.set([0.5, 0.5, 1, 7], k);
      reflection.set([s, s, s, 1], k);
      truth.set([a * 0.3 + s, a * 0.3 + s, a * 0.3 + s, 1], k);
    }
  const map = texture(raw),
    diffuseMap = texture(diffuse),
    guide = {
      albedo: texture(albedo),
      normal: texture(normal),
      projectionInverse: new THREE.OrthographicCamera(-100, 100, 100, -100, 0.1, 10000)
        .projectionMatrixInverse,
      reflection: { albedo: texture(reflection), normal: texture(refNormal) },
    };
  const copy = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    uniforms: { map: { value: map }, diffuse: { value: diffuseMap } },
    vertexShader: screenVertex,
    fragmentShader: `uniform sampler2D map,diffuse; varying vec2 vUv; layout(location=1) out vec4 diffuseOutput; void main(){gl_FragColor=texture2D(map,vUv);diffuseOutput=texture2D(diffuse,vUv);}`,
  });
  const quad = new FullScreenQuad(copy),
    lighting = traceLighting();
  let seed = 813;
  try {
    for (let sample = 1; sample <= 64; sample++) {
      for (let i = 0; i < size * size; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const v = seed / 4294967296 < 0.1 ? 10 : 0;
        means[i] += (v - means[i]) / sample;
        const s = truth[i * 4] - diffuse[i * 4],
          c = diffuse[i * 4] + s * means[i];
        raw.set([c, c, c, 1], i * 4);
      }
      map.needsUpdate = true;
      renderer.setRenderTarget(source);
      quad.render(renderer);
      renderer.setRenderTarget(null);
      lighting.observe(renderer, source, sample);
    }
    lighting.draw(renderer, source, 64, guide, output);
    const pixels = raw.slice();
    renderer.readRenderTargetPixels(output, 0, 0, size, size, pixels);
    // Isolate the small albedo pattern from the much brighter stochastic
    // reflection: identical specular samples, constant diffuse counterfactual.
    const originalRaw = raw.slice(),
      originalDiffuse = diffuse.slice();
    for (let i = 0; i < raw.length; i++)
      if (i % 4 !== 3) {
        raw[i] -= diffuse[i] - 0.15;
        diffuse[i] = 0.15;
      }
    map.needsUpdate = diffuseMap.needsUpdate = true;
    renderer.setRenderTarget(source);
    quad.render(renderer);
    renderer.setRenderTarget(null);
    lighting.draw(renderer, source, 64, guide, output);
    const flat = pixels.slice();
    renderer.readRenderTargetPixels(output, 0, 0, size, size, flat);
    let rawError = 0,
      filteredError = 0,
      sum = 0,
      expected = 0,
      contrast = 0,
      reference = 0,
      grain = 0;
    for (let y = 8; y < 56; y++)
      for (let x = 8; x < 56; x++) {
        const k = (y * size + x) * 4,
          sign = Math.floor(x / 8) % 2 === 0 ? -1 : 1;
        rawError += (originalRaw[k] - truth[k]) ** 2;
        filteredError += (pixels[k] - truth[k]) ** 2;
        sum += pixels[k];
        expected += truth[k];
        contrast += sign * (pixels[k] - originalDiffuse[k]);
        reference += sign * (truth[k] - originalDiffuse[k]);
        grain += (x % 2 === 0 ? -1 : 1) * (pixels[k] - flat[k]);
      }
    return {
      raw: Math.sqrt(rawError / 2304),
      filtered: Math.sqrt(filteredError / 2304),
      brightness: sum / expected,
      contrast: contrast / reference,
      grain: grain / (2304 * 0.015),
      error: renderer.getContext().getError(),
    };
  } finally {
    lighting.dispose();
    quad.dispose();
    copy.dispose();
    maps.forEach((t) => t.dispose());
    source.dispose();
    output.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
