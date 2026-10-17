import {
  BufferGeometry,
  Float32BufferAttribute,
  Vector3,
  SphereGeometry,
  CircleGeometry,
  CylinderGeometry,
  Matrix4,
} from 'three';
import { SimplifyModifier } from 'three/addons/modifiers/SimplifyModifier.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { bodySchema, uid, type Body, type Vec3 } from '../model/project';
import type { BodyMesh } from '../cad/protocol';
import { meshClosure } from '../exchange/mesh';

/** Coordinates stay in the source part's local millimetre frame throughout the workflow. */
export interface SurfaceMesh {
  positions: number[];
  normals: number[];
  indices: number[];
  uv?: number[];
  /** Protected render vertices, shared across coincident UV seams. */
  mask?: number[];
  /** One original CAD/material face per triangle; survives splitting and UV seams. */
  faces: number[];
}
export const surfaceLimits = { triangles: 60000, vertices: 65000, texture: 1024 };
export function geometryOf(mesh: SurfaceMesh) {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(mesh.positions, 3));
  g.setAttribute('normal', new Float32BufferAttribute(mesh.normals, 3));
  if (mesh.uv) g.setAttribute('uv', new Float32BufferAttribute(mesh.uv, 2));
  g.setIndex(mesh.indices);
  return g;
}
export function readGeometry(g: BufferGeometry): SurfaceMesh {
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  const positions = Array.from(g.getAttribute('position').array);
  const indices = g.index
    ? Array.from(g.index.array)
    : positions.filter((_, i) => i % 3 === 0).map((_, i) => i);
  return {
    positions,
    indices,
    normals: Array.from(g.getAttribute('normal').array),
    uv: g.getAttribute('uv') ? Array.from(g.getAttribute('uv').array) : undefined,
    faces: new Array(indices.length / 3).fill(0),
  };
}
export function fromBodyMesh(body: Body, mesh: BodyMesh): SurfaceMesh {
  const faces = new Array(mesh.triangles.length / 3).fill(0);
  for (const face of mesh.faces)
    for (let t = face.start / 3; t < (face.start + face.count) / 3; t++) faces[t] = face.index;
  return {
    positions:
      body.feature.type === 'mesh'
        ? [...body.feature.vertices]
        : mesh.vertices.map((n, i) => n - body.origin[i % 3]),
    normals: [...mesh.normals],
    indices: [...mesh.triangles],
    faces,
    uv: body.feature.type === 'mesh' ? body.feature.uv : undefined,
    mask: body.surfaceWorkflow?.mask,
  };
}
export function meshBounds(m: SurfaceMesh) {
  const min: Vec3 = [Infinity, Infinity, Infinity],
    max: Vec3 = [-Infinity, -Infinity, -Infinity];
  m.positions.forEach((n, i) => {
    min[i % 3] = Math.min(min[i % 3], n);
    max[i % 3] = Math.max(max[i % 3], n);
  });
  return {
    min,
    max,
    center: min.map((n, i) => (n + max[i]) / 2) as Vec3,
    size: min.map((n, i) => max[i] - n) as Vec3,
  };
}
export function checkMesh(m: SurfaceMesh) {
  if (
    m.mask &&
    (m.mask.length !== m.positions.length / 3 ||
      m.mask.some((n) => !Number.isFinite(n) || n < 0 || n > 1))
  )
    throw new Error('Suojausmaski ei vastaa verkkoa.');
  if (
    !m.indices.length ||
    m.indices.length % 3 ||
    m.positions.length % 3 ||
    m.normals.length !== m.positions.length ||
    m.faces.length !== m.indices.length / 3
  )
    throw new Error('Verkon rakenne on virheellinen.');
  if (
    m.indices.length / 3 > surfaceLimits.triangles ||
    m.positions.length / 3 > surfaceLimits.vertices
  )
    throw new Error(
      'Työversion raja on 60 000 kolmiota ja 65 000 pistettä. Kevennä verkkoa ensin.',
    );
  if (
    m.positions.some((n) => !Number.isFinite(n) || Math.abs(n) > 200000) ||
    m.normals.some((n) => !Number.isFinite(n)) ||
    m.indices.some((i) => !Number.isInteger(i) || i < 0 || i >= m.positions.length / 3)
  )
    throw new Error('Verkossa on virheellisiä pisteitä.');
  if (
    m.uv &&
    (m.uv.length !== (m.positions.length / 3) * 2 || m.uv.some((n) => !Number.isFinite(n)))
  )
    throw new Error('UV-kartta ei vastaa verkkoa.');
  const a = new Vector3(),
    b = new Vector3(),
    c = new Vector3();
  for (let t = 0; t < m.indices.length; t += 3) {
    a.fromArray(m.positions, m.indices[t] * 3);
    b.fromArray(m.positions, m.indices[t + 1] * 3);
    c.fromArray(m.positions, m.indices[t + 2] * 3);
    if (b.sub(a).cross(c.sub(a)).lengthSq() < 1e-20)
      throw new Error(
        'Verkossa on nollakokoinen pinta. Peru muutos tai pienennä sen voimakkuutta.',
      );
  }
}
export function primitiveMesh(
  kind: 'circle' | 'sphere' | 'cylinder',
  radius: number,
  height: number,
  segments: number,
  center: Vec3 = [0, 0, 0],
): SurfaceMesh {
  if (
    !Number.isFinite(radius) ||
    radius <= 0 ||
    !Number.isFinite(height) ||
    (kind === 'cylinder' && height <= 0) ||
    !Number.isInteger(segments) ||
    segments < 3 ||
    segments > 128
  )
    throw new Error('Anna säde ja korkeus positiivisina sekä 3–128 sivua.');
  const g =
    kind === 'circle'
      ? new CircleGeometry(radius, segments)
      : kind === 'sphere'
        ? new SphereGeometry(radius, segments, Math.max(2, Math.round(segments / 2)))
        : new CylinderGeometry(radius, radius, height, segments, 1);
  if (kind !== 'circle') g.rotateX(Math.PI / 2);
  g.translate(...center);
  try {
    const result = readGeometry(g);
    delete result.uv;
    checkMesh(result);
    return result;
  } finally {
    g.dispose();
  }
}
export async function simplifyMesh(m: SurfaceMesh, keep: number): Promise<SurfaceMesh> {
  if (m.mask?.some((n) => n > 0))
    throw new Error(
      'Poista suojausmaski ennen pistevähennystä. Kevennys muuttaa suojattuja pisteitä.',
    );
  if (!Number.isFinite(keep) || keep < 0.05 || keep > 1)
    throw new Error('Säilytä 5–100 % pisteistä.');
  if (new Set(m.faces).size > 1)
    throw new Error(
      'Monipintaisen CAD-osan kevennys tehdään verkkotarkkuudella. Yhdistä materiaalit ennen tuodun verkon pistevähennystä.',
    );
  // Collapse only positions. Stale UVs/normal maps must never survive a topology change.
  const source = geometryOf(m);
  source.deleteAttribute('uv');
  source.deleteAttribute('normal');
  const welded = mergeVertices(source, 1e-6);
  source.dispose();
  const count = welded.getAttribute('position').count;
  if (count > 12000) {
    welded.dispose();
    throw new Error(
      'Pistevähennys tukee enintään 12 000 lähtöpistettä. CAD-osalle käytä verkkotarkkuutta.',
    );
  }
  const result = await new SimplifyModifier().modify(welded, Math.floor(count * (1 - keep)));
  welded.dispose();
  try {
    const next = readGeometry(result);
    next.faces.fill(m.faces[0] ?? 0);
    checkMesh(next);
    if (
      meshClosure(m.positions, m.indices).closed &&
      !meshClosure(next.positions, next.indices).closed
    )
      throw new Error('Kevennys avaisi suljetun pinnan. Säilytä enemmän pisteitä.');
    return next;
  } finally {
    result.dispose();
  }
}
export function mirrorMesh(
  m: SurfaceMesh,
  axis: number,
  coordinate: number,
  copy: boolean,
): SurfaceMesh {
  if (![0, 1, 2].includes(axis) || !Number.isFinite(coordinate))
    throw new Error('Tarkista peilaustaso.');
  const reflected: SurfaceMesh = {
    ...m,
    positions: m.positions.map((n, i) => (i % 3 === axis ? 2 * coordinate - n : n)),
    normals: m.normals.map((n, i) => (i % 3 === axis ? -n : n)),
    indices: m.indices.map((_, i) => m.indices[i - (i % 3) + (i % 3 === 0 ? 0 : 3 - (i % 3))]),
    uv: m.uv ? [...m.uv] : undefined,
    faces: [...m.faces],
  };
  if (!copy) return reflected;
  return {
    positions: [...m.positions, ...reflected.positions],
    normals: [...m.normals, ...reflected.normals],
    indices: [...m.indices, ...reflected.indices.map((i) => i + m.positions.length / 3)],
    uv: m.uv ? [...m.uv, ...m.uv] : undefined,
    mask: m.mask ? [...m.mask, ...m.mask] : undefined,
    faces: [...m.faces, ...m.faces],
  };
}

/** Bisect the positive half and reflect it, leaving a shared geometric seam. */
export function symmetricMesh(m: SurfaceMesh, axis: number, coordinate: number): SurfaceMesh {
  const bounds = meshBounds(m);
  if (coordinate <= bounds.min[axis] + 1e-7 || coordinate >= bounds.max[axis] - 1e-7)
    throw new Error('Aseta symmetriataso osan sisälle.');
  let divided: SurfaceMesh;
  try {
    divided = cutLoop(m, axis, coordinate);
  } catch (e) {
    if (!(e as Error).message.includes('Taso ei leikkaa')) throw e;
    divided = m;
  }
  const indices: number[] = [],
    faces: number[] = [];
  for (let t = 0; t < divided.indices.length / 3; t++) {
    const ids = divided.indices.slice(t * 3, t * 3 + 3);
    const distances = ids.map((i) => divided.positions[i * 3 + axis] - coordinate);
    if (distances.every((d) => d >= -1e-7) && distances.some((d) => d > 1e-7)) {
      indices.push(...ids);
      faces.push(divided.faces[t]);
    }
  }
  const remap = new Map<number, number>();
  for (const id of indices) if (!remap.has(id)) remap.set(id, remap.size);
  const ids = [...remap.keys()];
  const half: SurfaceMesh = {
    positions: ids.flatMap((i) => divided.positions.slice(i * 3, i * 3 + 3)),
    normals: ids.flatMap((i) => divided.normals.slice(i * 3, i * 3 + 3)),
    indices: indices.map((i) => remap.get(i)!),
    faces,
    mask: divided.mask ? ids.map((i) => divided.mask![i]) : undefined,
  };
  const result = mirrorMesh(half, axis, coordinate, true);
  checkMesh(result);
  if (
    meshClosure(m.positions, m.indices).closed &&
    !meshClosure(result.positions, result.indices).closed
  )
    throw new Error('Puoliskojen rajasta ei tullut yhtenäistä. Siirrä symmetriatasoa.');
  return result;
}

type Vertex = { p: number[]; n: number[]; uv?: number[]; mask?: number };
/** Split intersected triangles on both sides without removing/capping the surface. */
export function cutLoop(m: SurfaceMesh, axis: number, coordinate: number): SurfaceMesh {
  if (![0, 1, 2].includes(axis) || !Number.isFinite(coordinate))
    throw new Error('Tarkista leikkaussilmukan taso.');
  const result: SurfaceMesh = {
    positions: [],
    normals: [],
    indices: [],
    uv: m.uv ? [] : undefined,
    mask: m.mask ? [] : undefined,
    faces: [],
  };
  const vertices = new Map<string, number>();
  let splits = 0;
  const emit = (v: Vertex) => {
    const key = [...v.p, ...v.n, ...(v.uv ?? [])].map((n) => Math.round(n * 1e8)).join(',');
    let index = vertices.get(key);
    if (index === undefined) {
      index = result.positions.length / 3;
      vertices.set(key, index);
      result.positions.push(...v.p);
      result.normals.push(...v.n);
      result.uv?.push(...v.uv!);
      result.mask?.push(v.mask ?? 0);
    }
    return index;
  };
  const triangulate = (polygon: Vertex[], face: number) => {
    for (let i = 1; i < polygon.length - 1; i++) {
      const tri = [polygon[0], polygon[i], polygon[i + 1]];
      const a = new Vector3(...tri[0].p),
        b = new Vector3(...tri[1].p),
        c = new Vector3(...tri[2].p);
      if (b.sub(a).cross(c.sub(a)).lengthSq() < 1e-18) continue;
      result.indices.push(...tri.map(emit));
      result.faces.push(face);
    }
  };
  for (let i = 0; i < m.indices.length; i += 3) {
    const triangle = m.indices.slice(i, i + 3).map((id): Vertex => ({
      p: m.positions.slice(id * 3, id * 3 + 3),
      n: m.normals.slice(id * 3, id * 3 + 3),
      uv: m.uv?.slice(id * 2, id * 2 + 2),
      mask: m.mask?.[id],
    }));
    const distances = triangle.map((v) => v.p[axis] - coordinate);
    if (!distances.some((d) => d < -1e-8) || !distances.some((d) => d > 1e-8)) {
      triangulate(triangle, m.faces[i / 3]);
      continue;
    }
    splits++;
    for (const sign of [-1, 1]) {
      const poly: Vertex[] = [];
      for (let j = 0; j < 3; j++) {
        const a = triangle[j],
          b = triangle[(j + 1) % 3],
          da = distances[j],
          db = distances[(j + 1) % 3];
        if (sign * da >= -1e-8) poly.push(a);
        if ((da < -1e-8 && db > 1e-8) || (db < -1e-8 && da > 1e-8)) {
          const t = da / (da - db),
            mix = (x: number[], y: number[]) => x.map((v, k) => v + (y[k] - v) * t);
          const p = mix(a.p, b.p);
          p[axis] = coordinate;
          poly.push({
            p,
            n: new Vector3(...mix(a.n, b.n)).normalize().toArray(),
            uv: a.uv ? mix(a.uv, b.uv!) : undefined,
            mask: Math.max(a.mask ?? 0, b.mask ?? 0),
          });
        }
      }
      triangulate(poly, m.faces[i / 3]);
    }
  }
  if (!splits) throw new Error('Taso ei leikkaa verkkoa. Siirrä taso osan sisälle.');
  checkMesh(result);
  return result;
}
export function subdivideMesh(m: SurfaceMesh): SurfaceMesh {
  if ((m.indices.length / 3) * 4 > surfaceLimits.triangles)
    throw new Error('Tihennys ylittäisi 60 000 kolmion rajan.');
  const next: SurfaceMesh = {
    positions: [...m.positions],
    normals: [...m.normals],
    indices: [],
    uv: m.uv ? [...m.uv] : undefined,
    faces: [],
    mask: m.mask ? [...m.mask] : undefined,
  };
  const midpoints = new Map<string, number>();
  const midpoint = (a: number, b: number) => {
    const key = [Math.min(a, b), Math.max(a, b)].join(':');
    let id = midpoints.get(key);
    if (id === undefined) {
      id = next.positions.length / 3;
      midpoints.set(key, id);
      for (let k = 0; k < 3; k++)
        next.positions.push((m.positions[a * 3 + k] + m.positions[b * 3 + k]) / 2);
      next.normals.push(
        ...new Vector3(...[0, 1, 2].map((k) => (m.normals[a * 3 + k] + m.normals[b * 3 + k]) / 2))
          .normalize()
          .toArray(),
      );
      if (m.uv) for (let k = 0; k < 2; k++) next.uv!.push((m.uv[a * 2 + k] + m.uv[b * 2 + k]) / 2);
      next.mask?.push(Math.max(m.mask![a], m.mask![b]));
    }
    return id;
  };
  for (let i = 0; i < m.indices.length; i += 3) {
    const [a, b, c] = m.indices.slice(i, i + 3),
      ab = midpoint(a, b),
      bc = midpoint(b, c),
      ca = midpoint(c, a);
    next.indices.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
    next.faces.push(...new Array(4).fill(m.faces[i / 3]));
  }
  checkMesh(next);
  return next;
}
export function sourceStamp(body: Body) {
  const value = JSON.stringify([
    body.feature,
    body.origin,
    body.textureFrame,
    body.appearance,
    body.color,
    body.faceMaterials,
  ]);
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16);
}
export function surfaceBody(source: Body, mesh: SurfaceMesh, id: string = uid()): Body {
  checkMesh(mesh);
  // Atlas packing may reorder triangles. Coalesce material ranges before serialization.
  const order = mesh.faces.map((face, t) => ({ face, t })).sort((a, b) => a.face - b.face);
  mesh = {
    ...mesh,
    indices: order.flatMap(({ t }) => mesh.indices.slice(t * 3, t * 3 + 3)),
    faces: order.map(({ face }) => face),
  };
  const { min, size } = meshBounds(mesh),
    groups: { start: number; count: number }[] = [],
    faceMaterials: Body['faceMaterials'] = {};
  let previous = -1;
  mesh.faces.forEach((face, t) => {
    if (face !== previous || !groups.length) {
      if (source.faceMaterials?.[face]) faceMaterials[groups.length] = source.faceMaterials[face];
      groups.push({ start: t * 3, count: 3 });
      previous = face;
    } else groups.at(-1)!.count += 3;
  });
  return bodySchema.parse({
    ...source,
    id,
    name: `${source.name.slice(0, 100)} · verkko`,
    component: undefined,
    hidden: false,
    locked: false,
    origin: source.origin.map((n, i) => n + min[i]),
    textureFrame: {
      offset: (source.textureFrame?.offset ?? [0, 0, 0]).map((n, i) => n - min[i]),
      rotation: source.textureFrame?.rotation ?? [0, 0, 0, 1],
    },
    faceMaterials: Object.keys(faceMaterials).length ? faceMaterials : undefined,
    edgeTreatment: undefined,
    curve: undefined,
    curveSnaps: undefined,
    penRegion: undefined,
    linearEdges: undefined,
    vertexRefs: undefined,
    quantityBasis: undefined,
    surfaceWorkflow: { sourceId: source.id, sourceStamp: sourceStamp(source), uvAtlas: false },
    feature: {
      type: 'mesh',
      width: size[0],
      depth: size[1],
      height: size[2],
      vertices: mesh.positions.map((n, i) => n - min[i % 3]),
      triangles: mesh.indices,
      normals: mesh.normals,
      uv: mesh.uv,
      groups,
      solid: meshClosure(mesh.positions, mesh.indices).closed,
    },
  });
}
