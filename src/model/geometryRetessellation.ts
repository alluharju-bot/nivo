import { ShapeUtils, Vector2 } from 'three';
import type { EditableGeometry } from './geometryEditing';
import type { Vec3 } from './project';
import { sub, dot, unit } from './geometry';
import { cross } from './transforms';
import { symmetricPatchTriangles } from './geometrySymmetry';

const edgeKey = (a: number, b: number) => `${Math.min(a, b)}:${Math.max(a, b)}`;
const orient = (a: Vector2, b: Vector2, c: Vector2) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const failure = () =>
  new Error(
    'Pinnan rajaus leikkaa itseään tai aukkoa. Pienennä muutosta; alkuperäinen pinta säilyi.',
  );

/** Retessellate each planar source patch from its boundary, not the diagonals
 * chosen by the CAD mesher. Point IDs and per-face render vertices stay stable,
 * so preview, UV seams, selection and worker acceptance use identical topology. */
export function retessellateGeometry(g: EditableGeometry, points: Vec3[]): EditableGeometry {
  if (points.length !== g.points.length || points.some((p) => p.some((n) => !Number.isFinite(n))))
    return g;
  if (
    points === g.points ||
    !points.some((p, i) => p.some((n, k) => Math.abs(n - g.points[i][k]) > 1e-9))
  )
    return g;
  if (
    new Set(points.map((p) => p.map((n) => Math.round(n * 1e6)).join(','))).size !== points.length
  )
    throw new Error(
      'Pisteet osuvat yhteen. Siirrä niitä erilleen; pisteiden yhdistäminen on erillinen toiminto.',
    );
  const triangles: number[] = [],
    sourceTriangles: number[] = [],
    patches: number[] = [];
  const groups: EditableGeometry['groups'] = [];
  for (const group of g.groups) {
    const start = triangles.length,
      batches = new Map<number, number[]>();
    for (let t = group.start / 3; t < (group.start + group.count) / 3; t++) {
      const patch = g.patches[t];
      const batch = batches.get(patch) ?? [];
      batch.push(t);
      batches.set(patch, batch);
    }
    for (const [patch, batch] of batches) {
      const ids = batch.flatMap((t) => g.triangles.slice(t * 3, t * 3 + 3));
      const vertices = new Map<number, number>();
      for (const t of batch)
        for (let k = 0; k < 3; k++)
          vertices.set(g.triangles[t * 3 + k], g.sourceTriangles[t * 3 + k]);
      const next = triangulatePatch(g.points, points, ids);
      // A permitted mesh can exceed JavaScript's argument limit for push(...).
      for (const i of next) {
        triangles.push(i);
        sourceTriangles.push(vertices.get(i)!);
      }
      for (let t = 0; t < next.length; t += 3) patches.push(patch);
    }
    groups.push({ ...group, start, count: triangles.length - start });
  }
  return { ...g, triangles, sourceTriangles, patches, groups };
}

function triangulatePatch(before: Vec3[], after: Vec3[], original: number[]): number[] {
  if (original.length <= 3) return original;
  const ids = [...new Set(original)];
  if (ids.every((i) => before[i].every((n, k) => Math.abs(n - after[i][k]) < 1e-9)))
    return original;
  let n: Vec3 = [0, 0, 0],
    largest = 0;
  for (let t = 0; t < original.length; t += 3) {
    const [a, b, c] = original.slice(t, t + 3).map((i) => before[i]);
    const v = cross(sub(b, a), sub(c, a)),
      area = Math.hypot(...v);
    if (area > largest) {
      largest = area;
      n = unit(v);
    }
  }
  const origin = before[original[0]];
  const span = ids.reduce(
    (extent, i) => Math.max(extent, Math.hypot(...sub(before[i], origin))),
    0,
  );
  const tolerance = Math.max(1e-5, span * 2e-7);
  // Curved source patches retain their own tessellation. Their perimeter still
  // behaves as one editable patch; this operation does not flatten a cylinder.
  if (ids.some((i) => Math.abs(dot(sub(before[i], origin), n)) > tolerance)) return original;
  const edges = new Map<string, { a: number; b: number; count: number }>();
  for (let t = 0; t < original.length; t += 3)
    for (let j = 0; j < 3; j++) {
      const a = original[t + j],
        b = original[t + ((j + 1) % 3)],
        key = edgeKey(a, b),
        e = edges.get(key);
      if (e) e.count++;
      else edges.set(key, { a, b, count: 1 });
    }
  const boundary = [...edges.values()].filter((e) => e.count === 1),
    next = new Map<number, number>();
  for (const e of boundary) {
    if (next.has(e.a)) throw failure();
    next.set(e.a, e.b);
  }
  const loops: number[][] = [];
  while (next.size) {
    const start = next.keys().next().value!;
    const loop: number[] = [];
    let at = start;
    do {
      loop.push(at);
      const end = next.get(at);
      if (end === undefined) throw failure();
      next.delete(at);
      at = end;
    } while (at !== start);
    if (loop.length < 3) throw failure();
    loops.push(loop);
  }
  if (!loops.length) return original;
  // A rigidly tilted planar patch needs its new plane. A non-planar edit uses
  // the source plane as its parameterization, with all actual 3D heights kept.
  let candidate: Vec3 = [0, 0, 0];
  for (const loop of loops)
    for (let j = 0; j < loop.length; j++) {
      const v = cross(
        sub(after[loop[j]], after[loop[0]]),
        sub(after[loop[(j + 1) % loop.length]], after[loop[0]]),
      );
      candidate = candidate.map((x, k) => x + v[k]) as Vec3;
    }
  candidate = unit(candidate);
  const planar =
    Math.hypot(...candidate) > 0.5 &&
    ids.every((i) => Math.abs(dot(sub(after[i], after[original[0]]), candidate)) < tolerance);
  if (planar) n = candidate;
  const u = unit(cross(Math.abs(n[0]) < 0.8 ? [1, 0, 0] : [0, 1, 0], n)),
    v = cross(n, u);
  const projected = new Map(
    ids.map((i) => {
      const p = sub(after[i], after[original[0]]);
      return [i, new Vector2(dot(p, u), dot(p, v))] as const;
    }),
  );
  const area = (loop: number[]) => ShapeUtils.area(loop.map((i) => projected.get(i)!));
  loops.sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)));
  const flat = loops.flat(),
    contours = loops.map((l) => l.map((i) => projected.get(i)!));
  let result = ShapeUtils.triangulateShape(contours[0], contours.slice(1)).map((t) =>
    t.map((i) => flat[i]),
  );
  const signed = (t: number[]) =>
    orient(...(t.map((i) => projected.get(i)!) as [Vector2, Vector2, Vector2]));
  result = result.map((t) => (signed(t) < 0 ? [t[0], t[2], t[1]] : t));
  // Earcut may omit collinear perimeter vertices. They are real edit anchors,
  // including a lifted midpoint whose projection still lies on a straight edge.
  const used = new Set(result.flat());
  for (const id of flat.filter((i) => !used.has(i))) {
    const p = projected.get(id)!;
    const counts = new Map<string, number>();
    result.forEach((t) =>
      t.forEach((a, j) => {
        const key = edgeKey(a, t[(j + 1) % 3]);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }),
    );
    let inserted = false;
    result = result.flatMap((t) => {
      for (let j = 0; j < 3; j++) {
        const a = t[j],
          b = t[(j + 1) % 3],
          c = t[(j + 2) % 3],
          pa = projected.get(a)!,
          pb = projected.get(b)!;
        if (counts.get(edgeKey(a, b)) !== 1) continue;
        const length = pa.distanceTo(pb);
        if (
          Math.abs(orient(pa, pb, p)) <= Math.max(1e-8, length * tolerance) &&
          p.clone().sub(pa).dot(p.clone().sub(pb)) < -1e-12
        ) {
          inserted = true;
          return [
            [a, id, c],
            [id, b, c],
          ];
        }
      }
      return [t];
    });
    if (!inserted) throw failure();
  }
  // Preserve existing interior control points instead of silently discarding
  // mesh detail. A point lying on a new diagonal splits both adjacent triangles.
  const boundaryIds = new Set(flat);
  for (const id of ids.filter((i) => !boundaryIds.has(i))) {
    const p = projected.get(id)!;
    let inserted = false;
    result = result.flatMap((t) => {
      const signs = t.map((a, j) => orient(projected.get(a)!, projected.get(t[(j + 1) % 3])!, p));
      if (signs.some((s) => s < -1e-8)) return [t];
      inserted = true;
      return t.flatMap((a, j) => (signs[j] > 1e-8 ? [[a, t[(j + 1) % 3], id]] : []));
    });
    if (!inserted) throw failure();
  }
  // Prefer local triangles around an out-of-plane boundary edit. A former fan
  // must not spread one raised rim point across the whole disk. Constrained
  // flips also improve slender planar triangles without crossing any boundary.
  const heights = ids.map((i) => dot(after[i], n)).sort((a, b) => a - b),
    median = heights[Math.floor(heights.length / 2)];
  const displaced = new Set(
    planar ? [] : ids.filter((i) => Math.abs(dot(after[i], n) - median) > tolerance),
  );
  const symmetric =
    !planar && loops.length === 1 && flat.length === ids.length
      ? symmetricPatchTriangles(
          area(loops[0]) < 0 ? [...loops[0]].reverse() : loops[0],
          before,
          after,
          projected,
          displaced,
          tolerance,
        )
      : undefined;
  if (symmetric) result = symmetric;
  const cost = (t: number[]) => {
    const p = t.map((i) => projected.get(i)!);
    const a = Math.abs(signed(t));
    const shape =
      p.reduce((s, q, j) => s + q.distanceToSquared(p[(j + 1) % 3]), 0) / Math.max(a, 1e-12);
    return { affected: t.some((i) => displaced.has(i)) ? a : 0, shape };
  };
  // Independent flips would reintroduce the asymmetric crease we just avoided.
  for (let iteration = 0; iteration < (symmetric ? 0 : 12); iteration++) {
    const adjacency = new Map<string, number[]>();
    result.forEach((t, i) =>
      t.forEach((a, j) => {
        const key = edgeKey(a, t[(j + 1) % 3]);
        const list = adjacency.get(key) ?? [];
        list.push(i);
        adjacency.set(key, list);
      }),
    );
    let changed = false;
    const touched = new Set<number>();
    for (const [key, pair] of adjacency) {
      if (pair.length !== 2 || pair.some((i) => touched.has(i))) continue;
      const [a, b] = key.split(':').map(Number),
        [i, j] = pair;
      const c = result[i].find((x) => x !== a && x !== b)!,
        d = result[j].find((x) => x !== a && x !== b)!;
      if (c === d || adjacency.has(edgeKey(c, d))) continue;
      const pc = projected.get(c)!,
        pd = projected.get(d)!;
      if (orient(pc, pd, projected.get(a)!) * orient(pc, pd, projected.get(b)!) >= -1e-12) continue;
      const alternatives = [
        [c, d, a],
        [d, c, b],
      ].map((t) => (signed(t) < 0 ? [t[0], t[2], t[1]] : t));
      const old = [cost(result[i]), cost(result[j])],
        fresh = alternatives.map(cost);
      const delta = fresh[0].affected + fresh[1].affected - old[0].affected - old[1].affected;
      if (
        delta < -1e-8 ||
        (Math.abs(delta) < 1e-8 &&
          fresh[0].shape + fresh[1].shape < old[0].shape + old[1].shape - 1e-6)
      ) {
        [result[i], result[j]] = alternatives;
        changed = true;
        touched.add(i);
        touched.add(j);
      }
    }
    if (!changed) break;
  }
  // Earcut intentionally tolerates some malformed polygons. Editing cannot:
  // every boundary (including every hole) and every control point must survive.
  const counts = new Map<string, number>();
  for (const t of result)
    for (let j = 0; j < 3; j++) {
      const key = edgeKey(t[j], t[(j + 1) % 3]);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  if (
    boundary.some((e) => counts.get(edgeKey(e.a, e.b)) !== 1) ||
    [...counts].some(([key, count]) => count > 2 || (count === 1 && edges.get(key)?.count !== 1))
  )
    throw failure();
  if (new Set(result.flat()).size !== ids.length) throw failure();
  return result.flat();
}
