import { expect, it } from 'vitest';
import { PerspectiveCamera } from 'three';
import { compatibleHistoryCamera } from './temporalDiffuse';

it('allows normal camera travel and a small zoom', () => {
  const camera = new PerspectiveCamera(50, 16 / 9, 1, 20000);
  camera.position.set(300, 200, 1600);
  camera.updateMatrixWorld(true);
  const world = camera.matrixWorld.clone(),
    projection = camera.projectionMatrix.clone();
  expect(compatibleHistoryCamera(world, projection, camera)).toBe(true);
  camera.position.x += 40;
  camera.rotation.y = 0.02;
  camera.fov = 49;
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  expect(compatibleHistoryCamera(world, projection, camera)).toBe(true);
});
it('rejects cuts in position, view direction and lens', () => {
  const camera = new PerspectiveCamera(50, 16 / 9, 1, 20000);
  camera.updateMatrixWorld(true);
  const world = camera.matrixWorld.clone(),
    projection = camera.projectionMatrix.clone();
  camera.position.x = 501;
  camera.updateMatrixWorld(true);
  expect(compatibleHistoryCamera(world, projection, camera)).toBe(false);
  camera.position.x = 0;
  camera.rotation.y = Math.PI / 3;
  camera.updateMatrixWorld(true);
  expect(compatibleHistoryCamera(world, projection, camera)).toBe(false);
  camera.rotation.y = 0;
  camera.updateMatrixWorld(true);
  camera.fov = 25;
  camera.updateProjectionMatrix();
  expect(compatibleHistoryCamera(world, projection, camera)).toBe(false);
});
