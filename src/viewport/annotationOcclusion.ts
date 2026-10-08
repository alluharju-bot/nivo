import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import type { BodySpatialIndex } from './spatialIndex';

/** Visibility queries only: never reorder CAD triangles or change modeling raycasts. */
export function createAnnotationOcclusion() {
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
  const inverse = new THREE.Matrix4(),
    linear = new THREE.Matrix3();
  const localRay = new THREE.Ray(),
    direction = new THREE.Vector3(),
    worldPoint = new THREE.Vector3();
  const fallback = new THREE.Raycaster();
  const hits: THREE.Intersection[] = [];
  let builds = 0;

  return {
    get builds() {
      return builds;
    },
    test(ray: THREE.Ray, group: THREE.Group, distance: number) {
      if (distance <= 0) return false;
      const index = group.userData.spatialIndex as BodySpatialIndex | undefined;
      const nodes = group.userData.pickNodes as Map<string, THREE.Object3D[]> | undefined;
      const objects =
        index && nodes ? index.ray(ray).flatMap((id) => nodes.get(id) ?? []) : group.children;
      const accept = group.userData.acceptPoint as ((point: THREE.Vector3) => boolean) | undefined;
      for (const object of objects) {
        if (
          !(object instanceof THREE.Mesh) ||
          !object.visible ||
          object.userData.modelDisplay === 'ghost' ||
          object.userData.modelDisplay === 'wireframe'
        )
          continue;
        const geometry = object.geometry;
        const position = geometry.getAttribute('position');
        const count = geometry.index?.count ?? position?.count ?? 0;
        if (!count) continue;
        // Small flat parts need no tree. Also respect custom raycasts (e.g. construction paths).
        if (count < 384 || object.raycast !== THREE.Mesh.prototype.raycast) {
          fallback.ray.copy(ray);
          fallback.far = distance;
          hits.length = 0;
          fallback.intersectObject(object, false, hits);
          if (hits.some((hit) => hit.distance < distance && (!accept || accept(hit.point))))
            return true;
          continue;
        }
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
          cached = {
            // The original index order is used by CAD face selection and must stay intact.
            tree: new MeshBVH(geometry, { indirect: true }),
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
        inverse.copy(object.matrixWorld).invert();
        localRay.copy(ray).applyMatrix4(inverse);
        const scale = direction
          .copy(ray.direction)
          .applyMatrix3(linear.setFromMatrix4(inverse))
          .length();
        const far = distance * scale;
        const first = cached.tree.raycastFirst(localRay, THREE.DoubleSide, 0, far);
        if (!first || first.distance >= far) continue;
        if (!accept || accept(worldPoint.copy(first.point).applyMatrix4(object.matrixWorld)))
          return true;
        // A section may remove the nearest face while a further retained face still blocks sight.
        if (
          cached.tree
            .raycast(localRay, THREE.DoubleSide, 0, far)
            .some(
              (hit) =>
                hit.distance < far &&
                accept(worldPoint.copy(hit.point).applyMatrix4(object.matrixWorld)),
            )
        )
          return true;
      }
      return false;
    },
  };
}
