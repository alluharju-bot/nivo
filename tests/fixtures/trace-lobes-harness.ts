import * as THREE from 'three';
import { WebGLPathTracer } from 'three-gpu-pathtracer';
import { traceResources } from '../../src/render/traceResources';
import { configureEmitterSampling } from '../../src/render/emitterSampling';
import { traceLighting } from '../../src/render/traceLighting';
import { traceGuides } from '../../src/render/traceGuides';
import { reflectionGuides } from '../../src/render/reflectionGuides';

/** Cancel during shader compilation, then reuse the same GPU context. */
export async function cancelCompilation() {
  const renderer = new THREE.WebGLRenderer(),
    counts: number[] = [],
    errors: number[] = [];
  renderer.setSize(16, 16);
  try {
    for (let i = 0; i < 3; i++) {
      const tracer = new WebGLPathTracer(renderer),
        resources = traceResources(tracer);
      configureEmitterSampling(tracer);
      const pending = (
        tracer as unknown as {
          _pathTracer: { _compilePromise: Promise<unknown> | null };
        }
      )._pathTracer._compilePromise;
      resources.dispose();
      resources.dispose();
      await pending;
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      errors.push(renderer.getContext().getError());
      counts.push(renderer.info.memory.textures);
    }
    return { counts, errors };
  } finally {
    renderer.dispose();
    renderer.forceContextLoss();
  }
}

export async function exerciseLobes() {
  const renderer = new THREE.WebGLRenderer();
  renderer.setSize(64, 64);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  const tracer = new WebGLPathTracer(renderer),
    resources = traceResources(tracer);
  tracer.renderToCanvas = false;
  tracer.renderDelay = 0;
  tracer.bounces = 4;
  tracer.tiles.set(1, 1);
  resources.resize(64, 64);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);
  scene.environment = new THREE.DataTexture(
    new Float32Array(16).fill(1),
    2,
    2,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  scene.environment.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment.needsUpdate = true;
  const m = new THREE.MeshPhysicalMaterial({
    color: '#bb8877',
    roughness: 0.24,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), m);
  scene.add(mesh);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 2000);
  camera.position.z = 100;
  camera.updateMatrixWorld();
  const lighting = traceLighting(),
    guides = traceGuides(),
    reflected = reflectionGuides();
  const output = new THREE.WebGLRenderTarget(64, 64, { type: THREE.FloatType, depthBuffer: false });
  const results = [];
  try {
    tracer.setScene(scene, camera);
    configureEmitterSampling(tracer);
    for (const [metal, alpha, backgroundImage] of [
      [false, false, false],
      [true, false, false],
      [false, true, false],
      [false, false, true],
    ]) {
      m.metalness = metal ? 1 : 0;
      m.roughness = metal ? 0.06 : 0.24;
      if (backgroundImage) {
        scene.background = scene.environment;
        tracer.updateEnvironment();
      }
      tracer.updateMaterials();
      tracer.reset();
      (
        tracer as unknown as { _pathTracer: { material: THREE.ShaderMaterial } }
      )._pathTracer.material.uniforms.backgroundAlpha.value = alpha ? 0.5 : 1;
      lighting.clear();
      guides.clear();
      reflected.clear();
      while (tracer.samples < 32) {
        for (let i = 0; i < 4; i++) {
          tracer.renderSample();
          lighting.observe(renderer, tracer.target, tracer.samples);
        }
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
      const beauty = new Float32Array(64 * 64 * 4),
        diffuse = beauty.slice(),
        filtered = beauty.slice();
      renderer.readRenderTargetPixels(tracer.target, 0, 0, 64, 64, beauty);
      renderer.readRenderTargetPixels(tracer.target, 0, 0, 64, 64, diffuse, undefined, 1);
      const guide = guides.ensure(renderer, scene, camera, 64, 64);
      guide.reflection = reflected.ensure(renderer, tracer, 64, 64);
      lighting.draw(renderer, tracer.target, 32, guide, output);
      renderer.readRenderTargetPixels(output, 0, 0, 64, 64, filtered);
      let energy = 0,
        d = 0,
        f = 0,
        invalid = 0,
        alphaError = 0;
      for (let i = 0; i < beauty.length; i++) {
        if (i % 4 === 3) {
          alphaError = Math.max(alphaError, Math.abs(beauty[i] - diffuse[i]));
          continue;
        }
        energy += beauty[i];
        d += diffuse[i];
        f += filtered[i];
        if (
          !Number.isFinite(beauty[i] + diffuse[i] + filtered[i]) ||
          diffuse[i] < -1e-6 ||
          diffuse[i] > beauty[i] + 1e-5
        )
          invalid++;
      }
      const internal = (
        tracer as unknown as {
          _pathTracer: { alpha: boolean; _blendTargets: THREE.WebGLRenderTarget[] };
        }
      )._pathTracer;
      results.push({
        metal,
        alpha,
        backgroundImage: !!backgroundImage,
        fallback: internal.alpha,
        blendWidth: internal._blendTargets[0].width,
        energy: energy / (64 * 64 * 3),
        diffuse: d / energy,
        filtered: f / energy,
        invalid,
        alphaError,
        error: renderer.getContext().getError(),
      });
    }
  } finally {
    resources.dispose();
    lighting.dispose();
    guides.dispose();
    reflected.dispose();
    output.dispose();
    m.dispose();
    mesh.geometry.dispose();
    scene.environment.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
  return results;
}
