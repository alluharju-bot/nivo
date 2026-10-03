import { axisIndex, type Axis, type PointDimension, type Vec3 } from '../model/project';
import type { DrawingView } from '../cad/protocol';
import type { DrawingPick } from './selection';
import { projectPoint } from './svg';

export type DimensionDirection = 'auto' | 'horizontal' | 'vertical' | 'distance';
export function drawingDimension(
  picks: DrawingPick[],
  cursor: [number, number],
  view: DrawingView,
  direction: DimensionDirection = 'auto',
): PointDimension | undefined {
  if (picks.length !== 2) return;
  const a = projectPoint(picks[0].point, view),
    b = projectPoint(picks[1].point, view);
  const horizontal: Axis = view === 'right' ? 'y' : 'x',
    vertical: Axis = view === 'top' ? 'y' : 'z';
  const axis =
    direction === 'distance'
      ? 'distance'
      : direction === 'horizontal'
        ? horizontal
        : direction === 'vertical'
          ? vertical
          : Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1])
            ? horizontal
            : vertical;
  const offset: Vec3 = [0, 0, 0];
  offset[axisIndex[horizontal]] = cursor[0] - a[0];
  offset[axisIndex[vertical]] = -(cursor[1] - a[1]);
  return {
    id: 'drawing-preview',
    kind: 'points',
    axis,
    start: picks[0].anchor,
    end: picks[1].anchor,
    fallback: [picks[0].point, picks[1].point],
    offset,
    normal: view === 'front' ? [0, -1, 0] : view === 'right' ? [1, 0, 0] : [0, 0, 1],
  };
}

/** Translate an existing annotation in its drawing plane; the measured endpoints are unchanged. */
export function shiftDrawingDimension(
  dimension: PointDimension,
  delta: [number, number],
  view: DrawingView,
): PointDimension {
  const horizontal = view === 'right' ? 1 : 0,
    vertical = view === 'top' ? 1 : 2;
  const offset = [...dimension.offset] as Vec3;
  offset[horizontal] += delta[0];
  offset[vertical] -= delta[1];
  return { ...dimension, offset };
}
