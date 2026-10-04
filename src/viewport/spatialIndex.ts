import * as THREE from 'three';
import type { Body } from '../model/project';

interface Entry {
  id: string;
  box: THREE.Box3;
}
interface Node {
  box: THREE.Box3;
  entries?: Entry[];
  left?: Node;
  right?: Node;
}

/** World-space broad phase. Exact CAD points/triangles still decide the final hit. */
export class BodySpatialIndex {
  private root?: Node;
  constructor(bodies: Body[]) {
    const entries = bodies.map((body) => {
      const min = new THREE.Vector3(...body.origin);
      const max = min
        .clone()
        .add(new THREE.Vector3(body.feature.width, body.feature.depth, body.feature.height));
      return { id: body.id, box: new THREE.Box3(min, max).expandByScalar(0.00001) };
    });
    const build = (items: Entry[]): Node => {
      const box = new THREE.Box3();
      items.forEach((item) => box.union(item.box));
      if (items.length <= 8) return { box, entries: items };
      const size = box.getSize(new THREE.Vector3()).toArray();
      const axis = size.indexOf(Math.max(...size));
      items.sort(
        (a, b) =>
          a.box.min.getComponent(axis) +
          a.box.max.getComponent(axis) -
          b.box.min.getComponent(axis) -
          b.box.max.getComponent(axis),
      );
      const middle = Math.floor(items.length / 2);
      return { box, left: build(items.slice(0, middle)), right: build(items.slice(middle)) };
    };
    if (entries.length) this.root = build(entries);
  }
  private query(intersects: (box: THREE.Box3) => boolean): string[] {
    const ids: string[] = [];
    const visit = (node?: Node) => {
      if (!node || !intersects(node.box)) return;
      if (node.entries)
        node.entries.forEach((entry) => {
          if (intersects(entry.box)) ids.push(entry.id);
        });
      else {
        visit(node.left);
        visit(node.right);
      }
    };
    visit(this.root);
    return ids;
  }
  ray(ray: THREE.Ray, tolerance = 0) {
    const box = new THREE.Box3();
    return this.query((bounds) => ray.intersectsBox(box.copy(bounds).expandByScalar(tolerance)));
  }
  screen(camera: THREE.Camera, x: number, y: number, radiusX: number, radiusY: number) {
    camera.updateMatrixWorld();
    const crop = new THREE.Matrix4().set(
      1 / radiusX,
      0,
      0,
      -x / radiusX,
      0,
      1 / radiusY,
      0,
      -y / radiusY,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      1,
    );
    crop.multiply(camera.projectionMatrix).multiply(camera.matrixWorldInverse);
    const frustum = new THREE.Frustum().setFromProjectionMatrix(crop);
    return this.query((box) => frustum.intersectsBox(box));
  }
}

export function intersectModel(ray: THREE.Raycaster, group: THREE.Group) {
  const index = group.userData.spatialIndex as BodySpatialIndex | undefined;
  const nodes = group.userData.pickNodes as Map<string, THREE.Object3D[]> | undefined;
  const objects =
    index && nodes
      ? index.ray(ray.ray, ray.params.Line?.threshold ?? 0).flatMap((id) => nodes.get(id) ?? [])
      : group.children;
  const hits = ray
    .intersectObjects(
      objects.filter((object) => object.visible),
      false,
    )
    .filter((hit) => !group.userData.acceptPoint || group.userData.acceptPoint(hit.point));
  // Ray hits ignore polygon offset. Match the displayed sketch at coincident
  // surfaces, without allowing it to win over physically nearer geometry.
  // Cluster from the nearest hit to avoid a non-transitive epsilon comparator.
  for (let start = 0; start < hits.length;) {
    let end = start + 1;
    while (end < hits.length && hits[end].distance - hits[start].distance <= 1e-5) end++;
    if (end - start > 1) {
      const coincident = hits
        .slice(start, end)
        .sort(
          (a, b) =>
            (b.object.userData.surfacePriority ?? 0) - (a.object.userData.surfacePriority ?? 0),
        );
      for (let i = start; i < end; i++) hits[i] = coincident[i - start];
    }
    start = end;
  }
  return hits;
}
