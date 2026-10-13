import { describe, expect, it } from 'vitest';
import { drawingDimension, shiftDrawingDimension } from './placement';
import { pointDimensionGeometry } from '../model/dimensions';
import type { Vec3 } from '../model/project';
const picks = (
  [
    [0, 0, 0],
    [300, 0, 400],
  ] as Vec3[]
).map((point) => ({ point, anchor: { point }, label: 'Piste' }));
describe('drawing annotation placement', () => {
  it('uses the accepting touch position and allows horizontal, vertical and true length', () => {
    const horizontal = drawingDimension(picks, [150, 50], 'front', 'horizontal')!;
    const vertical = drawingDimension(picks, [-60, -200], 'front', 'vertical')!;
    const distance = drawingDimension(picks, [180, -80], 'front', 'distance')!;
    expect(pointDimensionGeometry([], horizontal)).toMatchObject({ value: 300, a: [0, 0, -50] });
    expect(pointDimensionGeometry([], vertical)).toMatchObject({ value: 400, a: [-60, 0, 0] });
    expect(pointDimensionGeometry([], distance).value).toBe(500);
    expect(drawingDimension(picks, [0, 0], 'front')?.axis).toBe('z');
  });
  it('moves the annotation without changing its measured points or value', () => {
    const dimension = drawingDimension(picks, [150, 50], 'front', 'horizontal')!;
    const shifted = shiftDrawingDimension(dimension, [0, 75], 'front');
    expect(shifted.start).toEqual(dimension.start);
    expect(shifted.end).toEqual(dimension.end);
    expect(pointDimensionGeometry([], shifted)).toMatchObject({ value: 300, a: [0, 0, -125] });
    expect(dimension.offset).toEqual([150, 0, -50]);
  });
});

it('opposite orthographic views retain signed screen placement and true measurements', () => {
  for (const view of ['back', 'left', 'bottom'] as const) {
    const points = (
      [
        view === 'left' ? [0, 0, 0] : [0, 0, 0],
        view === 'left' ? [0, 300, 400] : view === 'bottom' ? [300, 400, 0] : [300, 0, 400],
      ] as Vec3[]
    ).map((point) => ({ point, anchor: { point }, label: 'Piste' }));
    const d = drawingDimension(points, [-100, 90], view, 'horizontal')!;
    expect(pointDimensionGeometry([], d).value).toBe(300);
    const moved = shiftDrawingDimension(d, [20, 30], view);
    expect(pointDimensionGeometry([], moved).value).toBe(300);
    expect(moved.start).toEqual(d.start);
    if (view === 'back') expect(moved.offset).toEqual([80, 0, -120]);
    if (view === 'left') expect(moved.offset).toEqual([0, 80, -120]);
    if (view === 'bottom') expect(moved.offset).toEqual([-80, 120, 0]);
  }
});
