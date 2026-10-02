import { expect, it } from 'vitest';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { makeBody } from '../model/project';
import { focusDepth, orbitAbout, orbitSurfacePoint, selectionCenter } from './cameraNavigation';

it.each(['perspective', 'orthographic'])(
  'picks the visible surface instead of a hidden part or a line (%s)',
  (type) => {
    const camera =
      type === 'perspective'
        ? new THREE.PerspectiveCamera(40, 1, 0.1, 1000)
        : new THREE.OrthographicCamera(-100, 100, 100, -100, 0.1, 1000);
    camera.position.set(0, 0, 100);
    const geometry = new THREE.BoxGeometry(20, 20, 20);
    const material = new THREE.MeshBasicMaterial();
    const back = new THREE.Mesh(geometry, material);
    const front = new THREE.Mesh(geometry, material);
    front.position.z = 40;
    const group = new THREE.Group();
    group.add(front);
    const lineGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-10, 0, 80),
      new THREE.Vector3(10, 0, 80),
    ]);
    const lineMaterial = new THREE.LineBasicMaterial();
    const line = new THREE.Line(lineGeometry, lineMaterial);
    const objects = [line, back, group];
    expect(orbitSurfacePoint(camera, new THREE.Vector2(), objects)?.z).toBeCloseTo(50);
    group.visible = false;
    expect(orbitSurfacePoint(camera, new THREE.Vector2(), objects)?.z).toBeCloseTo(10);
    material.opacity = 0;
    expect(orbitSurfacePoint(camera, new THREE.Vector2(), objects)).toBeUndefined();
    geometry.dispose();
    material.dispose();
    lineGeometry.dispose();
    lineMaterial.dispose();
  },
);

it('picks curved geometry at the cursor, not its bounding-box center', () => {
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1000);
  camera.position.z = 100;
  const geometry = new THREE.SphereGeometry(20, 64, 32);
  const material = new THREE.MeshBasicMaterial();
  const surface = new THREE.Mesh(geometry, material);
  const point = orbitSurfacePoint(camera, new THREE.Vector2(0.2, 0.1), [surface])!;
  expect(point.length()).toBeCloseTo(20, 1);
  expect(point.x).toBeGreaterThan(0);
  expect(point.y).toBeGreaterThan(0);
  expect(point.z).toBeGreaterThan(0);
  geometry.dispose();
  material.dispose();
});

it('uses the visible selection bounds, with the edited part taking priority over selection', () => {
  const a = makeBody(100, 80, 20, [500, 0, 0]);
  const b = makeBody(200, 80, 40, [1000, 0, 0]);
  expect(selectionCenter([a, b], [a.id])?.toArray()).toEqual([550, 40, 10]);
  expect(selectionCenter([a, b], [a.id, b.id])?.toArray()).toEqual([850, 40, 20]);
  expect(selectionCenter([a, b], [b.id], a.id)?.toArray()).toEqual([550, 40, 10]);
  expect(selectionCenter([a, b], [], a.id)?.toArray()).toEqual([550, 40, 10]);
  expect(selectionCenter([a], [b.id])).toBeUndefined();
});

it('changes zoom depth to the part without moving or turning the camera', () => {
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1e6);
  camera.up.set(0, 0, 1);
  camera.position.set(200, -1000, 300);
  const target = new THREE.Vector3(200, 0, 300);
  camera.lookAt(target);
  const position = camera.position.clone(),
    quaternion = camera.quaternion.clone();
  const focus = new THREE.Vector3(400, -800, 100);
  focusDepth(camera, target, focus);
  expect(camera.position.toArray()).toEqual(position.toArray());
  expect(camera.quaternion.toArray()).toEqual(quaternion.toArray());
  expect(camera.position.distanceTo(target)).toBeCloseTo(200);
  const before = target.clone();
  focusDepth(camera, target, new THREE.Vector3(200, -1200, 300));
  expect(target.toArray()).toEqual(before.toArray()); // Never flip toward a point behind the eye.
});

it.each(['perspective', 'orthographic'])(
  'orbits an off-center part without losing its framing (%s)',
  (type) => {
    const camera =
      type === 'perspective'
        ? new THREE.PerspectiveCamera(40, 1.5, 0.1, 1e6)
        : new THREE.OrthographicCamera(-600, 600, 400, -400, 0.1, 1e6);
    camera.up.set(0, 0, 1);
    camera.position.set(500, -1000, 700);
    const controls = new OrbitControls(camera);
    const pivot = new THREE.Vector3(300, 100, 100);
    focusDepth(camera, controls.target, pivot);
    camera.updateMatrixWorld();
    const screen = pivot.clone().project(camera);
    const radius = camera.position.distanceTo(pivot);
    const localPivot = pivot
      .clone()
      .sub(camera.position)
      .applyQuaternion(camera.quaternion.clone().invert());
    controls.addEventListener('change', () =>
      orbitAbout(camera, controls.target, pivot, localPivot),
    );
    for (let i = 0; i < 20; i++) {
      controls.rotateLeft(0.08);
      controls.rotateUp(0.02);
      const after = pivot.clone().project(camera);
      expect(after.x).toBeCloseTo(screen.x, 9);
      expect(after.y).toBeCloseTo(screen.y, 9);
      expect(camera.position.distanceTo(pivot)).toBeCloseTo(radius, 8);
    }
  },
);
