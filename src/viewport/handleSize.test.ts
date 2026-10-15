import { expect, it } from 'vitest';
import { PerspectiveCamera, OrthographicCamera } from 'three';
import { viewHandleRadius } from './handleSize';

it('limits rotation rings to 52–130 screen pixels independently of zoom and part size', () => {
  const camera = new PerspectiveCamera(50, 1.5, 0.01, 1e8);
  for (const distance of [1, 20, 1000, 50000])
    for (const part of [0.1, 40, 100000]) {
      camera.position.set(0, 0, distance);
      camera.updateMatrixWorld();
      const radius = viewHandleRadius(camera, [0, 0, 0], 800, part);
      const pixels = radius / ((2 * distance * Math.tan((25 * Math.PI) / 180)) / 800);
      expect(pixels).toBeGreaterThanOrEqual(52 - 1e-8);
      expect(pixels).toBeLessThanOrEqual(130 + 1e-8);
    }
});
it('adapts orthographic and small viewports without changing the rotation pivot', () => {
  const camera = new OrthographicCamera(-300, 300, 200, -200, 0.1, 10000);
  camera.zoom = 4;
  camera.updateProjectionMatrix();
  const r = viewHandleRadius(camera, [0, 0, 0], 240, 50000);
  expect(r / (100 / 240)).toBeCloseTo(52.8, 8);
  expect(viewHandleRadius(camera, [999, 500, 30], 240, 50000)).toBe(r);
});
