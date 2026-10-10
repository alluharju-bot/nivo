import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

/** Shared exact triangle acceleration for picking and annotation visibility.
 * The indirect index preserves CAD face indices; highlight groups never rebuild the tree.
 */
export function createTriangleIndex() {
  type Cached = {
    tree: MeshBVH;
    position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
    positionVersion: number;
    index: THREE.BufferAttribute | null;
    indexVersion: number;
    start: number;
    count: number;
  };
  const trees = new WeakMap<THREE.BufferGeometry, Cached>();
  let builds = 0;
  return {
    get builds() {
      return builds;
    },
    get(geometry: THREE.BufferGeometry) {
      const position = geometry.getAttribute('position');
      const positionVersion =
        position instanceof THREE.InterleavedBufferAttribute
          ? position.data.version
          : position.version;
      let cached = trees.get(geometry);
      if (
        !cached ||
        cached.position !== position ||
        cached.positionVersion !== positionVersion ||
        cached.index !== geometry.index ||
        cached.indexVersion !== (geometry.index?.version ?? 0) ||
        cached.start !== geometry.drawRange.start ||
        cached.count !== geometry.drawRange.count
      ) {
        if (!cached) geometry.addEventListener('dispose', () => trees.delete(geometry));
        // Build over the draw range, independent of current material/highlight groups.
        // Attributes and indices are shared; the indirect tree never modifies them.
        const proxy = new THREE.BufferGeometry();
        proxy.setAttribute('position', position);
        proxy.setIndex(geometry.index);
        proxy.setDrawRange(geometry.drawRange.start, geometry.drawRange.count);
        const tree = new MeshBVH(proxy, { indirect: true });
        cached = {
          tree,
          position,
          positionVersion,
          index: geometry.index,
          indexVersion: geometry.index?.version ?? 0,
          start: geometry.drawRange.start,
          count: geometry.drawRange.count,
        };
        trees.set(geometry, cached);
        builds++;
      }
      // Raycast attributes/material sides follow current geometry, including new highlight groups.
      cached.tree.geometry.attributes = geometry.attributes;
      cached.tree.geometry.groups = geometry.groups;
      return cached.tree;
    },
  };
}
