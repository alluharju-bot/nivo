import {
  axisIndex,
  dimensionEnvelope,
  isPointDimension,
  type Anchor,
  type Project,
  type Vec3,
  type PointDimension,
} from './project';
import { anchorBodyId, dimensionBodyIds } from './dimensions';
import { resolveAnchor } from './guides';

/** Subdividing an auto-filled patch must not erase attached measurements.
 * Preserve their measured world coordinates before replacing its CAD topology. */
export function preserveRegionReferences(project: Project, replaced: string[]): Project {
  if (!replaced.length) return project;
  const removed = new Set(replaced);
  const freeze = (anchor: Anchor): Anchor => {
    if (!removed.has(anchorBodyId(anchor) ?? '')) return anchor;
    const point = resolveAnchor(project.bodies, anchor);
    return point ? { point } : anchor;
  };
  return {
    ...project,
    guides: project.guides.map((g) => ({
      ...g,
      anchor: freeze(g.anchor),
      ...(g.endAnchor ? { endAnchor: freeze(g.endAnchor) } : {}),
    })),
    dimensions: project.dimensions.map((d) => {
      if (isPointDimension(d)) return { ...d, start: freeze(d.start), end: freeze(d.end) };
      if (!dimensionBodyIds(d, project).some((id) => removed.has(id))) return d;
      const body = dimensionEnvelope(project, d);
      if (!body) return d;
      const a = [...body.origin] as Vec3,
        b = [...a] as Vec3;
      b[axisIndex[d.axis]] += [body.feature.width, body.feature.depth, body.feature.height][
        axisIndex[d.axis]
      ];
      return {
        id: d.id,
        kind: 'points',
        start: { point: a },
        end: { point: b },
        fallback: [a, b],
        axis: d.axis,
        normal: d.axis === 'z' ? [0, -1, 0] : [0, 0, 1],
        offset: [0, 0, 0],
      } satisfies PointDimension;
    }),
  };
}
