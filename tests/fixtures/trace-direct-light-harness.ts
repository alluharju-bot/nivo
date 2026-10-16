import * as THREE from 'three';
import { WebGLPathTracer } from 'three-gpu-pathtracer';
import { traceResources } from '../../src/render/traceResources';
import { configureEmitterSampling } from '../../src/render/emitterSampling';
import { stableTraceNumerics } from '../../src/render/traceNumerics';
import { stableTraceSamples } from '../../src/render/traceFireflies';
import { splitTraceLobes } from '../../src/render/traceLobes';
import { importanceSampleLights } from '../../src/render/lightImportance';

function directFunction(shader: string) {
  const at = shader.indexOf('vec3 directLightContribution(');
  let end = shader.indexOf('{', at) + 1,
    depth = 1;
  while (depth && end < shader.length) {
    if (shader[end] === '{') depth++;
    if (shader[end] === '}') depth--;
    end++;
  }
  return shader.slice(at, end);
}

/** Compare every linear HDR pixel and all three AOVs to the old, duplicated
 * upstream light evaluation, with identical Sobol paths. No denoising involved. */
export async function compareDirectLighting() {
  const renderer = new THREE.WebGLRenderer();
  renderer.setSize(24, 24);
  const tracer = new WebGLPathTracer(renderer),
    resources = traceResources(tracer);
  tracer.renderToCanvas = false;
  tracer.renderDelay = 0;
  (tracer as unknown as { stableNoise: boolean }).stableNoise = true;
  tracer.bounces = 4;
  tracer.transmissiveBounces = 6;
  tracer.tiles.set(1, 1);
  resources.resize(24, 24);
  const material = (tracer as unknown as { _pathTracer: { material: THREE.ShaderMaterial } })
    ._pathTracer.material;
  const referenceFunction = directFunction(
    splitTraceLobes(
      stableTraceSamples(importanceSampleLights(stableTraceNumerics(material.fragmentShader))),
    ),
  );
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x333333);
  const environment = new THREE.DataTexture(
    new Float32Array([0.8, 0.6, 0.4, 1, 0.4, 0.6, 0.8, 1, 1, 0.5, 0.2, 1, 0.2, 0.5, 1, 1]),
    2,
    2,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  environment.mapping = THREE.EquirectangularReflectionMapping;
  environment.needsUpdate = true;
  scene.environment = environment;
  scene.environmentIntensity = 0.37;
  const finish = new THREE.MeshPhysicalMaterial({
    color: '#c4a386',
    roughness: 0.3,
    side: THREE.DoubleSide,
  });
  const glass = new THREE.MeshPhysicalMaterial({
    color: '#89bbaa',
    transmission: 0.85,
    thickness: 1,
    roughness: 0.1,
    side: THREE.DoubleSide,
  });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), finish);
  const blocker = new THREE.Mesh(new THREE.BoxGeometry(1, 4, 0.5), glass);
  blocker.position.set(-1, 0, 2);
  scene.add(panel, blocker);
  const directional = new THREE.DirectionalLight(0xffffff, 1.2);
  directional.position.set(3, 2, 4);
  const area = new THREE.RectAreaLight(0xffffff, 8, 2, 2);
  area.position.set(-3, 2, 4);
  area.lookAt(0, 0, 0);
  const spot = new THREE.SpotLight(0xffbb77, 20, 0, 0.7, 0.3);
  spot.position.set(0, -2, 4);
  const point = new THREE.PointLight(0x88aaff, 10);
  point.position.set(3, -1, 4);
  const lights = [directional, area, spot, point];
  scene.add(...lights, directional.target, spot.target);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0, 12);
  camera.updateMatrixWorld();
  tracer.setScene(scene, camera);
  configureEmitterSampling(tracer);
  const optimized = material.fragmentShader;
  const baseline = optimized.replace(directFunction(optimized), referenceFunction);
  const results = [];
  try {
    for (const variant of [
      'paint',
      'chrome',
      'coat-sheen-iridescence',
      'environment-only',
      'lights-only',
    ]) {
      finish.metalness = variant === 'chrome' ? 1 : 0;
      finish.clearcoat = variant === 'coat-sheen-iridescence' ? 0.8 : 0;
      finish.sheen = variant === 'coat-sheen-iridescence' ? 0.3 : 0;
      finish.iridescence = variant === 'coat-sheen-iridescence' ? 0.7 : 0;
      scene.environmentIntensity = variant === 'lights-only' ? 0 : 0.37;
      lights.forEach((light) => {
        light.visible = variant !== 'environment-only';
      });
      tracer.updateMaterials();
      tracer.updateLights();
      tracer.updateEnvironment();
      const outputs: { buffers: Float32Array[]; compileMs: number }[] = [];
      for (const shader of [baseline, optimized]) {
        material.fragmentShader = shader;
        material.needsUpdate = true;
        tracer.reset();
        const start = performance.now();
        while (resources.compiling) await new Promise((resolve) => setTimeout(resolve, 5));
        resources.checkCompilation();
        const compileMs = performance.now() - start;
        while (tracer.samples < 16) {
          tracer.renderSample();
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        }
        const buffers = [0, 1, 2].map((attachment) => {
          const pixels = new Float32Array(24 * 24 * 4);
          renderer.readRenderTargetPixels(
            tracer.target,
            0,
            0,
            24,
            24,
            pixels,
            undefined,
            attachment,
          );
          return pixels;
        });
        outputs.push({ buffers, compileMs });
      }
      const errors = outputs[0].buffers.map((expected, index) => {
        let difference = 0,
          energy = 0,
          invalid = 0;
        const actual = outputs[1].buffers[index];
        for (let i = 0; i < expected.length; i++) {
          if (i % 4 === 3) continue;
          difference += (expected[i] - actual[i]) ** 2;
          energy += expected[i] ** 2;
          if (!Number.isFinite(expected[i] + actual[i])) invalid++;
        }
        return { relativeError: Math.sqrt(difference / Math.max(energy, 1e-20)), energy, invalid };
      });
      results.push({
        variant,
        errors,
        compileMs: outputs.map((o) => o.compileMs),
        glError: renderer.getContext().getError(),
      });
    }
    return results;
  } finally {
    resources.dispose();
    panel.geometry.dispose();
    blocker.geometry.dispose();
    finish.dispose();
    glass.dispose();
    environment.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
