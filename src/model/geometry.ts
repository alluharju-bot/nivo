import type { Axis, Vec3, WorkPlane } from './project';
export const add = (a: Vec3, b: Vec3): Vec3 => a.map((n, i) => n + b[i]) as Vec3;
export const sub = (a: Vec3, b: Vec3): Vec3 => a.map((n, i) => n - b[i]) as Vec3;
export const scale = (a: Vec3, s: number): Vec3 => a.map((n) => n * s) as Vec3;
export const dot = (a: Vec3, b: Vec3) => a.reduce((s, n, i) => s + n * b[i], 0);
export const unit = (v: Vec3): Vec3 => scale(v, 1 / (Math.hypot(...v) || 1));
export const axisVector = (axis: Axis): Vec3 =>
  axis === 'x' ? [1, 0, 0] : axis === 'y' ? [0, 1, 0] : [0, 0, 1];
export const projectOnLine = (point: Vec3, start: Vec3, direction: Vec3): Vec3 =>
  add(start, scale(unit(direction), dot(sub(point, start), unit(direction))));
export function planeForDirection(direction: Vec3, preferred: WorkPlane): WorkPlane {
  const normal = preferred === 'XY' ? 2 : preferred === 'XZ' ? 1 : 0;
  if (Math.abs(direction[normal]) < 1e-6) return preferred;
  return Math.abs(direction[1]) < 1e-6 ? 'XZ' : Math.abs(direction[0]) < 1e-6 ? 'YZ' : preferred;
}
