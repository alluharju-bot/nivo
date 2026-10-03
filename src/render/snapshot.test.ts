import { expect, it } from 'vitest';
import * as THREE from 'three';
import { captureRenderScene } from './snapshot';

it('owns render resources independently of subsequent model, material and camera changes', () => {
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(38, 2);
  const material = new THREE.MeshPhysicalMaterial({ color: 'red', map: new THREE.Texture() });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 3), material);
  scene.add(mesh, new THREE.Sprite());
  camera.position.set(2, 3, 4);
  const snapshot = captureRenderScene(scene, camera, 2, 1);
  const copy = snapshot.scene.children[0] as THREE.Mesh<
    THREE.BufferGeometry,
    THREE.MeshPhysicalMaterial
  >;
  mesh.position.set(100, 200, 300);
  material.color.set('blue');
  material.map!.offset.x = 99;
  camera.position.set(5, 6, 7);
  expect(copy.position.toArray()).toEqual([0, 0, 0]);
  expect(copy.material.color.getHexString()).toBe('ff0000');
  expect(copy.material.map!.offset.x).toBe(0);
  expect(copy.geometry).not.toBe(mesh.geometry);
  expect(snapshot.camera.position.toArray()).toEqual([2, 3, 4]);
  expect(snapshot.scene.children).toHaveLength(1);
  snapshot.dispose();
  snapshot.dispose();
  expect(scene.children).toHaveLength(2);
  expect(mesh.geometry.attributes.position.count).toBe(24);
  mesh.geometry.dispose();
  material.map!.dispose();
  material.dispose();
});
