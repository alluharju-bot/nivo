import * as THREE from 'three';
import { WebGLPathTracer } from 'three-gpu-pathtracer';
import { configureEmitterSampling } from '../../src/render/emitterSampling';
import { traceResources } from '../../src/render/traceResources';
import { createTraceLights } from '../../src/render/lights';
import { makeBody } from '../../src/model/project';
import { defaultAppearance } from '../../src/model/materials';

export async function exerciseCircularEmitter() {
  const size = 32;
  const renderer = new THREE.WebGLRenderer();
  renderer.setSize(size, size);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0);
  scene.environmentIntensity = 0;
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(1200, 1200),
    new THREE.MeshPhysicalMaterial({ color: 'white', roughness: 0, specularIntensity: 0 }),
  );
  const emitter = new THREE.Mesh(
    new THREE.CircleGeometry(40, 124).translate(0, 0, 500),
    new THREE.MeshStandardMaterial({
      color: 'black',
      emissive: 'white',
      emissiveIntensity: 1,
      side: THREE.DoubleSide,
    }),
  );
  // Keep sample energy below the production indirect clamp: that deliberately
  // biases rare BSDF-only hits and is not a valid reference for emitter area.
  const source = {
    ...makeBody(80, 80, 0),
    appearance: {
      ...defaultAppearance('led-neutral'),
      emission: {
        enabled: true,
        type: 'surface' as const,
        color: '#ffffff',
        intensity: 1,
        angle: 36,
        direction: '-z' as const,
      },
    },
  };
  const lights = createTraceLights(source, emitter.geometry).clone();
  scene.add(plane, emitter, lights);
  const camera = new THREE.OrthographicCamera(-200, 200, 200, -200, 1, 3000);
  camera.position.set(0, 0, 400); // Below the emitter, looking at the receiving plane.
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const run = async (sampled: boolean, count: number, independent = false) => {
    const tracer = new WebGLPathTracer(renderer),
      resources = traceResources(tracer);
    try {
      lights.visible = sampled;
      resources.resize(size, size);
      tracer.tiles.set(1, 1);
      tracer.renderToCanvas = false;
      tracer.renderDelay = 0;
      tracer.bounces = 2;
      tracer.textureSize.set(1, 1);
      resources.prepareScene();
      tracer.setScene(scene, camera);
      configureEmitterSampling(tracer);
      if (independent) {
        const material = (tracer as unknown as { _pathTracer: { material: THREE.ShaderMaterial } })
          ._pathTracer.material;
        material.defines.RANDOM_TYPE = 0;
        material.needsUpdate = true;
      }
      while (tracer.samples < count) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        for (let i = 0; i < 8 && tracer.samples < count; i++) tracer.renderSample();
      }
      const pixels = new Float32Array(size * size * 4);
      renderer.readRenderTargetPixels(tracer.target, 0, 0, size, size, pixels);
      return Array.from(pixels).filter((_, i) => i % 4 === 0);
    } finally {
      resources.dispose();
    }
  };
  try {
    const unsampled = await run(false, 64),
      sampled = await run(true, 64),
      reference = await run(true, 1024),
      unsampledReference = await run(false, 4096),
      independentReference = await run(false, 4096, true);
    const mean = (v: number[]) => v.reduce((sum, x) => sum + x, 0) / v.length;
    const error = (v: number[]) =>
      Math.sqrt(v.reduce((sum, x, i) => sum + (x - reference[i]) ** 2, 0) / v.length);
    return {
      lights: lights.children.length,
      unsampled: error(unsampled),
      sampled: error(sampled),
      unsampledMean: mean(unsampled),
      sampledMean: mean(sampled),
      referenceMean: mean(reference),
      unsampledReferenceMean: mean(unsampledReference),
      independentMean: mean(independentReference),
      error: renderer.getContext().getError(),
    };
  } finally {
    plane.geometry.dispose();
    plane.material.dispose();
    emitter.geometry.dispose();
    emitter.material.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
