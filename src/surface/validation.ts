import { validateGeometry, type EditableGeometry } from '../model/geometryEditing';
import type { Vec3 } from '../model/project';
import { checkMesh, type SurfaceMesh } from './mesh';
import { topology } from './topology';
import { meshClosure } from '../exchange/mesh';

/** Full acceptance check, executed in a worker rather than during pointer movement. */
export function validateSurface(mesh: SurfaceMesh, previous?: SurfaceMesh) {
  checkMesh(mesh);
  const g = topology(mesh),
    triangles = mesh.indices.map((i) => g.ids[i]);
  const edges = new Map<string, { count: number; direction: number }>(),
    faces = new Set<string>();
  for (let t = 0; t < triangles.length; t += 3) {
    const ids = triangles.slice(t, t + 3),
      face = [...ids].sort((a, b) => a - b).join(':');
    if (faces.has(face))
      throw new Error('Verkossa on päällekkäisiä pintoja. Peru muutos tai siirrä peilaustasoa.');
    faces.add(face);
    for (let k = 0; k < 3; k++) {
      const a = ids[k],
        b = ids[(k + 1) % 3],
        key = [Math.min(a, b), Math.max(a, b)].join(':');
      const edge = edges.get(key) ?? { count: 0, direction: 0 };
      edge.count++;
      edge.direction += a < b ? 1 : -1;
      edges.set(key, edge);
    }
  }
  for (const e of edges.values()) {
    if (e.count > 2)
      throw new Error(
        'Yhteen reunaan liittyy yli kaksi pintaa. Muutos tekisi verkosta epäyhtenäisen.',
      );
    if (e.count === 2 && e.direction !== 0)
      throw new Error('Vierekkäisten pintojen suunnat ovat ristiriidassa. Peru muutos.');
  }
  const closed = [...edges.values()].every((e) => e.count === 2);
  if (!closed && previous && meshClosure(previous.positions, previous.indices).closed)
    throw new Error('Muutos avaisi suljetun kappaleen. Peru muutos tai pienennä siirtymää.');
  const points = g.representatives.map((i) => mesh.positions.slice(i * 3, i * 3 + 3) as Vec3);
  const same =
    previous &&
    previous.positions.length === mesh.positions.length &&
    previous.indices.length === mesh.indices.length &&
    previous.indices.every((n, i) => n === mesh.indices[i]);
  const before = same
    ? g.representatives.map((i) => previous.positions.slice(i * 3, i * 3 + 3) as Vec3)
    : points;
  const editable: EditableGeometry = {
    points: before,
    triangles,
    vertexMap: g.ids,
    sourceTriangles: mesh.indices,
    patches: mesh.faces,
    groups: [],
    exact: false,
    solid: closed,
  };
  validateGeometry(editable, points);
  return { closed, triangles: triangles.length / 3 };
}
