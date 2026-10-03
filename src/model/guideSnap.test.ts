import { describe, it, expect } from 'vitest';
import { guideMeasurement, lineIntersection } from './guides';
import { snapPoint, snapOnSketchPlane } from './snap';
import { sketchFrame } from './sketch';
import type { Guide, Vec3 } from './project';

const vertical: Guide = {
  id: 'vertical',
  mode: 'guide',
  anchor: { point: [100, 0, 20] },
  direction: [0, 0, 1],
  length: 600,
  plane: 'XZ',
  angle: 90,
};
const horizontal: Guide = {
  id: 'horizontal',
  mode: 'guide',
  anchor: { point: [20, 0, 200] },
  direction: [1, 0, 0],
  length: 400,
  plane: 'XZ',
  angle: 0,
};

describe('guide measurements and intersections', () => {
  it('snaps rectangle sides at 45 degrees while retaining pen length steps', () => {
    const frame = sketchFrame([0, 0, 0], [0, 0, 1]);
    const rectangle = snapOnSketchPlane(
      [60, 60, 0],
      frame,
      [],
      [],
      [],
      5,
      true,
      undefined,
      [0, 0, 0],
      [],
      10,
      'coordinates',
    );
    expect(rectangle.point[0]).toBeCloseTo(60);
    expect(rectangle.point[1]).toBeCloseTo(60);
    const pen = snapOnSketchPlane(
      [60, 60, 0],
      frame,
      [],
      [],
      [],
      5,
      true,
      undefined,
      [0, 0, 0],
      [],
      10,
    );
    expect(Math.hypot(...pen.point)).toBeCloseTo(80);
  });
  it.each<Vec3>([
    [80, 0, 0],
    [-80, 0, 0],
    [0, 80, 0],
    [0, 0, -80],
  ])('measures the source-to-guide gap for offset %j', (...offset) => {
    const [a, b] = guideMeasurement([], { ...vertical, offset: offset as Vec3 })!;
    expect(Math.hypot(...b.map((n, i) => n - a[i]))).toBe(80);
    expect(a).toEqual([100, 0, 20]);
  });
  it('keeps free measurement length independent of offset-guide labels', () => {
    expect(guideMeasurement([], { ...vertical, mode: 'free' })).toEqual([
      [100, 0, 20],
      [100, 0, 620],
    ]);
  });
  it('prefers a true crossing over a previously acquired line, on vertical and tilted planes', () => {
    const previous = snapPoint([102, 0, 170], [], 10, undefined, undefined, undefined, false, {
      plane: 'XZ',
      guides: [vertical, horizontal],
    });
    expect(previous.label).toBe('Apuviiva');
    const result = snapPoint([102, 0, 198], [], 10, previous, undefined, undefined, false, {
      plane: 'XZ',
      guides: [vertical, horizontal],
    });
    expect(result.label).toBe('Apuviivojen risteys');
    expect(result.point).toEqual([100, 0, 200]);
    const a = {
      ...horizontal,
      anchor: { point: [20, 20, 200] as Vec3 },
      direction: [1, 1, 0] as Vec3,
    };
    const b = { ...vertical, anchor: { point: [100, 100, 20] as Vec3 } };
    const tilted = snapOnSketchPlane(
      [102, 102, 198],
      sketchFrame([0, 0, 0], [1, -1, 0]),
      [],
      [],
      [a, b],
      10,
      false,
    );
    expect(tilted.label).toBe('Apuviivojen risteys');
    expect(tilted.point[0]).toBeCloseTo(100);
    expect(tilted.point[1]).toBeCloseTo(100);
    expect(tilted.point[2]).toBeCloseTo(200);
  });
  it('does not invent crossings for skew, parallel, or free measurement lines', () => {
    expect(
      lineIntersection(
        [
          [0, 0, 0],
          [100, 0, 0],
        ],
        [
          [40, -50, 20],
          [40, 50, 20],
        ],
      ),
    ).toBeUndefined();
    expect(
      lineIntersection(
        [
          [0, 0, 0],
          [100, 0, 0],
        ],
        [
          [0, 5, 0],
          [100, 5, 0],
        ],
      ),
    ).toBeUndefined();
    const result = snapPoint([102, 0, 198], [], 10, undefined, undefined, undefined, false, {
      plane: 'XZ',
      guides: [vertical, { ...horizontal, mode: 'free' }],
    });
    expect(result.label).toBe('Apuviiva');
  });
});
