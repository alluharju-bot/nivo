import * as THREE from 'three';
import type { Body } from '../model/project';
import type { Appearance } from '../model/materials';
import { faceMaterialBody } from '../model/faceMaterials';
type Range = { start: number; count: number; index: number };

export function materialFaceRanges(faces: number[]): Range[] {
  const result: Range[] = [];
  faces.forEach((index, triangle) => {
    const last = result.at(-1);
    if (last?.index === index) last.count += 3;
    else result.push({ start: triangle * 3, count: 3, index });
  });
  return result;
}
export function layerUVKey(body: Body) {
  return JSON.stringify([
    body.textureFrame,
    body.appearance?.surfaceMapping,
    Object.entries(body.faceMaterials ?? {})
      .filter(([, f]) => f.appearance.surfaceMapping)
      .map(([id, f]) => [id, f.appearance.surfaceMapping]),
  ]);
}
export function cylindricalUV(
  mapping: NonNullable<Appearance['surfaceMapping']>,
  point: THREE.Vector3,
) {
  const axis = new THREE.Vector3(...mapping.axis).normalize();
  const u = new THREE.Vector3(...mapping.uAxis).normalize();
  const v = new THREE.Vector3().crossVectors(axis, u).normalize();
  const d = point.clone().sub(new THREE.Vector3(...mapping.origin));
  let angle = Math.atan2(d.dot(v), d.dot(u));
  if (angle < -1e-8) angle += Math.PI * 2;
  return [Math.max(0, angle) * mapping.radius, d.dot(axis)] as [number, number];
}
/** Opt-in unique surface UVs for authored layers. Existing materials keep their mapping. */
export function applyLayerUV(
  geometry: THREE.BufferGeometry,
  body: Body,
  ranges: Range[],
  inverse: THREE.Matrix4,
) {
  const active = ranges.filter((r) => faceMaterialBody(body, r.index).appearance?.surfaceMapping);
  if (!active.length || !geometry.index) return;
  const positions = Array.from(geometry.getAttribute('position').array);
  const normals = Array.from(geometry.getAttribute('normal').array);
  const uv = Array.from(geometry.getAttribute('uv').array);
  const indices = Array.from(geometry.index.array);
  const point = new THREE.Vector3();
  for (const range of active) {
    const mapping = faceMaterialBody(body, range.index).appearance!.surfaceMapping!;
    const circumference = Math.PI * 2 * mapping.radius;
    const visited = new Set<number>();
    for (let i = range.start; i < range.start + range.count; i++) {
      const vertex = indices[i];
      if (visited.has(vertex)) continue;
      visited.add(vertex);
      point.fromArray(positions, vertex * 3).applyMatrix4(inverse);
      const next = cylindricalUV(mapping, point);
      uv[vertex * 2] = next[0];
      uv[vertex * 2 + 1] = next[1];
    }
    // A triangle crossing the angular seam must not interpolate across the whole cylinder.
    const duplicates = new Map<number, number>();
    for (let i = range.start; i < range.start + range.count; i += 3) {
      const values = indices.slice(i, i + 3).map((n) => uv[n * 2]);
      if (Math.max(...values) - Math.min(...values) <= circumference / 2) continue;
      for (let k = 0; k < 3; k++) {
        const vertex = indices[i + k];
        if (uv[vertex * 2] >= circumference / 2) continue;
        let copy = duplicates.get(vertex);
        if (copy === undefined) {
          copy = positions.length / 3;
          duplicates.set(vertex, copy);
          positions.push(...positions.slice(vertex * 3, vertex * 3 + 3));
          normals.push(...normals.slice(vertex * 3, vertex * 3 + 3));
          uv.push(uv[vertex * 2] + circumference, uv[vertex * 2 + 1]);
        }
        indices[i + k] = copy;
      }
    }
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
}
