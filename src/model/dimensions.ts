import { resolveAnchor } from './guides';
import { add, sub, unit, scale, dot, axisVector } from './geometry';
import {
  isPointDimension,
  type Anchor,
  type Body,
  type PointDimension,
  type Dimension,
  type Vec3,
  axisIndex,
  uid,
  type Axis,
  type Project,
} from './project';

/** Add only missing, nonzero overall dimensions; one call becomes one undo step. */
export function addBodyDimensions(
  project: Project,
  ids: string[],
  axes: Axis[] = ['x', 'y', 'z'],
): Project {
  const dimensions = [...project.dimensions];
  for (const body of project.bodies.filter(
    (b) => ids.includes(b.id) && b.purpose !== 'construction',
  )) {
    const size = [body.feature.width, body.feature.depth, body.feature.height];
    for (const axis of axes) {
      if (
        size[axisIndex[axis]] <= 0 ||
        dimensions.some((d) => !isPointDimension(d) && d.bodyId === body.id && d.axis === axis)
      )
        continue;
      dimensions.push({ id: uid(), bodyId: body.id, axis, from: 'min', to: 'max' });
    }
  }
  return { ...project, dimensions };
}

export function anchorBodyId(anchor: Anchor) {
  return 'bodyId' in anchor
    ? anchor.bodyId
    : 'edge' in anchor
      ? anchor.edge.from.bodyId
      : undefined;
}
export function dimensionBodyIds(dimension: Dimension): string[] {
  return isPointDimension(dimension)
    ? [
        ...new Set(
          [anchorBodyId(dimension.start), anchorBodyId(dimension.end)].filter(
            (id): id is string => !!id,
          ),
        ),
      ]
    : [dimension.bodyId];
}
export function pointDimensionGeometry(bodies: Body[], d: PointDimension) {
  const start = resolveAnchor(bodies, d.start),
    end = resolveAnchor(bodies, d.end);
  const a = start ?? d.fallback[0],
    b = end ?? d.fallback[1];
  const delta = sub(b, a);
  const measured =
    d.axis === 'distance' ? delta : scale(axisVector(d.axis), delta[axisIndex[d.axis]]);
  const direction = unit(measured);
  const offset = sub(d.offset, scale(direction, dot(d.offset, direction)));
  return {
    start: a,
    end: b,
    a: add(a, offset),
    b: add(add(a, measured), offset),
    value: Math.hypot(...measured),
    orphan: !start || !end,
  };
}
export function pointDimensionInView(
  bodies: Body[],
  d: PointDimension,
  view: 'front' | 'right' | 'top',
) {
  const g = pointDimensionGeometry(bodies, d),
    hidden = view === 'front' ? 1 : view === 'right' ? 0 : 2;
  return (
    !g.orphan &&
    g.value > 1e-6 &&
    Math.abs(g.a[hidden] - g.b[hidden]) < 1e-5 &&
    Math.abs(g.start[hidden] - g.a[hidden]) < 1e-5 &&
    (d.axis !== 'distance' || Math.abs(g.end[hidden] - g.b[hidden]) < 1e-5)
  );
}
