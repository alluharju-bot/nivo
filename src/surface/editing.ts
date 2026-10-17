import { Matrix4, Vector3 } from 'three';
import type { Vec3 } from '../model/project';
import { checkMesh, type SurfaceMesh } from './mesh';
import { topology, updatedNormals } from './topology';

export function planeSelection(mesh: SurfaceMesh, axis: number, coordinate: number) {
  return Array.from({ length: mesh.positions.length / 3 }, (_, i) => i).filter(
    (i) => Math.abs(mesh.positions[i * 3 + axis] - coordinate) < 1e-5,
  );
}
export function selectionPivot(mesh: SurfaceMesh, selection: number[]): Vec3 {
  const min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  for (const id of selection)
    for (let a = 0; a < 3; a++) {
      min[a] = Math.min(min[a], mesh.positions[id * 3 + a]);
      max[a] = Math.max(max[a], mesh.positions[id * 3 + a]);
    }
  return min.map((n, i) => (n + max[i]) / 2) as Vec3;
}
export function transformSelection(mesh: SurfaceMesh, selection: number[], matrix: Matrix4) {
  const g = topology(mesh),
    chosen = new Set(selection.map((id) => g.ids[id]));
  const protectedIds = new Set((mesh.mask ?? []).flatMap((n, i) => (n > 0 ? [g.ids[i]] : [])));
  const positions = [...mesh.positions],
    p = new Vector3();
  for (let i = 0; i < g.ids.length; i++)
    if (chosen.has(g.ids[i]) && !protectedIds.has(g.ids[i])) {
      p.fromArray(mesh.positions, i * 3)
        .applyMatrix4(matrix)
        .toArray(positions, i * 3);
    }
  return { ...mesh, positions, normals: updatedNormals(mesh, positions) };
}
export function maskSelection(mesh: SurfaceMesh, selection: number[], protectedValue: number) {
  const g = topology(mesh),
    chosen = new Set(selection.map((i) => g.ids[i]));
  const mask = g.ids.map((id, i) => (chosen.has(id) ? protectedValue : (mesh.mask?.[i] ?? 0)));
  return { ...mesh, mask };
}
export function assertSelection(mesh: SurfaceMesh, selection?: number[]) {
  checkMesh(mesh);
  if (selection?.some((i) => !Number.isInteger(i) || i < 0 || i >= mesh.positions.length / 3))
    throw new Error('Valinta ei vastaa verkon pisteitä.');
}
