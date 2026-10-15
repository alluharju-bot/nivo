import * as THREE from 'three';

/** Recognize a complete planar circular face from its tessellation. Boundary
 * topology rejects rings/holes, and the area check rejects incomplete disks.
 * Work in world space so rotated emitters need no axis-aligned approximation. */
export function emitterDisk(geometry: THREE.BufferGeometry) {
  const positions = geometry.getAttribute('position');
  const count = geometry.index?.count ?? positions?.count ?? 0;
  if (!positions || count < 36 || count % 3) return;
  const box = new THREE.Box3().setFromBufferAttribute(positions as THREE.BufferAttribute);
  const extent = box.getSize(new THREE.Vector3()).length();
  const magnitude = Math.max(
    ...box.min.toArray().map(Math.abs),
    ...box.max.toArray().map(Math.abs),
  );
  const tolerance = Math.max(1e-5, magnitude * 2 ** -22, extent * 1e-6);
  const points: THREE.Vector3[] = [],
    vertices = new Map<string, number>();
  const edges = new Map<string, { a: number; b: number; count: number }>();
  let area = 0;
  let plane: THREE.Plane | undefined;
  for (let i = 0; i < count; i += 3) {
    const ids = [0, 1, 2].map((offset) => {
      const index = geometry.index?.getX(i + offset) ?? i + offset;
      const point = new THREE.Vector3().fromBufferAttribute(positions, index);
      const key = point
        .toArray()
        .map((v) => Math.round(v / tolerance))
        .join(',');
      let id = vertices.get(key);
      if (id === undefined) {
        id = points.length;
        vertices.set(key, id);
        points.push(point);
      }
      return id;
    });
    const [a, b, c] = ids.map((id) => points[id]);
    const triangleArea = b.clone().sub(a).cross(c.clone().sub(a)).length() / 2;
    if (triangleArea <= tolerance * tolerance) continue;
    plane ??= new THREE.Plane().setFromCoplanarPoints(a, b, c);
    if ([a, b, c].some((point) => Math.abs(plane!.distanceToPoint(point)) > tolerance * 4)) return;
    area += triangleArea;
    for (let j = 0; j < 3; j++) {
      const a = ids[j],
        b = ids[(j + 1) % 3],
        key = `${Math.min(a, b)},${Math.max(a, b)}`;
      const edge = edges.get(key);
      if (edge) {
        if (++edge.count > 2) return;
      } else edges.set(key, { a, b, count: 1 });
    }
  }
  const boundary = [...edges.values()].filter((edge) => edge.count === 1);
  const boundaryIds = [...new Set(boundary.flatMap((edge) => [edge.a, edge.b]))];
  if (boundaryIds.length < 24 || boundary.length !== boundaryIds.length) return;
  const neighbors = new Map<number, number[]>();
  for (const { a, b } of boundary) {
    neighbors.set(a, [...(neighbors.get(a) ?? []), b]);
    neighbors.set(b, [...(neighbors.get(b) ?? []), a]);
  }
  if ([...neighbors.values()].some((list) => list.length !== 2)) return;
  const loop: number[] = [],
    seen = new Set<number>();
  let current = boundaryIds[0],
    previous = -1;
  while (!seen.has(current)) {
    seen.add(current);
    loop.push(current);
    const next = neighbors.get(current)!.find((id) => id !== previous)!;
    previous = current;
    current = next;
  }
  if (current !== loop[0] || seen.size !== boundaryIds.length) return;
  const a = points[loop[0]];
  const b =
    points[
      loop.reduce(
        (best, id) =>
          points[id].distanceToSquared(a) > points[best].distanceToSquared(a) ? id : best,
        loop[0],
      )
    ];
  const ab = b.clone().sub(a);
  const crossAt = (id: number) => ab.clone().cross(points[id].clone().sub(a));
  const c =
    points[
      loop.reduce(
        (best, id) => (crossAt(id).lengthSq() > crossAt(best).lengthSq() ? id : best),
        loop[0],
      )
    ];
  const ac = c.clone().sub(a),
    normal = ab.clone().cross(ac);
  if (normal.lengthSq() < tolerance ** 4) return;
  const center = a.clone().add(
    ac
      .clone()
      .cross(normal)
      .multiplyScalar(ab.lengthSq())
      .add(normal.clone().cross(ab).multiplyScalar(ac.lengthSq()))
      .multiplyScalar(1 / (2 * normal.lengthSq())),
  );
  normal.normalize();
  const radius = center.distanceTo(a);
  if (
    radius <= tolerance ||
    points.some((p) => Math.abs(p.clone().sub(center).dot(normal)) > tolerance * 4)
  )
    return;
  if (loop.some((id) => Math.abs(points[id].distanceTo(center) - radius) > tolerance * 4)) return;
  // Require a finely tessellated full disk, not an arc closed by a long chord.
  if (boundary.some(({ a, b }) => points[a].distanceTo(points[b]) > radius * 0.3)) return;
  if (Math.abs(area / (Math.PI * radius * radius) - 1) > 0.015) return;
  // The boundary must bound exactly the supplied triangles, without overlap.
  const polygonArea =
    loop.reduce(
      (sum, id, i) =>
        sum +
        points[id]
          .clone()
          .sub(center)
          .cross(points[loop[(i + 1) % loop.length]].clone().sub(center))
          .dot(normal),
      0,
    ) / 2;
  if (Math.abs(area - Math.abs(polygonArea)) > Math.max(tolerance * extent, area * 1e-5)) return;
  return { center, radius, normal };
}
