import type { Axis, Vec3 } from './project';

export const drawingViews = ['front', 'right', 'top', 'back', 'left', 'bottom'] as const;
export type DrawingView = (typeof drawingViews)[number];
export const viewLabels: Record<DrawingView, string> = {
  front: 'Etukuva',
  right: 'Sivukuva',
  top: 'Yläkuva',
  back: 'Takakuva',
  left: 'Vasen sivu',
  bottom: 'Alakuva',
};
/** Right-handed orthographic frames, shared by CAD, picking and dimension placement. */
export function drawingFrame(view: DrawingView): {
  normal: Vec3;
  u: Vec3;
  v: Vec3;
  horizontal: Axis;
  vertical: Axis;
} {
  switch (view) {
    case 'front':
      return { normal: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1], horizontal: 'x', vertical: 'z' };
    case 'back':
      return { normal: [0, 1, 0], u: [-1, 0, 0], v: [0, 0, 1], horizontal: 'x', vertical: 'z' };
    case 'right':
      return { normal: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1], horizontal: 'y', vertical: 'z' };
    case 'left':
      return { normal: [-1, 0, 0], u: [0, -1, 0], v: [0, 0, 1], horizontal: 'y', vertical: 'z' };
    case 'top':
      return { normal: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], horizontal: 'x', vertical: 'y' };
    case 'bottom':
      return { normal: [0, 0, -1], u: [1, 0, 0], v: [0, -1, 0], horizontal: 'x', vertical: 'y' };
  }
}
export function projectDrawingPoint(point: Vec3, view: DrawingView): [number, number] {
  const { u, v } = drawingFrame(view);
  return [point.reduce((s, n, i) => s + n * u[i], 0), -point.reduce((s, n, i) => s + n * v[i], 0)];
}
export function drawingDelta(delta: [number, number], view: DrawingView): Vec3 {
  const { u, v } = drawingFrame(view);
  return u.map((n, i) => n * delta[0] - v[i] * delta[1]) as Vec3;
}
