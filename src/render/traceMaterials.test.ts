import { expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { PathTracingSceneGenerator } from 'three-gpu-pathtracer';
import { prepareTraceMaterials, resetTraceMaterialIndices } from './traceMaterials';

it('keeps painted faces, LED faces and subsequent parts on their own trace materials', () => {
  const scene = new THREE.Scene();
  const materials = Array.from(
    { length: 302 },
    (_, i) =>
      new THREE.MeshPhysicalMaterial({
        color: new THREE.Color().setHSL(i / 302, 0.5, 0.5),
        emissive: i === 1 ? 'white' : 'black',
      }),
  );
  const painted = new THREE.BoxGeometry(2, 2, 2);
  painted.groups.forEach((group, i) => {
    group.materialIndex = i === 0 ? 1 : 0;
  });
  const first = new THREE.Mesh(painted, materials.slice(0, 2));
  first.uuid = '0000';
  scene.add(first);
  for (let i = 2; i < materials.length; i++) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), materials[i]);
    mesh.position.x = i * 10;
    mesh.uuid = String(i).padStart(4, '0');
    scene.add(mesh);
  }
  scene.updateMatrixWorld(true);
  const dispose = prepareTraceMaterials(scene);
  const generator = new PathTracingSceneGenerator(scene);
  const result = generator.generate();
  const positions = result.geometry.getAttribute('position');
  const indices = result.geometry.getIndex()!;
  const materialIds = result.geometry.getAttribute('materialIndex');
  for (let i = 0; i < indices.count; i += 3) {
    const vertices = [0, 1, 2].map((j) => indices.getX(i + j));
    const x = vertices.reduce((sum, v) => sum + positions.getX(v), 0) / 3;
    const part = Math.round(x / 10);
    const expected = part === 0 ? (vertices.every((v) => positions.getX(v) === 1) ? 1 : 0) : part;
    for (const v of vertices)
      expect(result.materials[materialIds.getX(v)]).toBe(materials[expected]);
  }
  result.geometry.dispose();
  dispose();
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh) object.geometry.dispose();
  });
  materials.forEach((material) => material.dispose());
});

it('reallocates material IDs when repainting crosses 255 groups without changing the vertex count', () => {
  const scene = new THREE.Scene();
  const materials = Array.from({ length: 300 }, () => new THREE.MeshPhysicalMaterial());
  for (let i = 0; i < 150; i++) {
    const geometry = new THREE.PlaneGeometry().toNonIndexed();
    geometry.addGroup(0, 3, 0);
    geometry.addGroup(3, 3, 1);
    const mesh = new THREE.Mesh(geometry, materials[i * 2]);
    mesh.position.x = i * 2;
    scene.add(mesh);
  }
  scene.updateMatrixWorld(true);
  const generator = new PathTracingSceneGenerator(scene);
  generator.generate();
  const vertexCount = generator.geometry.getAttribute('position').count;
  expect(generator.geometry.getAttribute('materialIndex').array).toBeInstanceOf(Uint8Array);
  const snapshot = scene.clone();
  snapshot.children.forEach((o, i) => {
    (o as THREE.Mesh).material = materials.slice(i * 2, i * 2 + 2);
  });
  const dispose = prepareTraceMaterials(snapshot);
  generator.setObjects(snapshot);
  resetTraceMaterialIndices(generator.geometry);
  const result = generator.generate();
  expect(result.geometry.getAttribute('position').count).toBe(vertexCount);
  expect(result.geometry.getAttribute('materialIndex').array).toBeInstanceOf(Uint16Array);
  const ids = new Set(result.geometry.getAttribute('materialIndex').array);
  expect(ids.size).toBe(300);
  generator.geometry.dispose();
  dispose();
  scene.children.forEach((o) => (o as THREE.Mesh).geometry.dispose());
  materials.forEach((material) => material.dispose());
});

it.each([false, true])(
  'retains UVs, normalized attributes and nested transforms without changing model resources (indexed: %s)',
  (indexed) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0], 3),
    );
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
    geometry.setAttribute(
      'color',
      new THREE.Uint8BufferAttribute([255, 128, 0, 255, 128, 0, 255, 128, 0, 255, 128, 0], 3, true),
    );
    geometry.setIndex([0, 1, 2, 1, 3, 2]);
    const source = indexed ? geometry : geometry.toNonIndexed();
    source.addGroup(0, 3, 0);
    source.addGroup(3, 3, 1);
    const materials = [new THREE.MeshPhysicalMaterial(), new THREE.MeshPhysicalMaterial()];
    const mesh = new THREE.Mesh(source, materials);
    mesh.position.set(2, 3, 4);
    mesh.rotation.set(0.3, 0.5, 0.1);
    mesh.scale.set(2, 3, 1);
    const parent = new THREE.Group();
    parent.position.set(100, 200, 300);
    parent.add(mesh);
    const scene = new THREE.Scene();
    scene.add(parent);
    scene.updateMatrixWorld(true);
    const expectedWorld = mesh.matrixWorld.clone();
    const snapshot = scene.clone();
    const originalDisposed = vi.fn();
    source.addEventListener('dispose', originalDisposed);
    const dispose = prepareTraceMaterials(snapshot);
    const surfaces: THREE.Mesh[] = [];
    snapshot.traverse((o) => {
      if (o instanceof THREE.Mesh) surfaces.push(o);
    });
    expect(surfaces).toHaveLength(2);
    const disposed = vi.fn();
    for (const [i, surface] of surfaces.entries()) {
      expect(surface.material).toBe(materials[i]);
      expect(surface.matrixWorld.elements).toEqual(expectedWorld.elements);
      expect(surface.geometry.getAttribute('position').count).toBe(3);
      const positions = surface.geometry.getAttribute('position'),
        uv = surface.geometry.getAttribute('uv');
      for (let v = 0; v < 3; v++) {
        expect(uv.getX(v)).toBe(positions.getX(v));
        expect(uv.getY(v)).toBe(positions.getY(v));
        expect(surface.geometry.getAttribute('color').getY(v)).toBeCloseTo(128 / 255);
      }
      surface.geometry.addEventListener('dispose', disposed);
    }
    materials[1].color.set('#123456');
    expect((surfaces[1].material as THREE.MeshPhysicalMaterial).color.getHexString()).toBe(
      '123456',
    );
    dispose();
    dispose();
    expect(disposed).toHaveBeenCalledTimes(2);
    expect(originalDisposed).not.toHaveBeenCalled();
    expect(mesh.material).toBe(materials);
    expect(source.groups).toHaveLength(2);
    source.dispose();
    if (source !== geometry) geometry.dispose();
    materials.forEach((material) => material.dispose());
  },
);
