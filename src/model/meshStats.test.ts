import { expect, it } from 'vitest';
import { BoxGeometry } from 'three';
import { meshBody } from '../exchange/mesh';
import { makeBody, type Body } from './project';
import { bodyVisible } from './transforms';
import { meshStatistics } from './meshStats';

it('counts instances, selection and visibility independently without counting guides or construction geometry', () => {
  const box = new BoxGeometry(10, 10, 10).translate(5, 5, 5);
  const base: Body = {
    ...makeBody(10, 10, 10),
    feature: {
      type: 'mesh',
      width: 10,
      depth: 10,
      height: 10,
      solid: true,
      vertices: Array.from(box.getAttribute('position').array),
      triangles: Array.from(box.index!.array),
    },
  };
  const copy = { ...base, id: 'copy', groupId: 'hidden' };
  const construction: Body = { ...base, id: 'construction', purpose: 'construction' };
  const pending = { ...makeBody(), id: 'pending' };
  const bodies = [base, copy, construction, pending],
    meshes = [meshBody(base), meshBody(copy), meshBody(construction)];
  expect(meshStatistics(bodies, meshes)).toEqual({ triangles: 24, parts: 3, pending: 1 });
  expect(meshStatistics(bodies, meshes, new Set([copy.id]))).toEqual({
    triangles: 12,
    parts: 1,
    pending: 0,
  });
  expect(
    meshStatistics(
      bodies.filter((b) => bodyVisible(b, [{ id: 'hidden', name: 'Piilossa', hidden: true }])),
      meshes,
    ),
  ).toEqual({ triangles: 12, parts: 2, pending: 1 });
  expect(meshStatistics([base], [])).toEqual({ triangles: 12, parts: 1, pending: 0 });
  expect(meshStatistics([], meshes)).toEqual({ triangles: 0, parts: 0, pending: 0 });
  box.dispose();
});
