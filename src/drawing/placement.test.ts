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
