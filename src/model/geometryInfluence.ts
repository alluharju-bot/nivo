import { Matrix4, Vector3 } from 'three';
import { geometryEdges, type EditableGeometry } from './geometryEditing';
import type { Vec3 } from './project';

/** Surface-distance falloff: no Euclidean jump across a hole or disconnected
 * shell. Boundary loops without a selected point can stay fixed. */
export function geometryInfluence(
  g: EditableGeometry,
  selected: number[],
  radius: number,
  pinBoundaries = true,
) {
  const weights = new Float32Array(g.points.length);
  selected.forEach((i) => {
    weights[i] = 1;
  });
  if (!(radius > 0) || !selected.length) return weights;
  const edges = geometryEdges(g, true),
    boundary = edges.filter((e) => e.boundary);
  const adjacency: { id: number; distance: number }[][] = g.points.map(() => []);
  for (const e of edges) {
    const distance = Math.hypot(...g.points[e.a].map((n, k) => n - g.points[e.b][k]));
    adjacency[e.a].push({ id: e.b, distance });
    adjacency[e.b].push({ id: e.a, distance });
  }
  const pinned = new Set<number>();
  if (pinBoundaries) {
    const links = new Map<number, number[]>();
    for (const e of boundary)
      for (const [a, b] of [
        [e.a, e.b],
        [e.b, e.a],
      ])
        links.set(a, [...(links.get(a) ?? []), b]);
    const chosen = new Set(selected),
      visited = new Set<number>();
    for (const start of links.keys()) {
      if (visited.has(start)) continue;
      const loop = [start];
      visited.add(start);
      for (let j = 0; j < loop.length; j++)
        for (const id of links.get(loop[j]) ?? [])
          if (!visited.has(id)) {
            loop.push(id);
            visited.add(id);
          }
      if (!loop.some((id) => chosen.has(id))) loop.forEach((id) => pinned.add(id));
    }
  }
  // Binary heap keeps a dense mesh's radius changes interactive.
  const queue: { id: number; distance: number }[] = [],
    distances = new Float64Array(g.points.length).fill(Infinity);
  const push = (item: { id: number; distance: number }) => {
    let i = queue.length;
    queue.push(item);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (queue[p].distance <= item.distance) break;
      queue[i] = queue[p];
      i = p;
    }
    queue[i] = item;
  };
  const pop = () => {
    const first = queue[0],
      last = queue.pop()!;
    if (queue.length) {
      let i = 0;
      while (i * 2 + 1 < queue.length) {
        let child = i * 2 + 1;
        if (child + 1 < queue.length && queue[child + 1].distance < queue[child].distance) child++;
        if (queue[child].distance >= last.distance) break;
        queue[i] = queue[child];
        i = child;
      }
      queue[i] = last;
    }
    return first;
  };
  selected.forEach((id) => {
    distances[id] = 0;
    push({ id, distance: 0 });
  });
  while (queue.length) {
    const at = pop();
    if (at.distance !== distances[at.id]) continue;
    const x = 1 - at.distance / radius;
    weights[at.id] = x * x * (3 - 2 * x);
    for (const edge of adjacency[at.id]) {
      const d = at.distance + edge.distance;
      if (d < radius && d < distances[edge.id] && !pinned.has(edge.id)) {
        distances[edge.id] = d;
        push({ id: edge.id, distance: d });
      }
    }
  }
  return weights;
}
export function transformWithInfluence(
  points: Vec3[],
  weights: Float32Array,
  matrix: Matrix4,
): Vec3[] {
  const vector = new Vector3();
  return points.map((p, i) => {
    if (!weights[i]) return p;
    const transformed = vector.set(...p).applyMatrix4(matrix);
    return p.map((n, k) => n + (transformed.getComponent(k) - n) * weights[i]) as Vec3;
  });
}
