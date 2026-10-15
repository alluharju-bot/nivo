import { describe, expect, it } from 'vitest';
import { faceDepthSnap, pointDepthSnap, snapExtrusionDistance } from './extrusion';
import type { FaceTarget } from '../cad/protocol';
import type { Vec3 } from './project';

it('grid snapping never reverses an outward or inward extrusion on an off-grid thickness', () => {
  for (const thickness of [0, 13, 18, 48, 73, 98]) {
    expect(snapExtrusionDistance(1, thickness, 10, true)).toBeGreaterThanOrEqual(0);
    expect(snapExtrusionDistance(-1, thickness, 10, true)).toBeLessThanOrEqual(0);
    expect(snapExtrusionDistance(0, thickness, 10, true)).toBe(0);
    expect(snapExtrusionDistance(1.76, thickness, 10, false)).toBe(1.76);
    expect((thickness + snapExtrusionDistance(17, thickness, 10, true)) % 10).toBe(0);
  }
});

describe('push/pull target references', () => {
  it('projects onto the source normal in all six directions, including negative and zero distances', () => {
    for (let axis = 0; axis < 3; axis++)
      for (const sign of [-1, 1]) {
        const normal = [0, 0, 0] as Vec3;
        normal[axis] = sign;
        const source: FaceTarget = { bodyId: 'a', face: 'z:max', point: [10, 20, 30], normal };
        for (const distance of [-652.12345, 0, 150.75]) {
          const point = source.point.map(
            (n, i) => n + (i === axis ? sign * distance : 300),
          ) as Vec3;
          expect(faceDepthSnap(source, { bodyId: 'b', face: 'z:min', point, normal })).toEqual({
            distance,
            parallel: true,
          });
          expect(pointDepthSnap(source, point, 'b')).toEqual({ distance });
        }
        expect(faceDepthSnap(source, source)).toBeUndefined();
      }
  });
  it('rejects only the moving face boundary, retaining other parts at the same level and stable source points', () => {
    const source: FaceTarget = {
      bodyId: 'a',
      face: 'z:max',
      point: [10, 20, 40],
      normal: [0, 0, 1],
    };
    expect(pointDepthSnap(source, [0, 0, 40], 'a')).toBeUndefined();
    expect(pointDepthSnap(source, [100, 100, 40], 'b')).toEqual({ distance: 0 });
    expect(pointDepthSnap(source, [0, 0, 0], 'a')).toEqual({ distance: -40 });
    expect(pointDepthSnap({ ...source, normal: [0, 0.6, 0.8] }, [200, 80, 120], 'b')).toEqual({
      distance: 100,
    });
  });
  it('handles oblique source faces and distinguishes a picked point on a nonparallel target', () => {
    const source: FaceTarget = {
      bodyId: 'a',
      face: 'z:max',
      point: [10, 20, 30],
      normal: [0, 0.6, 0.8],
    };
    expect(
      faceDepthSnap(source, {
        ...source,
        face: 'z:min',
        point: [200, 80, 110],
        normal: [0, -0.6, -0.8],
      }),
    ).toEqual({ distance: 100, parallel: true });
    expect(
      faceDepthSnap(source, { ...source, bodyId: 'b', point: [200, 120, 130], normal: [0, 0, 1] }),
    ).toEqual({ distance: 140, parallel: false });
  });
});
