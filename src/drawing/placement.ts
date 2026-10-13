import { drawingFrame, drawingDelta } from '../model/drawingViews';
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
  const horizontal: Axis = drawingFrame(view).horizontal,
    vertical: Axis = drawingFrame(view).vertical;
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
  const offset = drawingDelta([cursor[0] - a[0], cursor[1] - a[1]], view);
  return {
    id: 'drawing-preview',
    kind: 'points',
    axis,
    start: picks[0].anchor,
    end: picks[1].anchor,
    fallback: [picks[0].point, picks[1].point],
    offset,
    normal: drawingFrame(view).normal,
  };
}

/** Translate an existing annotation in its drawing plane; the measured endpoints are unchanged. */
export function shiftDrawingDimension(
  dimension: PointDimension,
  delta: [number, number],
  view: DrawingView,
): PointDimension {
  const change = drawingDelta(delta, view);
  const offset = dimension.offset.map((n, i) => n + change[i]) as Vec3;
  return { ...dimension, offset };
}
