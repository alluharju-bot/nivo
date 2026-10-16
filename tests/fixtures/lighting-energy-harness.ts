import * as THREE from 'three';
import { WebGLPathTracer } from 'three-gpu-pathtracer';
import { configureEmitterSampling } from '../../src/render/emitterSampling';
import { traceResources } from '../../src/render/traceResources';

/** Enclosed diffuse room, millimetres, no studio/environment illumination.
 * The upper back wall is outside the spotlight cone and must be lit by bounces.
 * Compare linear radiance before exposure, tone mapping or denoising. */
export async function exerciseLightingEnergy() {
  const size = 48,
    renderer = new THREE.WebGLRenderer();
  renderer.setSize(size, size);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0);
  scene.environmentIntensity = 0;
  const material = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color().setRGB(0.65, 0.65, 0.65),
    roughness: 1,
    metalness: 0,
    specularIntensity: 0,
    side: THREE.FrontSide,
  });
  const geometry = new THREE.BoxGeometry(2400, 2400, 2400).toNonIndexed();
  const positions = geometry.getAttribute('position'),
    normals = geometry.getAttribute('normal');
  const a = new THREE.Vector3(),
    b = new THREE.Vector3();
  for (let i = 0; i < positions.count; i += 3) {
    a.fromBufferAttribute(positions, i);
    b.fromBufferAttribute(positions, i + 2);
    positions.setXYZ(i, b.x, b.y, b.z);
    positions.setXYZ(i + 2, a.x, a.y, a.z);
  }
  for (let i = 0; i < normals.count; i++)
    normals.setXYZ(i, -normals.getX(i), -normals.getY(i), -normals.getZ(i));
  const room = new THREE.Mesh(geometry, material);
  room.position.z = 1200;
  scene.add(room);
  const camera = new THREE.PerspectiveCamera(65, 1, 1, 10000);
  camera.up.set(0, 0, 1);
  camera.position.set(0, -1150, 1400);
  camera.lookAt(0, 700, 1100);
  camera.updateMatrixWorld(true);
  const spot = new THREE.SpotLight(0xffffff, 12e6, 0, Math.PI / 10, 0.35, 2);
  spot.position.set(0, 0, 2300);
  spot.target.position.set(0, 0, 0);
  scene.add(spot, spot.target);
  const run = async (
    name: string,
    intensity: number,
    bounces: number,
    unclamped: boolean,
    importance = true,
  ) => {
    spot.intensity = intensity * 1e6;
    const tracer = new WebGLPathTracer(renderer),
      resources = traceResources(tracer);
    try {
      resources.resize(size, size);
      tracer.tiles.set(1, 1);
      tracer.renderToCanvas = false;
      tracer.renderDelay = 0;
      tracer.bounces = bounces;
      tracer.filterGlossyFactor = 0;
      resources.prepareScene();
      tracer.setScene(scene, camera);
      configureEmitterSampling(tracer, importance);
      const m = (tracer as unknown as { _pathTracer: { material: THREE.ShaderMaterial } })
        ._pathTracer.material;
      if (unclamped) {
        m.fragmentShader = m.fragmentShader
          .replace(/return indirect \* min\([^;]+;/, 'return indirect;')
          .replace(/float lobeClamp = min\([^;]+;/, 'float lobeClamp = 1.0;');
        m.needsUpdate = true;
      }
      while (tracer.samples < 512) {
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
        for (let i = 0; i < 32 && tracer.samples < 512; i++) tracer.renderSample();
      }
      const data = new Float32Array(size * size * 4);
      renderer.readRenderTargetPixels(tracer.target, 0, 0, size, size, data);
      let wall = 0,
        count = 0,
        total = 0;
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
          const value = data[(y * size + x) * 4];
          total += value;
          if (x >= 12 && x < 36 && y >= 24 && y < 40) {
            wall += value;
            count++;
          }
        }
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d')!,
        img = ctx.createImageData(size, size);
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
          for (let c = 0; c < 3; c++)
            img.data[((size - y - 1) * size + x) * 4 + c] = Math.min(
              255,
              Math.pow(data[(y * size + x) * 4 + c], 1 / 2.2) * 255,
            );
          img.data[((size - y - 1) * size + x) * 4 + 3] = 255;
        }
      ctx.putImageData(img, 0, 0);
      return {
        name,
        image: canvas.toDataURL(),
        wall: wall / count,
        mean: total / (size * size),
        error: renderer.getContext().getError(),
      };
    } finally {
      resources.dispose();
    }
  };
  try {
    const result = [];
    for (const [name, intensity, bounces, unclamped, importance] of [
      ['direct', 12, 1, false, true],
      ['production', 12, 16, false, true],
      ['unclamped', 12, 16, true, true],
      ['double', 24, 16, true, true],
      ['bright-production', 100, 16, false, true],
      ['bright-unclamped', 100, 16, true, true],
    ] as const)
      result.push(await run(name, intensity, bounces, unclamped, importance));
    return result;
  } finally {
    room.geometry.dispose();
    material.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
