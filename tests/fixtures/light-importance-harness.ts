import * as THREE from 'three';
import { WebGLPathTracer } from 'three-gpu-pathtracer';
import { configureEmitterSampling } from '../../src/render/emitterSampling';
import { traceResources } from '../../src/render/traceResources';

export async function exerciseLightImportance(spots = false) {
  const renderer = new THREE.WebGLRenderer();
  renderer.setSize(32, 32);
  const scene = new THREE.Scene();
  scene.environmentIntensity = 0;
  scene.background = new THREE.Color(0);
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(4, 4),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }),
  );
  scene.add(plane);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  for (let i = 0; i < 12; i++) {
    const light =
      spots && i
        ? new THREE.SpotLight(0xffffff, 500, 0, Math.PI / 9, 0.35, 2)
        : new THREE.RectAreaLight(0xffffff, 20, 0.2, 1.5);
    light.position.set(i ? i : 0, 0, 2);
    if (light instanceof THREE.SpotLight) {
      light.target.position.set(i, 0, 5); // Points away from the visible surface.
      scene.add(light.target);
    } else if (i) light.rotation.y = Math.PI;
    scene.add(light);
  }
  const run = async (importance: boolean, samples: number) => {
    const tracer = new WebGLPathTracer(renderer),
      resources = traceResources(tracer);
    try {
      resources.resize(32, 32);
      tracer.tiles.set(1, 1);
      tracer.renderToCanvas = false;
      tracer.renderDelay = 0;
      tracer.minSamples = 1;
      tracer.bounces = 2;
      tracer.textureSize.set(1, 1);
      resources.prepareScene();
      tracer.setScene(scene, camera);
      configureEmitterSampling(tracer, importance);
      while (tracer.samples < samples) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        for (let i = 0; i < 8 && tracer.samples < samples; i++) tracer.renderSample();
      }
      const data = new Float32Array(32 * 32 * 4);
      renderer.readRenderTargetPixels(tracer.target, 0, 0, 32, 32, data);
      return Array.from(data).filter((_, i) => i % 4 === 0);
    } finally {
      resources.dispose();
    }
  };
  try {
    const uniform = await run(false, 64),
      weighted = await run(true, 64),
      reference = await run(true, 1024);
    const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
    const error = (a: number[]) =>
      Math.sqrt(a.reduce((s, x, i) => s + (x - reference[i]) ** 2, 0) / a.length);
    return {
      uniform: error(uniform),
      weighted: error(weighted),
      uniformMean: mean(uniform),
      weightedMean: mean(weighted),
      referenceMean: mean(reference),
      error: renderer.getContext().getError(),
    };
  } finally {
    plane.geometry.dispose();
    plane.material.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
