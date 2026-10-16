import { expect, it } from 'vitest';
import * as THREE from 'three';
import { needsReflectionGuides } from './reflectionGuides';

it('omits the unused guide for matte paint and transmission but retains glossy and mapped regions', () => {
  const scene = new THREE.Scene(),
    material = new THREE.MeshPhysicalMaterial({ roughness: 0.55 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
  scene.add(mesh);
  const map = new THREE.Texture();
  try {
    expect(needsReflectionGuides(scene)).toBe(false);
    material.roughness = 0.1;
    expect(needsReflectionGuides(scene)).toBe(true);
    material.transmission = 0.9;
    expect(needsReflectionGuides(scene)).toBe(false);
    material.transmissionMap = map;
    expect(needsReflectionGuides(scene)).toBe(true);
    material.transmission = 0;
    material.transmissionMap = null;
    material.roughness = 1;
    material.roughnessMap = map;
    expect(needsReflectionGuides(scene)).toBe(true);
    mesh.visible = false;
    expect(needsReflectionGuides(scene)).toBe(false);
    mesh.visible = true;
    material.visible = false;
    expect(needsReflectionGuides(scene)).toBe(false);
  } finally {
    mesh.geometry.dispose();
    material.dispose();
    map.dispose();
  }
});

it('retains the guide when a mirror is behind a transmissive front surface', () => {
  const scene = new THREE.Scene();
  const gel = new THREE.MeshPhysicalMaterial({ transmission: 1, roughness: 0.05 });
  const mirror = new THREE.MeshPhysicalMaterial({ metalness: 1, roughness: 0.005 });
  const geometry = new THREE.BoxGeometry();
  scene.add(new THREE.Mesh(geometry, gel), new THREE.Mesh(geometry, [gel, mirror]));
  try {
    expect(needsReflectionGuides(scene)).toBe(true);
  } finally {
    geometry.dispose();
    gel.dispose();
    mirror.dispose();
  }
});
