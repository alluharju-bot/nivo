import * as THREE from 'three';
import type { BodyMesh } from '../cad/protocol';

/** Non-pickable cutting volume: original parts remain the target of a click. */
export function createOpeningPreview(scene: THREE.Scene) {
  const group = new THREE.Group();
  group.name = 'opening-preview';
  scene.add(group);
  let previous: readonly BodyMesh[] | undefined;
  const clear = () => {
    for (const child of group.children) {
      const object = child as THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
      object.geometry.dispose();
      object.material.dispose();
    }
    group.clear();
  };
  return {
    sync(meshes?: readonly BodyMesh[]) {
      if (meshes === previous) return;
      previous = meshes;
      clear();
      for (const mesh of meshes ?? []) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(mesh.vertices, 3));
        geometry.setIndex(mesh.triangles);
        const surface = new THREE.Mesh(
          geometry,
          new THREE.MeshBasicMaterial({
            color: '#e6654e',
            transparent: true,
            opacity: 0.26,
            side: THREE.DoubleSide,
            depthWrite: false,
            depthTest: false,
            toneMapped: false,
          }),
        );
        surface.renderOrder = 8;
        const edges = new THREE.BufferGeometry();
        edges.setAttribute('position', new THREE.Float32BufferAttribute(mesh.edges, 3));
        const outline = new THREE.LineSegments(
          edges,
          new THREE.LineBasicMaterial({
            color: '#c54433',
            transparent: true,
            opacity: 0.8,
            depthTest: false,
            depthWrite: false,
            toneMapped: false,
          }),
        );
        outline.renderOrder = 9;
        group.add(surface, outline);
      }
    },
    dispose() {
      clear();
      scene.remove(group);
    },
  };
}
