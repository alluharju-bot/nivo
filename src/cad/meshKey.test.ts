import { expect, it } from 'vitest';
import { makeBody, bodySchema } from '../model/project';
import { bodyGeometryKey, bodyMeshKey } from './meshKey';
it('shares geometry keys across placements and metadata edits, but invalidates exact geometry and curve stations', () => {
  const body = makeBody(20, 30, 40),
    key = bodyMeshKey(body),
    geometry = bodyGeometryKey(body);
  const loaded = bodySchema.parse(JSON.parse(JSON.stringify(body)));
  expect(bodyMeshKey(loaded)).toBe(key);
  expect(bodyMeshKey({ ...body, name: 'New', locked: true, color: '#123456' })).toBe(key);
  const moved = { ...body, origin: [20, 0, 0] as [number, number, number] };
  expect(bodyMeshKey(moved)).not.toBe(key);
  expect(bodyGeometryKey(moved)).toBe(geometry);
  expect(bodyGeometryKey({ ...body, feature: { ...body.feature, width: 21 } })).not.toBe(geometry);
  expect(bodyGeometryKey({ ...body, curveSnaps: [0, 0.5, 1] })).not.toBe(geometry);
  expect(bodyMeshKey(body)).toBe(key);
});
