import { expect, it } from 'vitest';
import * as THREE from 'three';
import { visibleAxisRange } from './workspaceAxes';

it.each(['perspective', 'orthographic'])(
  'keeps all visible axes inside the camera volume throughout an orbit (%s)',
  (projection) => {
    const camera =
      projection === 'perspective'
        ? new THREE.PerspectiveCamera(40, 1.5, 0.1, 2_000_000)
        : new THREE.OrthographicCamera(-1800, 1800, 1200, -1200, 0.1, 2_000_000);
    camera.up.set(0, 0, 1);
    for (const height of [-450, 1, 450, 5000]) {
      for (let step = 0; step < 72; step++) {
        const angle = (step * Math.PI) / 36;
        camera.position.set(2300 * Math.cos(angle), 2300 * Math.sin(angle), height);
        camera.lookAt(0, 0, 0);
        camera.updateMatrixWorld();
        const frustum = new THREE.Frustum().setFromProjectionMatrix(
          new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
        );
        for (let axis = 0; axis < 3; axis++) {
          const range = visibleAxisRange(frustum, axis)!;
          expect(range).toBeDefined();
          expect(range[0]).toBeLessThan(0);
          expect(range[1]).toBeGreaterThan(0);
          for (const end of range) {
            const projected = new THREE.Vector3().setComponent(axis, end).project(camera);
            expect(Math.abs(projected.x)).toBeLessThanOrEqual(1.000001);
            expect(Math.abs(projected.y)).toBeLessThanOrEqual(1.000001);
            expect(Math.abs(projected.z)).toBeLessThanOrEqual(1.000001);
          }
        }
      }
    }
  },
);

it('omits axes outside a panned view but keeps an axis whose origin is off screen', () => {
  const camera = new THREE.OrthographicCamera(-200, 200, 200, -200, 0.1, 2000);
  camera.position.set(1000, 0, 1000);
  camera.lookAt(1000, 0, 0);
  camera.updateMatrixWorld();
  const frustum = new THREE.Frustum().setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
  );
  expect(visibleAxisRange(frustum, 0)![0]).toBeCloseTo(800, 2);
  expect(visibleAxisRange(frustum, 0)![1]).toBeCloseTo(1200, 2);
  expect(visibleAxisRange(frustum, 1)).toBeUndefined();
  expect(visibleAxisRange(frustum, 2)).toBeUndefined();
});
