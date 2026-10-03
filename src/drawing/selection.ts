import type { BodyMesh, DrawingView } from '../cad/protocol';
import type { Anchor, Project, Vec3 } from '../model/project';
import { dimensionBodyIds } from '../model/dimensions';
import { groupAncestors, groupBodies } from '../model/groups';
import { projectPoint } from './svg';

export function drawingProject(project: Project, target: string, selectedIds: string[]): Project {
  const ids = target.startsWith('group:')
    ? groupBodies(project, target.slice(6)).map((b) => b.id)
    : target === 'selection'
      ? selectedIds
      : target.startsWith('body:')
        ? [target.slice(5)]
        : undefined;
  const bodies = project.bodies.filter(
    (b) =>
      b.purpose !== 'construction' &&
      (ids
        ? ids.includes(b.id)
        : !b.hidden && !groupAncestors(project.groups, b.groupId).some((g) => g.hidden)),
  );
  const visible = new Set(bodies.map((b) => b.id));
  return {
    ...project,
    bodies,
    dimensions: project.dimensions.filter((d) => {
      const refs = dimensionBodyIds(d);
      return refs.every(
        (id) => visible.has(id) || (target === 'all' && !project.bodies.some((b) => b.id === id)),
      );
    }),
  };
}
export type DrawingPick = { point: Vec3; anchor: Anchor; label: string };
/** Picking uses CAD vertices and linear edges, in screen pixels independent of sheet scale. */
export function pickDrawingPoint(
  meshes: BodyMesh[],
  view: DrawingView,
  point: [number, number],
  tolerance: number,
): DrawingPick | undefined {
  let best: DrawingPick | undefined,
    distance = tolerance;
  const consider = (candidate: DrawingPick) => {
    const p = projectPoint(candidate.point, view),
      d = Math.hypot(p[0] - point[0], p[1] - point[1]);
    if (d < distance) {
      best = candidate;
      distance = d;
    }
  };
  for (const mesh of meshes)
    for (const vertex of mesh.verticesCAD) consider({ ...vertex, label: 'Kulmapiste' });
  if (best) return best;
  for (const mesh of meshes)
    for (const edge of mesh.edgesCAD) {
      consider({
        point: edge.start.map((n, i) => (n + edge.end[i]) / 2) as Vec3,
        anchor: { edge: { from: edge.from, to: edge.to, t: 0.5 } },
        label: 'Keskipiste',
      });
    }
  if (best) return best;
  for (const mesh of meshes)
    for (const edge of mesh.edgesCAD) {
      const a = projectPoint(edge.start, view),
        b = projectPoint(edge.end, view),
        dx = b[0] - a[0],
        dy = b[1] - a[1],
        length = dx * dx + dy * dy;
      if (length < 1e-12) continue;
      const t = Math.max(
        0,
        Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / length),
      );
      consider({
        point: edge.start.map((n, i) => n + (edge.end[i] - n) * t) as Vec3,
        anchor: { edge: { from: edge.from, to: edge.to, t } },
        label: 'Reuna',
      });
    }
  return best;
}
