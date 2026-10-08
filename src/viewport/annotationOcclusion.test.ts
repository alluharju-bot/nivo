import { expect, it } from 'vitest';
import * as THREE from 'three';
import { createAnnotationOcclusion } from './annotationOcclusion';
import { BodySpatialIndex, intersectModel } from './spatialIndex';
import { makeBody } from '../model/project';

const material = () => new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
const nativeOcclusion = (ray: THREE.Ray, group: THREE.Group, distance: number) => {
  const caster = new THREE.Raycaster(ray.origin, ray.direction);
  const hit = intersectModel(caster, group, 'occlusion').find(
    (h) => h.object instanceof THREE.Mesh,
  );
  return !!hit && hit.distance < distance;
};

it('matches exact visibility for curved, translated and non-uniformly scaled geometry', () => {
  const query = createAnnotationOcclusion();
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 24), material());
  sphere.position.set(400, -250, 100);
  sphere.rotation.set(0.3, 0.5, 0.2);
  sphere.scale.set(1.8, 0.5, 2);
  const group = new THREE.Group();
  group.add(sphere);
  group.updateMatrixWorld(true);
  const indices = Array.from(sphere.geometry.index!.array);
  for (let x = -100; x <= 100; x += 10) {
    const ray = new THREE.Ray(new THREE.Vector3(400 + x, -250, 300), new THREE.Vector3(0, 0, -1));
    for (const distance of [20, 130, 230, 400])
      expect(query.test(ray, group, distance)).toBe(nativeOcclusion(ray, group, distance));
    // Perspective rays meet the same transformed surface at oblique angles.
    ray.direction.set(-x, 12, -200).normalize();
    expect(query.test(ray, group, 350)).toBe(nativeOcclusion(ray, group, 350));
  }
  expect(Array.from(sphere.geometry.index!.array)).toEqual(indices);
  expect(query.builds).toBe(1);
  sphere.geometry.dispose();
  sphere.material.dispose();
});

it('keeps surface markers visible, ignores ghosts and wires, and respects custom non-pickable paths', () => {
  const query = createAnnotationOcclusion();
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(100, 100, 16, 16), material());
  const group = new THREE.Group();
  group.add(mesh);
  group.updateMatrixWorld(true);
  const ray = new THREE.Ray(new THREE.Vector3(0, 0, 100), new THREE.Vector3(0, 0, -1));
  expect(query.test(ray, group, 100 - 0.05)).toBe(false);
  expect(query.test(ray, group, 101 - 0.05)).toBe(true);
  expect(query.test(ray, group, -1)).toBe(false);
  for (const display of ['ghost', 'wireframe']) {
    mesh.userData.modelDisplay = display;
    expect(query.test(ray, group, 200)).toBe(false);
  }
  mesh.userData.modelDisplay = 'solid';
  mesh.visible = false;
  expect(query.test(ray, group, 200)).toBe(false);
  mesh.visible = true;
  mesh.raycast = () => {};
  expect(query.test(ray, group, 200)).toBe(false);
  mesh.geometry.dispose();
  mesh.material.dispose();
});

it('checks retained surfaces beyond a clipped first hit and limits queries to the marker depth', () => {
  const query = createAnnotationOcclusion();
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 24), material());
  const group = new THREE.Group();
  group.add(sphere);
  group.updateMatrixWorld(true);
  group.userData.acceptPoint = (point: THREE.Vector3) => point.z <= 0;
  const ray = new THREE.Ray(new THREE.Vector3(2, 3, 100), new THREE.Vector3(0, 0, -1));
  expect(query.test(ray, group, 125)).toBe(false);
  expect(query.test(ray, group, 175)).toBe(true);
  expect(query.test(ray, group, 125)).toBe(nativeOcclusion(ray, group, 125));
  expect(query.test(ray, group, 175)).toBe(nativeOcclusion(ray, group, 175));
  sphere.geometry.dispose();
  sphere.material.dispose();
});

it('reuses a tree through face highlighting but invalidates edited and disposed geometry', () => {
  const query = createAnnotationOcclusion();
  const geometry = new THREE.PlaneGeometry(100, 100, 16, 16);
  const mesh = new THREE.Mesh(geometry, [material(), material()]);
  const group = new THREE.Group();
  group.add(mesh);
  group.updateMatrixWorld(true);
  const ray = new THREE.Ray(new THREE.Vector3(2, 3, 100), new THREE.Vector3(0, 0, -1));
  expect(query.test(ray, group, 150)).toBe(true);
  geometry.clearGroups();
  const count = geometry.index!.count;
  geometry.addGroup(0, count / 2, 0);
  geometry.addGroup(count / 2, count / 2, 1);
  expect(query.test(ray, group, 150)).toBe(true);
  expect(query.builds).toBe(1);
  geometry.translate(0, 0, -100);
  expect(query.test(ray, group, 150)).toBe(false);
  expect(query.builds).toBe(2);
  geometry.dispose();
  expect(query.test(ray, group, 250)).toBe(true);
  expect(query.builds).toBe(3);
  geometry.dispose();
  mesh.material.forEach((m) => m.dispose());
});

it('uses the existing body index, skips outlines and avoids trees for simple solids', () => {
  const query = createAnnotationOcclusion();
  const body = makeBody(100, 100, 20, [300, 400, 0]);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(100, 100, 20), material());
  mesh.position.set(350, 450, 10);
  const outline = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial());
  outline.raycast = () => {
    throw new Error('Annotation occlusion must not pick outlines');
  };
  const group = new THREE.Group();
  group.add(mesh, outline);
  group.updateMatrixWorld(true);
  group.userData.spatialIndex = new BodySpatialIndex([body]);
  group.userData.pickNodes = new Map([[body.id, [mesh, outline]]]);
  const ray = new THREE.Ray(new THREE.Vector3(350, 450, 100), new THREE.Vector3(0, 0, -1));
  expect(query.test(ray, group, 79)).toBe(false);
  expect(query.test(ray, group, 90)).toBe(true);
  ray.origin.x = 500;
  expect(query.test(ray, group, 200)).toBe(false);
  expect(query.builds).toBe(0);
  mesh.geometry.dispose();
  mesh.material.dispose();
  outline.geometry.dispose();
  outline.material.dispose();
});
