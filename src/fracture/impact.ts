import { Ray, Vector3 } from 'three';
import type { SurfaceMesh } from '../surface/mesh';
import type { ImpactRegion } from './types';

/** Through means the first solid wall at the picked surface, not all walls of a room. */
export function impactDepth(mesh: SurfaceMesh, impact: ImpactRegion): number {
  if (
    ![...impact.point, ...impact.normal, impact.diameter].every(Number.isFinite) ||
    impact.diameter <= 0 ||
    impact.diameter > 100000 ||
    Math.hypot(...impact.normal) < 0.99
  )
    throw new Error('Poimi osumakohta uudelleen ja anna kelvollinen halkaisija.');
  if (impact.depth !== undefined) {
    if (!Number.isFinite(impact.depth) || impact.depth <= 0 || impact.depth > 100000)
      throw new Error('Syvyyden pitää olla yli nolla ja enintään 100 000 mm.');
    return impact.depth;
  }
  const outward = new Vector3(...impact.normal).normalize();
  const start = new Vector3(...impact.point).addScaledVector(outward, 0.01);
  const ray = new Ray(start, outward.clone().negate());
  const a = new Vector3(),
    b = new Vector3(),
    c = new Vector3(),
    hit = new Vector3();
  const ab = new Vector3(),
    ac = new Vector3();
  let exit = Infinity;
  for (let t = 0; t < mesh.indices.length; t += 3) {
    a.fromArray(mesh.positions, mesh.indices[t] * 3);
    b.fromArray(mesh.positions, mesh.indices[t + 1] * 3);
    c.fromArray(mesh.positions, mesh.indices[t + 2] * 3);
    // Outward-facing exit surfaces only; the entry can have many coplanar triangles.
    if (ab.subVectors(b, a).cross(ac.subVectors(c, a)).dot(ray.direction) <= 0) continue;
    if (ray.intersectTriangle(a, b, c, false, hit)) {
      const distance = hit.distanceTo(start);
      if (distance > 0.011) exit = Math.min(exit, distance);
    }
  }
  if (!Number.isFinite(exit)) throw new Error('Seinän takapintaa ei löytynyt. Aseta syvyys itse.');
  return exit + 0.01;
}

/** Shared by the red preview and the actual Boolean cutter. Seed-stable jagged outline. */
export function impactCutter(
  mesh: SurfaceMesh,
  impact: ImpactRegion,
  seed: number,
  irregularity: number,
) {
  const depth = impactDepth(mesh, impact);
  const axis = new Vector3(...impact.normal).normalize().negate();
  const u = new Vector3(Math.abs(axis.z) < 0.9 ? 0 : 1, 0, Math.abs(axis.z) < 0.9 ? 1 : 0)
    .cross(axis)
    .normalize();
  const v = axis.clone().cross(u);
  const point = new Vector3(...impact.point);
  const positions: number[] = [],
    indices: number[] = [];
  const segments = 24;
  let state = seed >>> 0;
  const radii = Array.from({ length: segments }, () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return impact.diameter * 0.5 * (1 - (state / 4294967296) * 0.3 * irregularity);
  });
  for (const z of [-0.05, depth]) {
    for (let i = 0; i < segments; i++) {
      const angle = (i * Math.PI * 2) / segments;
      positions.push(
        ...point
          .clone()
          .addScaledVector(axis, z)
          .addScaledVector(u, Math.cos(angle) * radii[i])
          .addScaledVector(v, Math.sin(angle) * radii[i])
          .toArray(),
      );
    }
  }
  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % segments;
    indices.push(i, next, next + segments, i, next + segments, i + segments);
  }
  for (let i = 1; i < segments - 1; i++) {
    indices.push(0, i + 1, i, segments, segments + i, segments + i + 1);
  }
  return { positions, indices };
}
