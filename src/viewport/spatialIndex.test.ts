import { expect, it } from 'vitest';
import * as THREE from 'three';
import { makeBody } from '../model/project';
import { BodySpatialIndex, intersectModel } from './spatialIndex';

it.each([false, true])(
  'picks coplanar sketches consistently with reversed insertion = %s',
  (reverse) => {
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const solid = new THREE.Mesh(new THREE.BoxGeometry(600, 400, 18.125), material);
    solid.position.z = -18.125 / 2;
    const sketch = new THREE.Mesh(new THREE.PlaneGeometry(200, 150), material);
    const newest = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), material);
    sketch.userData.surfacePriority = 1;
    newest.userData.surfacePriority = 2;
    const group = new THREE.Group();
    const objects = [solid, sketch, newest];
    group.add(...(reverse ? objects.reverse() : objects));
    group.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(new THREE.Vector3(20, 10, 100), new THREE.Vector3(0, 0, -1));
    expect(intersectModel(ray, group)[0].object).toBe(newest);
    newest.visible = false;
    expect(intersectModel(ray, group)[0].object).toBe(sketch);
    const foreground = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), material);
    foreground.position.z = 0.001;
    group.add(foreground);
    group.updateMatrixWorld(true);
    expect(intersectModel(ray, group)[0].object).toBe(foreground);
    group.userData.acceptPoint = (p: THREE.Vector3) => p.z < 0.0001;
    expect(intersectModel(ray, group)[0].object).toBe(sketch);
    group.children.forEach((object) => (object as THREE.Mesh).geometry.dispose());
    material.dispose();
  },
);

it('reduces a 10000-part scene to nearby candidates without changing the exact ray result', () => {
  const parts = Array.from({ length: 10000 }, (_, i) =>
    makeBody(80, 80, 18, [(i % 100) * 100, Math.floor(i / 100) * 100, 0]),
  );
  const index = new BodySpatialIndex(parts);
  const ray = new THREE.Ray(new THREE.Vector3(5050, 4050, 1000), new THREE.Vector3(0, 0, -1));
  expect(index.ray(ray)).toEqual([parts[4050].id]);
  const camera = new THREE.OrthographicCamera(-5000, 5000, 5000, -5000, 0.1, 20000);
  camera.position.set(5000, 5000, 10000);
  camera.lookAt(5000, 5000, 0);
  camera.updateMatrixWorld();
  const point = new THREE.Vector3(5050, 4050, 18).project(camera);
  expect(index.screen(camera, point.x, point.y, 0.002, 0.002)).toEqual([parts[4050].id]);
  expect(
    index.ray(new THREE.Ray(new THREE.Vector3(-500, -500, 1000), new THREE.Vector3(0, 0, -1))),
  ).toEqual([]);
});

it.each(['perspective', 'orthographic'])(
  'screen broad phase includes near-edge anchors in %s',
  (kind) => {
    const part = makeBody(600, 400, 18, [900, 1300, 50]);
    const camera =
      kind === 'perspective'
        ? new THREE.PerspectiveCamera(40, 1.5, 0.1, 100000)
        : new THREE.OrthographicCamera(-1000, 1000, 800, -800, 0.1, 100000);
    camera.up.set(0, 0, 1);
    camera.position.set(2600, -2000, 1800);
    camera.lookAt(1200, 1500, 50);
    camera.updateMatrixWorld();
    const index = new BodySpatialIndex([part]);
    for (const x of [900, 1500])
      for (const y of [1300, 1700])
        for (const z of [50, 68]) {
          const p = new THREE.Vector3(x, y, z).project(camera);
          expect(index.screen(camera, p.x + 0.005, p.y - 0.005, 0.01, 0.01)).toContain(part.id);
        }
  },
);
