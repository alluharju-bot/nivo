import * as THREE from 'three';
import { WebGLPathTracer } from 'three-gpu-pathtracer';
import { traceResources } from '../../src/render/traceResources';
import { configureEmitterSampling } from '../../src/render/emitterSampling';
import { traceDenoise } from '../../src/render/traceDenoise';

/** Actual camera rays through a subpixel diagonal, compared to pixel coverage.
 * Center-sampled guides cannot replace the fractional coverage in radiance. */
export async function exerciseTraceEdges() {
  const size = 96,
    renderer = new THREE.WebGLRenderer();
  renderer.setSize(size, size);
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 20000);
  const texture = (data: Float32Array) => {
    const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.FloatType);
    t.needsUpdate = true;
    return t;
  };
  const colors = new Float32Array(size * size * 4),
    normals = colors.slice(),
    variances = colors.slice();
  const boundary = (x: number, y: number) => x - 0.37 * y - 30.3;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      colors.set([0.5, 0.5, 0.5, 0.85], i);
      normals.set([0.5, 0.5, 1, boundary(x + 0.5, y + 0.5) > 0 ? 6 : 8], i);
      variances.set([0, 0.01, 0, 1], i);
    }
  const guides = {
    albedo: texture(colors),
    normal: texture(normals),
    projectionInverse: camera.projectionMatrixInverse,
  };
  const variance = texture(variances),
    output = new THREE.WebGLRenderTarget(size, size, { type: THREE.FloatType, depthBuffer: false });
  const scaled = new THREE.WebGLRenderTarget(144, 144, {
    type: THREE.FloatType,
    depthBuffer: false,
  });
  const denoise = traceDenoise(),
    results = [];
  try {
    for (const mode of ['legacy', 'production'] as const) {
      renderer.setRenderTarget(null);
      const tracer = new WebGLPathTracer(renderer),
        resources = traceResources(tracer);
      const errors: Record<string, number> = {};
      errors.begin = renderer.getContext().getError();
      try {
        tracer.setCamera(camera);
        resources.resize(size, size);
        tracer.tiles.set(1, 1);
        tracer.renderToCanvas = false;
        tracer.renderDelay = 0;
        tracer.bounces = 2;
        configureEmitterSampling(tracer);
        const material = (tracer as unknown as { _pathTracer: { material: THREE.ShaderMaterial } })
          ._pathTracer.material;
        if (mode === 'legacy')
          material.fragmentShader = material.fragmentShader.replace(
            'vec2 jitteredUv = vUv + (ruv - 0.5) * ssd;',
            'vec2 jitteredUv = vUv + vec2(tentFilter(ruv.x), tentFilter(ruv.y)) * ssd;',
          );
        const start = material.fragmentShader.lastIndexOf('void main() {');
        material.fragmentShader =
          material.fragmentShader.slice(0, start) +
          `
          void main(){rng_initialize(gl_FragCoord.xy,seed);
            sobolPixelIndex=(uint(gl_FragCoord.x)<<16)|uint(gl_FragCoord.y); sobolPathIndex=uint(seed);
            Ray ray=getCameraRay(); vec2 p=(ray.origin.xy+1.0)*48.0;
            float c=p.x-0.37*p.y-30.3>0.0?0.8:0.2;
            gl_FragColor=vec4(vec3(c),opacity);}`;
        material.needsUpdate = true;
        while (tracer.samples < 256) {
          await new Promise<void>((r) => requestAnimationFrame(() => r()));
          for (let i = 0; i < 16 && tracer.samples < 256; i++) tracer.renderSample();
        }
        errors.samples = renderer.getContext().getError();
        const raw = colors.slice(),
          filtered = colors.slice();
        renderer.readRenderTargetPixels(tracer.target, 0, 0, size, size, raw);
        errors.rawRead = renderer.getContext().getError();
        denoise.draw(renderer, tracer.target.texture, 256, guides, output, variance);
        errors.filter = renderer.getContext().getError();
        renderer.readRenderTargetPixels(output, 0, 0, size, size, filtered);
        let rawError = 0,
          filteredError = 0,
          n = 0,
          opacityError = 0;
        for (let y = 8; y < size - 8; y++)
          for (let x = 8; x < size - 8; x++) {
            if (Math.abs(boundary(x + 0.5, y + 0.5)) > 1.5) continue;
            let coverage = 0;
            for (let j = 0; j < 32; j++)
              for (let k = 0; k < 32; k++)
                coverage += boundary(x + (k + 0.5) / 32, y + (j + 0.5) / 32) > 0 ? 1 : 0;
            const expected = 0.2 + (0.6 * coverage) / 1024,
              i = (y * size + x) * 4;
            rawError += (raw[i] - expected) ** 2;
            filteredError += (filtered[i] - expected) ** 2;
            opacityError = Math.max(opacityError, Math.abs(filtered[i + 3] - 1));
            n++;
          }
        denoise.draw(renderer, tracer.target.texture, 256, guides, scaled, variance);
        const enlarged = new Float32Array(144 * 144 * 4);
        renderer.readRenderTargetPixels(scaled, 0, 0, 144, 144, enlarged);
        let scaleError = 0;
        for (let y = 4; y < 140; y++)
          for (let x = 4; x < 140; x++) {
            const sx = (x + 0.5) / 1.5 - 0.5,
              sy = (y + 0.5) / 1.5 - 0.5,
              ix = Math.floor(sx),
              iy = Math.floor(sy),
              fx = sx - ix,
              fy = sy - iy;
            const v = (xx: number, yy: number) => filtered[(yy * size + xx) * 4];
            const expected =
              (1 - fy) * ((1 - fx) * v(ix, iy) + fx * v(ix + 1, iy)) +
              fy * ((1 - fx) * v(ix, iy + 1) + fx * v(ix + 1, iy + 1));
            scaleError = Math.max(scaleError, Math.abs(enlarged[(y * 144 + x) * 4] - expected));
          }
        results.push({
          mode,
          scaleError,
          rawError: Math.sqrt(rawError / n),
          filteredError: Math.sqrt(filteredError / n),
          opacityError,
          errors,
          error: renderer.getContext().getError(),
        });
      } finally {
        resources.dispose();
      }
    }
    return results;
  } finally {
    guides.albedo.dispose();
    guides.normal.dispose();
    variance.dispose();
    output.dispose();
    scaled.dispose();
    denoise.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
