import { expect, it } from 'vitest';
import { OrthographicCamera, PerspectiveCamera, Ray, Vector3 } from 'three';
import { cameraSnapPenalty, cylinderHit, projectedSegmentPoint } from './picking';

it('picks a long foreshortened edge at the actual screen location even when its near end is behind the camera', () => {
  const camera = new PerspectiveCamera(50, 1, 0.1, 10000);
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  for (const a of [
    [-2, 0, 4],
    [-2, 0, 7],
  ] as [number, number, number][]) {
    const b: [number, number, number] = [20, 0, -100];
    const point = new Vector3(...a).lerp(new Vector3(...b), 0.14);
    const p = point.clone().project(camera);
    const picked = projectedSegmentPoint(
      a,
      b,
      camera,
      1000,
      1000,
      (p.x + 1) * 500,
      (1 - p.y) * 500,
    )!;
    expect(picked.distance).toBeLessThan(1e-6);
    expect(new Vector3(...picked.point).distanceTo(point)).toBeLessThan(1e-6);
  }
});
it('rejects edges fully behind the near plane and still handles orthographic zoom', () => {
  const camera = new OrthographicCamera(-2, 2, 2, -2, 0.1, 100);
  camera.position.z = 5;
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  expect(projectedSegmentPoint([0, 0, 6], [1, 0, 6], camera, 1000, 1000, 500, 500)).toBeUndefined();
  expect(
    projectedSegmentPoint([-100, 0, 0], [100, 0, 0], camera, 1000, 1000, 750, 500)?.point[0],
  ).toBeCloseTo(1);
});
it('prefers nearer anchors gently without overcoming a precisely aimed rear point', () => {
  const camera = new PerspectiveCamera();
  camera.position.set(0, 0, 100);
  const near: [number, number, number] = [0, 0, 30],
    far: [number, number, number] = [0, 0, 0];
  const penalty = cameraSnapPenalty([{ point: near }, { point: far }], camera);
  expect(penalty(near)).toBe(0);
  expect(penalty(far)).toBe(2);
  expect(4 + penalty(near)).toBeGreaterThan(penalty(far));
});
it('places the tangent on the exact bucket cylinder rather than its display triangles', () => {
  const ray = new Ray(new Vector3(25, -300, 120), new Vector3(0, 1, 0));
  const hit = cylinderHit(
    ray,
    { origin: [0, 0, 0], axis: [0, 0, 1], radius: 100, sign: 1 },
    new Vector3(25, -96, 120),
  )!;
  expect(Math.hypot(hit.point[0], hit.point[1])).toBeCloseTo(100, 8);
  expect(hit.point[2]).toBe(120);
  expect(hit.normal[0]).toBeCloseTo(0.25, 8);
  expect(hit.normal[1]).toBeLessThan(0);
  expect(
    cylinderHit(
      new Ray(new Vector3(200, -300, 120), new Vector3(0, 1, 0)),
      { origin: [0, 0, 0], axis: [0, 0, 1], radius: 100, sign: 1 },
      new Vector3(),
    ),
  ).toBeUndefined();
});
