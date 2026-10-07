import { expect, it } from 'vitest';
import * as THREE from 'three';
import { createPartLights, createTraceLights, emitterFrame, omitPreviewLights } from './lights';
import { captureRenderScene } from './snapshot';
import { defaultAppearance } from '../model/materials';
import { makeBody } from '../model/project';
import { textureFrameMatrix } from './materials';

it('excludes switched-off studio panels from the trace light sampling budget', () => {
  const scene = new THREE.Scene(),
    panels = new THREE.Group();
  panels.visible = false;
  panels.userData.traceOnly = true;
  panels.add(new THREE.RectAreaLight('white', 0), new THREE.RectAreaLight('white', 5));
  scene.add(panels);
  const snapshot = scene.clone();
  omitPreviewLights(snapshot);
  expect(snapshot.children[0].visible).toBe(true);
  expect(snapshot.children[0].children).toHaveLength(1);
  expect((snapshot.children[0].children[0] as THREE.Light).intensity).toBe(5);
  expect(panels.children).toHaveLength(2);
});

it('samples rotated rectangular emitters only in tracing and does not bridge a curved outline', () => {
  const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.5, 0.7, 0.9));
  const body = {
    ...makeBody(800, 20, 5, [10000, 30000, 2000]),
    appearance: defaultAppearance('led-warm'),
    textureFrame: { offset: [0, 0, 0] as [number, number, number], rotation: rotation.toArray() },
  };
  const geometry = new THREE.BoxGeometry(800, 20, 5)
    .translate(400, 10, 2.5)
    .applyMatrix4(textureFrameMatrix(body));
  const lights = createTraceLights(body, geometry);
  expect(lights.visible).toBe(false);
  expect(lights.children).toHaveLength(2);
  const scene = new THREE.Scene();
  scene.add(lights);
  const clone = scene.clone();
  omitPreviewLights(clone);
  expect(clone.children[0].visible).toBe(true);
  expect(lights.visible).toBe(false);
  for (const child of lights.children) {
    const light = child as THREE.RectAreaLight;
    expect(light.width).toBeCloseTo(800, 2);
    expect(light.height).toBeCloseTo(20, 2);
    expect(light.intensity).toBe(8);
  }
  const curved = new THREE.CylinderGeometry(10, 10, 200, 32);
  expect(createTraceLights(body, curved).children).toHaveLength(0);
  geometry.dispose();
  curved.dispose();
});

it('places a rotated spotlight on its actual local emitting face', () => {
  const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.6, 0.4, 0.8));
  const body = {
    ...makeBody(600, 40, 10, [900, -300, 700]),
    textureFrame: { offset: [0, 0, 0] as [number, number, number], rotation: rotation.toArray() },
  };
  const geometry = new THREE.BoxGeometry(600, 40, 10)
    .translate(300, 20, 5)
    .applyMatrix4(textureFrameMatrix(body));
  for (const sign of [-1, 1]) {
    const frame = emitterFrame(body, geometry, 2, sign);
    const local = frame.position
      .clone()
      .addScaledVector(frame.direction, -0.1)
      .applyMatrix4(textureFrameMatrix(body).invert());
    expect(local.x).toBeCloseTo(300, 3);
    expect(local.y).toBeCloseTo(20, 3);
    expect(local.z).toBeCloseTo(sign > 0 ? 10 : 0, 3);
    expect(frame.width).toBeCloseTo(600, 3);
    expect(frame.height).toBeCloseTo(40, 3);
    const normal = new THREE.Vector3(0, 0, -1).applyQuaternion(frame.rotation);
    expect(normal.distanceTo(frame.direction)).toBeLessThan(1e-6);
  }
  geometry.dispose();
});
it('uses shadowed surface proxies only for preview, retaining real emitters and spotlights in snapshots', () => {
  const scene = new THREE.Scene(),
    geometry = new THREE.BoxGeometry(300, 20, 5);
  const body = { ...makeBody(), appearance: defaultAppearance('led-warm') };
  const area = createPartLights(body, geometry);
  const spotBody = {
    ...body,
    appearance: {
      ...body.appearance,
      emission: {
        enabled: true,
        color: '#ffffff',
        intensity: 8,
        direction: '-z' as const,
        angle: 36,
        type: 'spot' as const,
      },
    },
  };
  const spot = createPartLights(spotBody, geometry);
  const deferredSpot = createPartLights(spotBody, geometry);
  deferredSpot.visible = false;
  deferredSpot.userData.traceOnly = true;
  scene.add(
    area,
    spot,
    deferredSpot,
    new THREE.Mesh(
      geometry,
      new THREE.MeshPhysicalMaterial({ emissive: 'white', emissiveIntensity: 8 }),
    ),
  );
  const proxies = area.children.filter((light) => light instanceof THREE.SpotLight);
  expect(proxies).toHaveLength(4);
  expect(proxies.every((light) => light.castShadow)).toBe(true);
  const snapshot = captureRenderScene(scene, new THREE.PerspectiveCamera(), 1, 1);
  expect(snapshot.scene.children).toHaveLength(3);
  expect(scene.children).toHaveLength(4);
  expect(snapshot.scene.children[1].visible).toBe(true);
  expect(deferredSpot.visible).toBe(false);
  expect(snapshot.scene.children[0].children[0]).toBeInstanceOf(THREE.SpotLight);
  const previewCopy = scene.clone();
  omitPreviewLights(previewCopy);
  expect(previewCopy.children).toHaveLength(3);
  snapshot.dispose();
  geometry.dispose();
});
it('turning a light off or setting zero power removes its preview emitters', () => {
  const body = {
    ...makeBody(),
    appearance: {
      ...defaultAppearance('led-warm'),
      emission: {
        enabled: false,
        color: '#ffffff',
        intensity: 8,
        direction: '-z' as const,
        angle: 36,
        type: 'spot' as const,
      },
    },
  };
  const geometry = new THREE.BoxGeometry();
  expect(createPartLights(body, geometry).children).toHaveLength(0);
  body.appearance.emission.enabled = true;
  body.appearance.emission.intensity = 0;
  expect(createPartLights(body, geometry).children).toHaveLength(0);
  geometry.dispose();
});

it('does not create invalid infinite light positions for a wire without renderable faces', () => {
  const body = { ...makeBody(), appearance: defaultAppearance('led-warm') };
  const geometry = new THREE.BufferGeometry();
  expect(createPartLights(body, geometry).children).toHaveLength(0);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
  expect(createPartLights(body, geometry).children).toHaveLength(0);
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 1, 1, 0], 3),
  );
  geometry.setIndex([]);
  expect(createPartLights(body, geometry).children).toHaveLength(0);
});
