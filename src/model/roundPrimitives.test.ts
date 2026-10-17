import { expect, it } from 'vitest';
import { facetedSphere, radialPolygon } from './roundPrimitives';
import { meshClosure } from '../exchange/mesh';
import { makeProfileBody, freshProject, parseProject } from './project';
import { sketchFrame } from './sketch';
it.each([3, 8, 24, 128])(
  'stores actual %s-sided circle/cylinder profiles and closed spheres',
  (sides) => {
    const profile = radialPolygon(50, 50, sides);
    expect(profile.kind === 'polygon' && profile.points.length).toBe(sides);
    const cylinder = makeProfileBody(profile, sketchFrame([10, 20, 30], [0, 1, 0]), 100, 'Lieriö');
    const sphere = facetedSphere([10, 20, 30], 50, sides, 'Pallo');
    if (sphere.feature.type !== 'mesh') throw new Error('Expected mesh');
    expect(sphere.feature.triangles.length / 3).toBe(
      2 * sides * (Math.max(2, Math.round(sides / 2)) - 1),
    );
    expect(meshClosure(sphere.feature.vertices, sphere.feature.triangles).closed).toBe(true);
    expect(
      parseProject(JSON.stringify({ ...freshProject(), bodies: [cylinder, sphere] })).bodies,
    ).toEqual(JSON.parse(JSON.stringify([cylinder, sphere])));
  },
);
