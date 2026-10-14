import {
  Box3,
  BufferGeometry,
  BufferAttribute,
  Float32BufferAttribute,
  Matrix4,
  Quaternion,
  Vector3,
} from 'three';
import { ExtendedTriangle, MeshBVH } from 'three-mesh-bvh';
import { bodySchema, type Body, type Vec3 } from './project';
import type { BodyMesh } from '../cad/protocol';
import { add, sub, dot, unit } from './geometry';
import { cross } from './transforms';
import { orderedQuantityBasis, stockAxes } from './quantityBasis';
import { cutGeometryKey } from './cutting';

export type GeometrySelection = 'points' | 'edges' | 'faces';
export type GeometryOperation = 'move' | 'rotate' | 'scale';
export interface EditableGeometry {
  points: Vec3[];
  triangles: number[];
  /** Maps the original render vertices to welded editing points, retaining UV seams. */
  vertexMap: number[];
  sourceTriangles: number[];
  patches: number[];
  groups: { start: number; count: number; face: number }[];
  exact: boolean;
  solid: boolean;
}
export interface EditingEdge {
  a: number;
  b: number;
  triangles: number[];
  boundary: boolean;
}
export const geometryLimits = { points: 30000, triangles: 60000, cadTriangles: 4000 };

export function editableGeometry(
  body: Body,
  mesh: Pick<BodyMesh, 'vertices' | 'triangles' | 'faces'>,
  exact: boolean,
): EditableGeometry {
  if (!mesh.triangles.length)
    throw new Error('Valitse osa, jossa on pinta. Pelkkää viivaa ei voi muokata tällä työkalulla.');
  if (mesh.triangles.length / 3 > (exact ? geometryLimits.cadTriangles : geometryLimits.triangles))
    throw new Error(
      'Osassa on liikaa pintoja tarkkaan pistemuokkaukseen. Käytä kevyempää mallia tai muokkaa pienempää erillisosaa.',
    );
  const points: Vec3[] = [],
    vertexMap: number[] = [],
    byPosition = new Map<string, number>();
  for (let i = 0; i < mesh.vertices.length; i += 3) {
    const point = mesh.vertices.slice(i, i + 3) as Vec3;
    const key = point.map((n) => Math.round(n * 1e6)).join(',');
    let id = byPosition.get(key);
    if (id === undefined) {
      id = points.length;
      byPosition.set(key, id);
      points.push(point);
    }
    vertexMap.push(id);
  }
  if (points.length > geometryLimits.points)
    throw new Error(
      'Pistemuokkauksessa voi olla enintään 30 000 pistettä. Käytä kevyempää mallia.',
    );
  const triangles = mesh.triangles.map((i) => vertexMap[i]);
  const groups = mesh.faces.map((f) => ({ start: f.start, count: f.count, face: f.index }));
  const patches = new Array(triangles.length / 3).fill(-1);
  for (const [i, group] of groups.entries())
    for (let t = group.start / 3; t < (group.start + group.count) / 3; t++) patches[t] = i;
  const result = {
    points,
    triangles,
    vertexMap,
    sourceTriangles: [...mesh.triangles],
    patches,
    groups,
    exact,
    solid: body.feature.type === 'mesh' ? body.feature.solid : meshClosed(triangles),
  };
  // Imported meshes often have only one material group: select connected planar
  // patches, not the whole part just because its colour is shared.
  if (body.feature.type === 'mesh') result.patches = planarPatches(result);
  return result;
}
function normal(g: EditableGeometry, t: number) {
  const [a, b, c] = g.triangles.slice(t * 3, t * 3 + 3).map((i) => g.points[i]);
  return unit(cross(sub(b, a), sub(c, a)));
}
export function geometryEdges(g: EditableGeometry, all = false): EditingEdge[] {
  const map = new Map<string, EditingEdge>();
  for (let i = 0; i < g.triangles.length; i += 3)
    for (let j = 0; j < 3; j++) {
      const a = g.triangles[i + j],
        b = g.triangles[i + ((j + 1) % 3)],
        key = `${Math.min(a, b)}:${Math.max(a, b)}`;
      const edge = map.get(key);
      if (edge) edge.triangles.push(i / 3);
      else map.set(key, { a, b, triangles: [i / 3], boundary: false });
    }
  for (const edge of map.values()) edge.boundary = edge.triangles.length === 1;
  return [...map.values()].filter(
    (e) =>
      all ||
      e.triangles.length !== 2 ||
      g.patches[e.triangles[0]] !== g.patches[e.triangles[1]] ||
      dot(normal(g, e.triangles[0]), normal(g, e.triangles[1])) < 0.99999,
  );
}
function planarPatches(g: EditableGeometry) {
  const parents = Array.from({ length: g.triangles.length / 3 }, (_, i) => i);
  const root = (i: number): number => {
    while (parents[i] !== i) {
      parents[i] = parents[parents[i]];
      i = parents[i];
    }
    return i;
  };
  const normals = parents.map((i) => normal(g, i));
  for (const e of geometryEdges(g, true))
    if (e.triangles.length === 2) {
      const [a, b] = e.triangles;
      if (dot(normals[a], normals[b]) > 1 - 1e-7) parents[root(b)] = root(a);
    }
  return parents.map((_, i) => root(i));
}
export function patchPoints(g: EditableGeometry, triangle: number): number[] {
  const patch = g.patches[triangle],
    ids = new Set<number>();
  g.patches.forEach((p, t) => {
    if (p === patch) g.triangles.slice(t * 3, t * 3 + 3).forEach((i) => ids.add(i));
  });
  return [...ids];
}
/** Follow a boundary or a smooth continuation; stop at ambiguous sharp branches. */
export function edgeLoop(edges: EditingEdge[], chosen: number, positions?: Vec3[]): number[] {
  const first = edges[chosen];
  if (!first) return [];
  const adjacency = new Map<number, number[]>();
  edges.forEach((e, i) =>
    [e.a, e.b].forEach((v) => adjacency.set(v, [...(adjacency.get(v) ?? []), i])),
  );
  const points = new Set([first.a, first.b]),
    visited = new Set([chosen]);
  const walk = (start: number, previous: number) => {
    let at = start;
    while (true) {
      const links = adjacency.get(at) ?? [];
      const candidates = links.filter((i) => !visited.has(i));
      let next = links.length === 2 ? candidates[0] : undefined;
      if (links.length > 2 && positions) {
        const direction = unit(sub(positions[at], positions[previous]));
        const ranked = candidates
          .map((i) => {
            const e = edges[i],
              end = e.a === at ? e.b : e.a;
            return { i, score: dot(direction, unit(sub(positions[end], positions[at]))) };
          })
          .sort((a, b) => b.score - a.score);
        // Continue a cylinder rim through its seam, but not through a box corner
        // or two equally plausible branches.
        if (ranked[0]?.score > 0.7 && (!ranked[1] || ranked[0].score - ranked[1].score > 0.1))
          next = ranked[0].i;
      }
      if (next === undefined) break;
      visited.add(next);
      const e = edges[next];
      previous = at;
      at = e.a === at ? e.b : e.a;
      points.add(at);
    }
  };
  walk(first.a, first.b);
  walk(first.b, first.a);
  return [...points];
}
export function selectionCenter(points: Vec3[], ids: number[]): Vec3 {
  if (!ids.length) return [0, 0, 0];
  const box = new Box3().setFromPoints(ids.map((i) => new Vector3(...points[i])));
  return box.getCenter(new Vector3()).toArray();
}
export function transformGeometryPoints(points: Vec3[], ids: number[], matrix: Matrix4): Vec3[] {
  const chosen = new Set(ids);
  return points.map((point, i) =>
    chosen.has(i) ? new Vector3(...point).applyMatrix4(matrix).toArray() : point,
  );
}
export function geometryMatrix(
  operation: GeometryOperation,
  values: Vec3,
  pivot: Vec3,
  rotation: [number, number, number, number] = [0, 0, 0, 1],
) {
  if ([...values, ...pivot].some((n) => !Number.isFinite(n)))
    throw new Error('Anna äärelliset mitat.');
  if (operation === 'scale' && values.some((n) => n <= 0 || n > 1000))
    throw new Error('Skaalauksen tulee olla suurempi kuin 0 % ja enintään 100 000 %.');
  const frame = new Matrix4().makeRotationFromQuaternion(new Quaternion(...rotation));
  const local =
    operation === 'move'
      ? new Matrix4().makeTranslation(...values)
      : operation === 'scale'
        ? new Matrix4().makeScale(...values)
        : new Matrix4()
            .makeRotationZ((values[2] * Math.PI) / 180)
            .multiply(new Matrix4().makeRotationY((values[1] * Math.PI) / 180))
            .multiply(new Matrix4().makeRotationX((values[0] * Math.PI) / 180));
  return new Matrix4()
    .makeTranslation(...pivot)
    .multiply(frame)
    .multiply(local)
    .multiply(frame.clone().invert())
    .multiply(new Matrix4().makeTranslation(...(pivot.map((n) => -n) as Vec3)));
}
export function meshClosed(triangles: number[]) {
  const edges = new Map<string, { count: number; direction: number }>();
  for (let i = 0; i < triangles.length; i += 3)
    for (let j = 0; j < 3; j++) {
      const a = triangles[i + j],
        b = triangles[i + ((j + 1) % 3)],
        key = `${Math.min(a, b)}:${Math.max(a, b)}`;
      const e = edges.get(key) ?? { count: 0, direction: 0 };
      e.count++;
      e.direction += a < b ? 1 : -1;
      edges.set(key, e);
    }
  return edges.size > 0 && [...edges.values()].every((e) => e.count === 2 && e.direction === 0);
}
export function geometryVolume(g: EditableGeometry, points = g.points) {
  let volume = 0;
  const origin = points[0];
  for (let t = 0; t < g.triangles.length; t += 3) {
    const [a, b, c] = g.triangles.slice(t, t + 3).map((i) => sub(points[i], origin));
    volume += dot(a, cross(b, c)) / 6;
  }
  return volume;
}
/** Called on accept in the CAD worker, never for every pointer event. */
export function validateGeometry(g: EditableGeometry, points: Vec3[]) {
  if (
    points.length !== g.points.length ||
    points.some((p) => p.length !== 3 || p.some((n) => !Number.isFinite(n) || Math.abs(n) > 100000))
  )
    throw new Error('Pisteiden mitat tai sijainti eivät ole sallituissa rajoissa.');
  const unique = new Set(points.map((p) => p.map((n) => Math.round(n * 1e6)).join(',')));
  if (unique.size !== points.length)
    throw new Error(
      'Pisteet osuvat yhteen. Siirrä niitä erilleen; pisteiden yhdistäminen on erillinen toiminto.',
    );
  const vertices = points.flat(),
    geometry = new BufferGeometry().setAttribute(
      'position',
      new BufferAttribute(new Float64Array(vertices), 3),
    );
  geometry.setIndex(g.triangles);
  const a = new ExtendedTriangle(),
    b = new ExtendedTriangle(),
    box = new Box3();
  try {
    const bvh = new MeshBVH(geometry, { indirect: true });
    let checks = 0;
    for (let i = 0; i < g.triangles.length / 3; i++) {
      const tri = g.triangles.slice(i * 3, i * 3 + 3).map((index) => new Vector3(...points[index]));
      a.set(...(tri as [Vector3, Vector3, Vector3]));
      a.needsUpdate = true;
      if (a.getArea() < 1e-8)
        throw new Error('Muutos litistää pinnan tai reunan nollakokoiseksi. Pienennä muutosta.');
      box.setFromPoints(tri);
      const center = a.getMidpoint(new Vector3());
      // Shrink very slightly so ordinary shared edges/vertices are not collisions.
      a.a.lerp(center, 1e-7);
      a.b.lerp(center, 1e-7);
      a.c.lerp(center, 1e-7);
      a.needsUpdate = true;
      const crossed = bvh.shapecast({
        intersectsBounds: (b) => b.intersectsBox(box),
        intersectsTriangle: (triangle, index) => {
          if (index <= i) return false;
          if (++checks > 2000000)
            throw new Error('Pintojen törmäystarkistus on liian laaja. Muokkaa pienempää osaa.');
          const ids = g.triangles.slice(i * 3, i * 3 + 3);
          const other = g.triangles.slice(index * 3, index * 3 + 3);
          const shared = ids.filter((v) => other.includes(v));
          if (shared.length === 3) return true;
          if (shared.length === 2) {
            // Straight triangles meeting at an edge can only overlap away from
            // it when they fold onto the same half-plane. Testing this directly
            // avoids cancellation in near-coplanar cylinder tessellations.
            const origin = points[shared[0]],
              edge = sub(points[shared[1]], origin);
            const sideA = unit(
              cross(edge, sub(points[ids.find((v) => !shared.includes(v))!], origin)),
            );
            const sideB = unit(
              cross(edge, sub(points[other.find((v) => !shared.includes(v))!], origin)),
            );
            return dot(sideA, sideB) > 1 - 1e-10;
          }
          b.copy(triangle);
          const center = b.getMidpoint(new Vector3());
          b.a.lerp(center, 1e-7);
          b.b.lerp(center, 1e-7);
          b.c.lerp(center, 1e-7);
          b.needsUpdate = true;
          return a.intersectsTriangle(b);
        },
      });
      if (crossed)
        throw new Error('Pinnat leikkaavat toisiaan. Pienennä muutosta tai vaihda suuntaa.');
    }
  } finally {
    geometry.dispose();
  }
  if (g.solid) {
    // A mesh may contain several disjoint closed shells (or an internal cavity).
    // Check each orientation: a larger shell must not hide a smaller inverted one.
    const parents = g.points.map((_, i) => i);
    const root = (i: number): number => {
      while (parents[i] !== i) {
        parents[i] = parents[parents[i]];
        i = parents[i];
      }
      return i;
    };
    for (let i = 0; i < g.triangles.length; i += 3) {
      const [a, b, c] = g.triangles.slice(i, i + 3);
      parents[root(b)] = root(a);
      parents[root(c)] = root(a);
    }
    const shells = new Map<number, number[]>();
    for (let i = 0; i < g.triangles.length; i += 3) {
      const r = root(g.triangles[i]),
        triangles = shells.get(r) ?? [];
      triangles.push(...g.triangles.slice(i, i + 3));
      shells.set(r, triangles);
    }
    for (const triangles of shells.values()) {
      const shell = { ...g, triangles },
        before = geometryVolume(shell),
        after = geometryVolume(shell, points);
      if (Math.abs(after) < 1e-7 || before * after <= 0)
        throw new Error('Muutos kääntää kappaleen kuoren nurin tai poistaa sen tilavuuden.');
    }
  }
}
export function geometryMeshBody(body: Body, g: EditableGeometry, points: Vec3[]): Body {
  const min: Vec3 = [Infinity, Infinity, Infinity],
    max: Vec3 = [-Infinity, -Infinity, -Infinity];
  points.forEach((p) =>
    p.forEach((n, i) => {
      min[i] = Math.min(min[i], n);
      max[i] = Math.max(max[i], n);
    }),
  );
  const vertices = g.vertexMap.flatMap((i) => sub(points[i], min));
  const geo = new BufferGeometry().setAttribute(
    'position',
    new Float32BufferAttribute(vertices, 3),
  );
  geo.setIndex(g.sourceTriangles);
  geo.computeVertexNormals();
  try {
    const oldMesh = body.feature.type === 'mesh' ? body.feature : undefined;
    const faceMaterials = Object.fromEntries(
      g.groups.flatMap((group, i) =>
        body.faceMaterials?.[group.face] ? [[i, body.faceMaterials[group.face]]] : [],
      ),
    );
    const next = bodySchema.parse({
      ...body,
      origin: min,
      edgeTreatment: undefined,
      curve: undefined,
      curveSnaps: undefined,
      penRegion: undefined,
      linearEdges: undefined,
      vertexRefs: Object.fromEntries(
        Object.entries(body.vertexRefs ?? {}).flatMap(([key, local]) => {
          const world = add(body.origin, local);
          const index = g.points.findIndex((p) => p.every((n, i) => Math.abs(n - world[i]) < 1e-5));
          return index < 0 ? [] : [[key, sub(points[index], min)]];
        }),
      ),
      component: body.component
        ? { ...body.component, offset: sub(add(body.origin, body.component.offset), min) }
        : undefined,
      textureFrame: {
        offset: sub(add(body.origin, body.textureFrame?.offset ?? [0, 0, 0]), min),
        rotation: body.textureFrame?.rotation ?? [0, 0, 0, 1],
      },
      faceMaterials: Object.keys(faceMaterials).length ? faceMaterials : undefined,
      feature: {
        type: 'mesh',
        width: max[0] - min[0],
        depth: max[1] - min[1],
        height: max[2] - min[2],
        vertices,
        triangles: g.sourceTriangles,
        normals: Array.from(geo.getAttribute('normal').array),
        uv: oldMesh?.uv,
        groups: g.groups.map(({ start, count }) => ({ start, count })),
        solid: meshClosed(g.triangles),
      },
    });
    if (!body.quantityBasis?.manual) {
      const axes = stockAxes(body);
      next.quantityBasis = orderedQuantityBasis({
        axes,
        dimensions: axes.map((axis) => {
          let lo = Infinity,
            hi = -Infinity;
          points.forEach((p) => {
            const v = dot(sub(p, min), axis);
            lo = Math.min(lo, v);
            hi = Math.max(hi, v);
          });
          return hi - lo;
        }) as Vec3,
        geometryKey: cutGeometryKey(next),
      });
    }
    return next;
  } finally {
    geo.dispose();
  }
}
