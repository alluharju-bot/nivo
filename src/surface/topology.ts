import { DoubleSide, Ray, Vector3 } from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { geometryOf, type SurfaceMesh } from './mesh';
import type { BrushStamp } from './sculpt';

export const pointKey = (p: number[]) => p.map((n) => Math.round(n * 1e6)).join(',');
const cache = new WeakMap<number[], ReturnType<typeof buildTopology>>();
function buildTopology(mesh: SurfaceMesh) {
  const byPoint = new Map<string, number>(),
    ids: number[] = [],
    representatives: number[] = [];
  const neighbours: Set<number>[] = [],
    triangles: Set<number>[] = [],
    clusters: number[] = [];
  const crease = new Map<string, number>(),
    edges = new Map<string, number>();
  for (let i = 0; i < mesh.positions.length / 3; i++) {
    const key = pointKey(mesh.positions.slice(i * 3, i * 3 + 3));
    let id = byPoint.get(key);
    if (id === undefined) {
      id = representatives.length;
      byPoint.set(key, id);
      representatives.push(i);
      neighbours.push(new Set());
      triangles.push(new Set());
    }
    ids.push(id);
    const normal = `${id}:${mesh.normals
      .slice(i * 3, i * 3 + 3)
      .map((n) => Math.round(n * 1000))
      .join(',')}`;
    if (!crease.has(normal)) crease.set(normal, crease.size);
    clusters.push(crease.get(normal)!);
  }
  for (let t = 0; t < mesh.indices.length; t += 3)
    for (let k = 0; k < 3; k++) {
      const a = ids[mesh.indices[t + k]],
        b = ids[mesh.indices[t + ((k + 1) % 3)]];
      neighbours[a].add(b);
      neighbours[b].add(a);
      triangles[a].add(t / 3);
      const key = [Math.min(a, b), Math.max(a, b)].join(':');
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  const boundary = new Set<number>();
  for (const [key, count] of edges)
    if (count === 1) key.split(':').forEach((i) => boundary.add(Number(i)));
  return {
    ids,
    representatives,
    neighbours,
    triangles,
    boundary,
    clusters,
    clusterCount: crease.size,
  };
}
export function topology(mesh: SurfaceMesh) {
  let value = cache.get(mesh.indices);
  if (!value) {
    value = buildTopology(mesh);
    cache.set(mesh.indices, value);
  }
  return value;
}
export function updatedNormals(mesh: SurfaceMesh, positions: number[]) {
  const { clusters, clusterCount } = topology(mesh);
  const sums = Array.from({ length: clusterCount }, () => new Vector3());
  const a = new Vector3(),
    b = new Vector3(),
    c = new Vector3();
  for (let t = 0; t < mesh.indices.length; t += 3) {
    a.fromArray(positions, mesh.indices[t] * 3);
    b.fromArray(positions, mesh.indices[t + 1] * 3);
    c.fromArray(positions, mesh.indices[t + 2] * 3);
    const n = b.sub(a).cross(c.sub(a));
    for (let k = 0; k < 3; k++) sums[clusters[mesh.indices[t + k]]].add(n);
  }
  return clusters.flatMap((id) => sums[id].clone().normalize().toArray());
}

/** Traverse connected triangles through edges near the stamp, never jump between nearby shells. */
export function brushRegion(mesh: SurfaceMesh, stamp: BrushStamp): Set<number> | undefined {
  if (stamp.triangle === undefined) return undefined;
  const g = topology(mesh),
    seen = new Set<number>(),
    pending = [stamp.triangle];
  const visitedEdges = new Set<string>(),
    point = new Vector3(...stamp.point);
  const a = new Vector3(),
    b = new Vector3(),
    edge = new Vector3(),
    closest = new Vector3();
  while (pending.length) {
    const t = pending.pop()!;
    if (seen.has(t)) continue;
    seen.add(t);
    for (let k = 0; k < 3; k++) {
      const i = mesh.indices[t * 3 + k],
        j = mesh.indices[t * 3 + ((k + 1) % 3)];
      const u = g.ids[i],
        v = g.ids[j],
        key = [Math.min(u, v), Math.max(u, v)].join(':');
      if (visitedEdges.has(key)) continue;
      visitedEdges.add(key);
      a.fromArray(mesh.positions, i * 3);
      b.fromArray(mesh.positions, j * 3);
      edge.copy(b).sub(a);
      const f = Math.max(
        0,
        Math.min(1, closest.copy(point).sub(a).dot(edge) / Math.max(1e-20, edge.lengthSq())),
      );
      closest.copy(a).addScaledVector(edge, f);
      if (closest.distanceToSquared(point) > stamp.radius ** 2) continue;
      for (const other of g.triangles[u])
        if (g.triangles[v].has(other) && !seen.has(other)) pending.push(other);
    }
  }
  return seen;
}

/** One BVH per live position array. Occluded folds are excluded even within the same shell. */
const visibilityCache = new WeakMap<number[], MeshBVH>();
export function visibleFrom(mesh: SurfaceMesh, camera?: number[], liveBVH?: MeshBVH) {
  if (!camera) return (_point: number[]) => true;
  let bvh = liveBVH ?? visibilityCache.get(mesh.positions);
  if (!bvh) {
    const geometry = geometryOf(mesh);
    bvh = new MeshBVH(geometry, { indirect: true });
    visibilityCache.set(mesh.positions, bvh);
  }
  const ray = new Ray(new Vector3(...camera)),
    p = new Vector3();
  return (point: number[]) => {
    p.fromArray(point);
    ray.direction.copy(p).sub(ray.origin);
    const distance = ray.direction.length();
    ray.direction.normalize();
    const hit = bvh!.raycastFirst(ray, DoubleSide);
    return !hit || hit.distance >= distance - Math.max(1e-4, distance * 1e-6);
  };
}
