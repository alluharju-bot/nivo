import { axisIndex, uid, type Axis, type Project } from './project';

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
        dimensions.some((d) => d.bodyId === body.id && d.axis === axis)
      )
        continue;
      dimensions.push({ id: uid(), bodyId: body.id, axis, from: 'min', to: 'max' });
    }
  }
  return { ...project, dimensions };
}
