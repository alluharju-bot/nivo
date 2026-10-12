import {
  BufferGeometry,
  Float32BufferAttribute,
  EdgesGeometry,
  Matrix3,
  Matrix4,
  Quaternion,
  Vector3,
} from 'three';
import { bodySchema, type Body, type Vec3 } from '../model/project';
import type { BodyMesh } from '../cad/protocol';
import { transformQuantityBasis } from '../model/quantityBasis';

export function meshGeometry(body: Body) {
  if (body.feature.type !== 'mesh') throw new Error('Kolmiomalli puuttuu.');
  const f = body.feature,
    geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(f.vertices, 3));
  geometry.setIndex(f.triangles);
  if (f.normals) geometry.setAttribute('normal', new Float32BufferAttribute(f.normals, 3));
  else geometry.computeVertexNormals();
  if (f.uv) geometry.setAttribute('uv', new Float32BufferAttribute(f.uv, 2));
  return geometry;
}
/** Topology uses welded geometric vertices, since STL duplicates every corner. */
export function meshClosure(vertices: ArrayLike<number>, indices: ArrayLike<number>) {
  const welded = new Map<string, number>(),
    ids: number[] = [],
    edges = new Map<string, number>();
  for (let i = 0; i < vertices.length; i += 3) {
    const key = [0, 1, 2].map((a) => Math.round(vertices[i + a] * 100000)).join(',');
    if (!welded.has(key)) welded.set(key, welded.size);
    ids.push(welded.get(key)!);
  }
  let degenerate = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const triangle = [ids[indices[i]], ids[indices[i + 1]], ids[indices[i + 2]]];
    if (new Set(triangle).size < 3) {
      degenerate++;
      continue;
    }
    for (let k = 0; k < 3; k++) {
      const a = triangle[k],
        b = triangle[(k + 1) % 3],
        key = `${Math.min(a, b)},${Math.max(a, b)}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  const openEdges = [...edges.values()].filter((count) => count !== 2).length;
  return { closed: !openEdges && !degenerate && !!indices.length, openEdges, degenerate };
}
export function meshBody(body: Body): BodyMesh {
  const geometry = meshGeometry(body);
  geometry.translate(...body.origin);
  const vertices = Array.from(geometry.getAttribute('position').array);
  const triangles = Array.from(geometry.index!.array);
  const edges = new EdgesGeometry(geometry, 25);
  const lines = Array.from(edges.getAttribute('position').array);
  edges.dispose();
  const v = (i: number) => vertices.slice(i * 3, i * 3 + 3) as Vec3;
  // Compact feature points: visible crease endpoints, capped for large imported assets.
  const byPoint = new Map<string, number>();
  for (let i = 0; i < vertices.length / 3; i++)
    byPoint.set(
      v(i)
        .map((n) => n.toFixed(4))
        .join(','),
      i,
    );
  const anchor = (p: Vec3) => {
    const index = byPoint.get(p.map((n) => n.toFixed(4)).join(',')) ?? 0;
    return {
      bodyId: body.id,
      key: `mesh:${index}`,
      local: p.map((n, a) => n - body.origin[a]) as Vec3,
    };
  };
  const points = new Map<string, Vec3>();
  const edgesCAD: BodyMesh['edgesCAD'] = [];
  for (let i = 0; i < lines.length && edgesCAD.length < 10000; i += 6) {
    const start = lines.slice(i, i + 3) as Vec3,
      end = lines.slice(i + 3, i + 6) as Vec3;
    points.set(start.join(','), start);
    points.set(end.join(','), end);
    edgesCAD.push({ start, end, from: anchor(start), to: anchor(end) });
  }
  let volume = 0;
  const a = new Vector3(),
    b = new Vector3(),
    c = new Vector3();
  for (let i = 0; i < triangles.length; i += 3)
    volume +=
      a
        .fromArray(vertices, triangles[i] * 3)
        .dot(
          b
            .fromArray(vertices, triangles[i + 1] * 3)
            .cross(c.fromArray(vertices, triangles[i + 2] * 3)),
        ) / 6;
  const result: BodyMesh = {
    id: body.id,
    vertices,
    normals: Array.from(geometry.getAttribute('normal').array),
    triangles,
    edges: lines,
    faces: (
      (body.feature.type === 'mesh' && body.feature.groups) || [
        { start: 0, count: triangles.length },
      ]
    ).map((g, index) => ({
      ...g,
      index,
      ref: `surface:${index}`,
      normal: [0, 0, 1],
      center: body.origin.map(
        (n, i) => n + [body.feature.width, body.feature.depth, body.feature.height][i] / 2,
      ) as Vec3,
      planar: false,
    })),
    volume: Math.abs(volume),
    verticesCAD: [...points.values()].map((point) => ({ point, anchor: anchor(point) })),
    midpointsCAD: [],
    edgesCAD,
    boundaries: [],
  };
  geometry.dispose();
  return result;
}
export function transformMesh(body: Body, matrix: Matrix4): Body {
  if (body.feature.type !== 'mesh') throw new Error('Kolmiomalli puuttuu.');
  const f = body.feature,
    min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  const offset = new Vector3(...body.origin);
  const p = new Vector3(),
    normal = new Matrix3().getNormalMatrix(matrix);
  const vertices: number[] = [],
    normals: number[] = [];
  for (let i = 0; i < f.vertices.length; i += 3) {
    p.fromArray(f.vertices, i).add(offset).applyMatrix4(matrix);
    p.toArray().forEach((n, a) => {
      min[a] = Math.min(min[a], n);
      max[a] = Math.max(max[a], n);
    });
    vertices.push(p.x, p.y, p.z);
    if (f.normals) {
      p.fromArray(f.normals, i).applyNormalMatrix(normal);
      normals.push(p.x, p.y, p.z);
    }
  }
  const origin = min as Vec3;
  const local = (point: Vec3) =>
    new Vector3(...point)
      .add(new Vector3(...body.origin))
      .applyMatrix4(matrix)
      .sub(new Vector3(...origin))
      .toArray() as Vec3;
  const rotation = new Quaternion().setFromRotationMatrix(new Matrix4().extractRotation(matrix));
  const next = bodySchema.parse({
    ...body,
    origin,
    feature: {
      ...f,
      width: max[0] - min[0],
      depth: max[1] - min[1],
      height: max[2] - min[2],
      vertices: vertices.map((n, i) => n - min[i % 3]),
      normals: f.normals ? normals : undefined,
    },
    component: body.component
      ? {
          ...body.component,
          offset: local(body.component.offset),
          rotation: rotation
            .clone()
            .multiply(new Quaternion(...body.component.rotation))
            .toArray(),
        }
      : undefined,
    textureFrame: {
      offset: local(body.textureFrame?.offset ?? [0, 0, 0]),
      rotation: rotation
        .clone()
        .multiply(new Quaternion(...(body.textureFrame?.rotation ?? [0, 0, 0, 1])))
        .toArray(),
    },
    vertexRefs: Object.fromEntries(
      Object.entries(body.vertexRefs ?? {}).map(([key, value]) => [key, local(value)]),
    ),
  });
  next.quantityBasis = transformQuantityBasis(
    body,
    next,
    (v) => new Vector3(...v).applyMatrix3(new Matrix3().setFromMatrix4(matrix)).toArray() as Vec3,
  );
  return next;
}
export const around = (pivot: Vec3, matrix: Matrix4) =>
  new Matrix4()
    .makeTranslation(...pivot)
    .multiply(matrix)
    .multiply(new Matrix4().makeTranslation(-pivot[0], -pivot[1], -pivot[2]));
