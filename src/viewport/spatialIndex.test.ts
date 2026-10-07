import { expect, it } from 'vitest';
import * as THREE from 'three';
import { makeBody } from '../model/project';
import { BodySpatialIndex, intersectModel } from './spatialIndex';

it('a ghost keeps exact reference hits while selection and occlusion pass through it', () => {
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const ghost = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), material);
  const behind = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), material);
  ghost.userData.modelDisplay = 'ghost';
  ghost.position.z = 20;
  const group = new THREE.Group();
  group.add(ghost, behind);
  group.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(5, 5, 100), new THREE.Vector3(0, 0, -1));
  expect(intersectModel(ray, group, 'selection')[0].object).toBe(behind);
  expect(intersectModel(ray, group, 'reference')[0].point.z).toBe(20);
  expect(intersectModel(ray, group, 'occlusion')[0].object).toBe(behind);
  ghost.userData.modelDisplay = 'solid';
  expect(intersectModel(ray, group, 'selection')[0].object).toBe(ghost);
  ghost.geometry.dispose();
  behind.geometry.dispose();
  material.dispose();
});

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

it.each(['circle', 'pen'])(
  'uses the exact support plane when Float32 %s triangles differ in depth',
  (kind) => {
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const solid = new THREE.Mesh(new THREE.PlaneGeometry(600, 400), material);
    const sketch = new THREE.Mesh(
      kind === 'circle'
        ? new THREE.CircleGeometry(80, 48)
        : new THREE.BufferGeometry().setAttribute(
            'position',
            new THREE.Float32BufferAttribute([-80, -70, 0, 90, -60, 0, 0, 100, 0], 3),
          ),
      material,
    );
    // These model Float32 rounding differences at building-scale coordinates.
    solid.position.set(12000, 23000, 8000.0002);
    sketch.position.set(12000, 23000, 7999.9998);
    for (const mesh of [solid, sketch])
      mesh.userData.faces = [
        {
          planar: true,
          normal: [0, 0, 1],
          center: [12000, 23000, 8000],
          start: 0,
          count: 10000,
        },
      ];
    sketch.userData.surfacePriority = 2;
    const group = new THREE.Group();
    group.add(solid, sketch);
    group.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(
      new THREE.Vector3(12001, 23001, 9000),
      new THREE.Vector3(0, 0, -1),
    );
    expect(intersectModel(ray, group)[0].object).toBe(sketch);
    const foreground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), material);
    foreground.position.set(12000, 23000, 8000.001);
    group.add(foreground);
    group.updateMatrixWorld(true);
    expect(intersectModel(ray, group)[0].object).toBe(foreground);
    group.children.forEach((m) => (m as THREE.Mesh).geometry.dispose());
    material.dispose();
  },
);

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
