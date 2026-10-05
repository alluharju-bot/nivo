import { describe, it, expect } from 'vitest';
import { guideMeasurement, guidePlaneNormal, lineIntersection } from './guides';
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
  it('recovers the vertical plane of a guide raised from a floor edge', () => {
    const raised: Guide = {
      ...horizontal,
      plane: 'XY',
      anchor: { point: [100, 25, 0] },
      offset: [0, 0, 800],
    };
    expect(guidePlaneNormal(raised)).toEqual([0, -1, 0]);
    const second = {
      ...raised,
      anchor: { point: [100, 25, 800] as Vec3 },
      offset: [0, 0, 1000] as Vec3,
    };
    const hit = snapOnSketchPlane(
      [220, 25, 1802],
      sketchFrame([0, 25, 0], guidePlaneNormal(second)),
      [],
      [],
      [second],
      10,
      true,
    );
    expect(hit.point).toEqual([220, 25, 1800]);
    expect(hit.label).toBe('Apuviiva');
  });
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
  it('rejects skew and parallel crossings and includes finite measurement crossings', () => {
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
    expect(result.label).toBe('Mittaviivojen risteys');
  });
});

describe('exact construction sizes with a 10 mm grid', () => {
  it.each([13, 38, 48, 66, 92, 98, 123, 148, 173, 198])(
    'retains the exact %s mm endpoint before considering grid steps',
    (size) => {
      const line: Guide = {
        ...horizontal,
        mode: 'free',
        anchor: { point: [size, 0, 13] },
        direction: [0, 1, 0],
        plane: 'XY',
      };
      const snap = snapOnSketchPlane(
        [size + 2, 1, 13],
        sketchFrame([0, 0, 13]),
        [],
        [],
        [line],
        8,
        true,
      );
      expect(snap.point).toEqual([size, 0, 13]);
      expect(snap.label).toBe('Mittaviiva · alku');
    },
  );
  it('keeps finite measurement segments finite, including intersections', () => {
    const segment: Guide = {
      ...horizontal,
      mode: 'free',
      anchor: { point: [0, 0, 0] },
      length: 98,
      plane: 'XY',
    };
    const crossing: Guide = {
      ...vertical,
      anchor: { point: [148, 0, 0] },
      direction: [0, 1, 0],
      plane: 'XY',
    };
    const result = snapOnSketchPlane(
      [148, 1, 0],
      sketchFrame([0, 0, 0]),
      [],
      [],
      [segment, crossing],
      8,
      true,
    );
    expect(result.key).not.toContain('intersection');
    const beyond = snapOnSketchPlane(
      [123, 1, 0],
      sketchFrame([0, 0, 0]),
      [],
      [],
      [segment],
      8,
      true,
    );
    expect(beyond.key).toBe('grid');
    expect(beyond.point).toEqual([120, 0, 0]);
  });
});
