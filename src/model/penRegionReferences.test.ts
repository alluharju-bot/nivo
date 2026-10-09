import { expect, it } from 'vitest';
import { freshProject, makeBody, dimensionValue, type Project } from './project';
import { preserveRegionReferences } from './penRegionReferences';
import { guidePoints } from './guides';
it('surface subdivision preserves guides and both point and extent dimensions at their measured coordinates', () => {
  const body = makeBody(1000, 1000, 10, [0, 0, -10]);
  const project: Project = {
    ...freshProject(),
    bodies: [body],
    guides: [
      {
        id: 'g',
        mode: 'free',
        plane: 'XY',
        angle: 0,
        length: 100,
        anchor: { bodyId: body.id, key: 'corner:0', local: [0, 0, 0] },
        direction: [1, 0, 0],
      },
    ],
    dimensions: [{ id: 'd', bodyId: body.id, axis: 'z', from: 'min', to: 'max' }],
  };
  const before = guidePoints(project.bodies, project.guides[0]);
  const updated = { ...preserveRegionReferences(project, [body.id]), bodies: [] };
  expect(guidePoints(updated.bodies, updated.guides[0])).toEqual(before);
  expect(dimensionValue(updated, updated.dimensions[0])).toBe(10);
  expect(project.guides[0].anchor).toHaveProperty('bodyId', body.id);
});
