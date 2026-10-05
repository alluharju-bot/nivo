import type { KnifeResult } from '../cad/modeling';
import {
  type Anchor,
  type Project,
  type Vec3,
  isPointDimension,
  isOverallDimension,
} from './project';
import { resolveAnchor } from './guides';
import { sub, add, dot, scale } from './geometry';

/** Follow surviving vertices/edges into their new piece; overall dimensions retain the full original envelope. */
export function applySplitResult(project: Project, result: KnifeResult): Project {
  const byId = new Map(result.bodies.map((b) => [b.id, b]));
  const bodies = project.bodies.flatMap((b) =>
    (result.replacements[b.id] ?? [b.id]).map((id) => byId.get(id) ?? b),
  );
  const anchor = (original: Anchor): Anchor => {
    if ('point' in original) return original;
    const id = 'edge' in original ? original.edge.from.bodyId : original.bodyId;
    const ids = result.replacements[id];
    if (!ids) return original;
    const point = resolveAnchor(project.bodies, original);
    if (!point) return original;
    const surviving = resolveAnchor(bodies, original);
    if (surviving && Math.hypot(...sub(surviving, point)) < 1e-5) return original;
    for (const body of bodies.filter((b) => ids.includes(b.id))) {
      const local = sub(point, body.origin);
      for (const [key, value] of Object.entries(body.vertexRefs ?? {})) {
        if (Math.hypot(...sub(local, value)) < 1e-5) return { bodyId: body.id, key, local: value };
      }
      if (body.feature.type !== 'brep') continue;
      const topology = body.feature.topologyId;
      for (const [a, b] of body.linearEdges ?? []) {
        const delta = sub(b, a),
          length2 = dot(delta, delta);
        if (length2 < 1e-12) continue;
        const t = dot(sub(local, a), delta) / length2;
        if (t < -1e-7 || t > 1 + 1e-7 || Math.hypot(...sub(local, add(a, scale(delta, t)))) > 1e-5)
          continue;
        const vertex = (p: Vec3) => ({
          bodyId: body.id,
          key: `brep:${topology}:${p.join(',')}`,
          local: p,
        });
        return { edge: { from: vertex(a), to: vertex(b), t: Math.max(0, Math.min(1, t)) } };
      }
    }
    // Unresolved references remain explicit: the normal missing-reference UI handles them.
    return original;
  };
  return {
    ...project,
    bodies,
    guides: project.guides.map((g) => ({
      ...g,
      anchor: anchor(g.anchor),
      endAnchor: g.endAnchor && anchor(g.endAnchor),
    })),
    dimensions: project.dimensions.map((d) => {
      if (isPointDimension(d)) return { ...d, start: anchor(d.start), end: anchor(d.end) };
      if (isOverallDimension(d))
        return d.target.kind === 'parts'
          ? {
              ...d,
              target: {
                ...d.target,
                ids: [...new Set(d.target.ids.flatMap((id) => result.replacements[id] ?? [id]))],
              },
            }
          : d;
      const ids = result.replacements[d.bodyId];
      return ids
        ? {
            id: d.id,
            kind: 'overall' as const,
            target: { kind: 'parts' as const, ids },
            axis: d.axis,
          }
        : d;
    }),
  };
}
