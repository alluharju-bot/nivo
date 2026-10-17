import { Vector3 } from 'three';
import type { Vec3 } from '../model/project';
import type { SurfaceMesh } from './mesh';
import { topology, updatedNormals, brushRegion, visibleFrom } from './topology';

export type SculptMode = 'raise' | 'lower' | 'smooth';
export interface BrushStamp {
  point: Vec3;
  normal: Vec3;
  radius: number;
  strength: number;
  triangle?: number;
  camera?: Vec3;
}
export function sculptMesh(
  mesh: SurfaceMesh,
  stamp: BrushStamp,
  mode: SculptMode,
  pinBoundary = false,
  visible = visibleFrom(mesh, stamp.camera),
): SurfaceMesh {
  const { point, normal, radius, strength } = stamp;
  if (
    !Number.isFinite(radius) ||
    radius <= 0 ||
    !Number.isFinite(strength) ||
    Math.abs(strength) > radius
  )
    throw new Error('Siveltimen voimakkuus saa olla enintään vaikutussäde.');
  // Weld positions for influence only; keep render vertices/UV seams and hard normals.
  const { ids, representatives, neighbours, boundary, triangles } = topology(mesh);
  const region = brushRegion(mesh, stamp);
  const protectedIds = new Set((mesh.mask ?? []).flatMap((n, i) => (n > 0 ? [ids[i]] : [])));
  const points = representatives.map((i) => mesh.positions.slice(i * 3, i * 3 + 3) as Vec3);
  const direction = new Vector3(...normal).normalize();
  const facing = points.map(() => new Vector3());
  ids.forEach((id, i) => facing[id].add(new Vector3().fromArray(mesh.normals, i * 3)));
  const next = points.map((p, i): Vec3 => {
    if (protectedIds.has(i) || (pinBoundary && boundary.has(i)) || facing[i].dot(direction) <= 0)
      return p;
    if (region && ![...triangles[i]].some((t) => region.has(t))) return p;
    const d = Math.hypot(...p.map((n, k) => n - point[k])) / radius;
    if (d >= 1 || !visible(p)) return p;
    const w = (1 - d * d) ** 2;
    if (mode === 'smooth') {
      const average = new Vector3();
      neighbours[i].forEach((j) => average.add(new Vector3(...points[j])));
      average.divideScalar(Math.max(1, neighbours[i].size));
      return new Vector3(...p)
        .lerp(average, Math.min(0.5, Math.abs(strength) / radius) * w)
        .toArray() as Vec3;
    }
    return new Vector3(...p)
      .addScaledVector(direction, strength * w * (mode === 'lower' ? -1 : 1))
      .toArray() as Vec3;
  });
  const positions = ids.flatMap((id) => next[id]);
  const normals = updatedNormals(mesh, positions);
  return { ...mesh, positions, normals };
}

export function paintMask(mesh: SurfaceMesh, stamps: BrushStamp[], erase = false): SurfaceMesh {
  const g = topology(mesh),
    mask = mesh.mask ? [...mesh.mask] : new Array(g.ids.length).fill(0);
  for (const stamp of stamps) {
    const region = brushRegion(mesh, stamp),
      visible = visibleFrom(mesh, stamp.camera),
      chosen = new Set<number>();
    for (const [id, i] of g.representatives.entries()) {
      const point = mesh.positions.slice(i * 3, i * 3 + 3);
      if (region && ![...g.triangles[id]].some((t) => region.has(t))) continue;
      if (Math.hypot(...point.map((n, k) => n - stamp.point[k])) <= stamp.radius && visible(point))
        chosen.add(id);
    }
    g.ids.forEach((id, i) => {
      if (chosen.has(id)) mask[i] = erase ? 0 : 1;
    });
  }
  return { ...mesh, mask };
}
