import { expect, it } from 'vitest';
import * as THREE from 'three';
import { createPartLights, emitterFrame, omitPreviewLights } from './lights';
import { captureRenderScene } from './snapshot';
import { defaultAppearance } from '../model/materials';
import { makeBody } from '../model/project';
import { textureFrameMatrix } from './materials';

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
