import * as THREE from 'three';
import { WebGLPathTracer } from 'three-gpu-pathtracer';
import { traceResources } from '../../src/render/traceResources';
import { configureEmitterSampling } from '../../src/render/emitterSampling';

/** Exercise the library's actual random streams and accumulation on the GPU.
 * A constant integrand with a rare event isolates noise from scene detail. */
export async function exerciseTraceSampling() {
  const width = 192,
    height = 128;
  const renderer = new THREE.WebGLRenderer();
  renderer.setSize(width, height);
  const results = [];
  try {
    for (const mode of ['legacy', 'independent', 'production']) {
      const tracer = new WebGLPathTracer(renderer);
      const resources = traceResources(tracer);
      const material = (tracer as unknown as { _pathTracer: { material: THREE.ShaderMaterial } })
        ._pathTracer.material;
      try {
        resources.resize(width, height);
        tracer.tiles.set(1, 1);
        tracer.renderToCanvas = false;
        tracer.renderDelay = 0;
        tracer.bounces = 2;
        if (mode === 'production') configureEmitterSampling(tracer);
        else material.defines.RANDOM_TYPE = mode === 'legacy' ? 2 : 0;
        const start = material.fragmentShader.lastIndexOf('void main() {');
        if (start < 0) throw new Error('Missing sampling shader');
        material.fragmentShader =
          material.fragmentShader.slice(0, start) +
          `
          void main() {
            rng_initialize(gl_FragCoord.xy, seed);
            sobolPixelIndex = (uint(gl_FragCoord.x) << 16) | uint(gl_FragCoord.y);
            sobolPathIndex = uint(seed);
            vec3 r = rand3(3);
            float value = r.x < 0.2 && r.y < 0.5 ? 10.0 : 0.0;
            gl_FragColor = vec4(vec3(value), opacity);
          }`;
        material.needsUpdate = true;
        const checkpoints = [];
        for (const count of [16, 64, 256]) {
          while (tracer.samples < count) {
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
            for (let i = 0; i < 8 && tracer.samples < count; i++) tracer.renderSample();
          }
          const pixels = new Float32Array(width * height * 4);
          renderer.readRenderTargetPixels(tracer.target, 0, 0, width, height, pixels);
          let sum = 0,
            error = 0,
            cross = 0,
            energyA = 0,
            energyB = 0;
          for (let y = 0; y < height; y++)
            for (let x = 0; x < width; x++) {
              const value = pixels[(y * width + x) * 4];
              sum += value;
              error += (value - 1) ** 2;
              if (x < width - 64) {
                const other = pixels[(y * width + x + 64) * 4];
                cross += (value - 1) * (other - 1);
                energyA += (value - 1) ** 2;
                energyB += (other - 1) ** 2;
              }
            }
          checkpoints.push({
            count,
            mean: sum / (width * height),
            rmse: Math.sqrt(error / (width * height)),
            correlation64: cross / Math.sqrt(energyA * energyB),
          });
        }
        results.push({ mode, checkpoints, error: renderer.getContext().getError() });
      } finally {
        resources.dispose();
      }
    }
    return results;
  } finally {
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
