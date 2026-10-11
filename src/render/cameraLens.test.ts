import { expect, it } from 'vitest';
import { PerspectiveCamera } from 'three';
import { setCameraLens } from './cameraLens';
import { captureRenderScene } from './snapshot';
import { Scene } from 'three';

it('changes the physical field of view without moving the camera and exports the same lens', () => {
  const camera = new PerspectiveCamera(38, 1.5);
  camera.position.set(20, -100, 60);
  camera.lookAt(0, 0, 10);
  const q = camera.quaternion.clone();
  setCameraLens(camera, 50);
  expect(camera.getFocalLength()).toBeCloseTo(50);
  expect(camera.fov).toBeCloseTo((2 * Math.atan(24 / 100) * 180) / Math.PI);
  const narrow = camera.fov;
  setCameraLens(camera, 24);
  expect(camera.fov).toBeGreaterThan(narrow);
  expect(camera.position.toArray()).toEqual([20, -100, 60]);
  expect(camera.quaternion.equals(q)).toBe(true);
  const snapshot = captureRenderScene(new Scene(), camera, camera.aspect, 1);
  expect((snapshot.camera as PerspectiveCamera).getFocalLength()).toBeCloseTo(24);
  camera.aspect = 2;
  setCameraLens(camera, 24);
  expect(camera.getFocalLength()).toBeCloseTo(24);
});
