import { parseLength } from './units';
import type { FaceTarget } from '../cad/protocol';
import { dot, sub, unit } from './geometry';

/** Match the picked point's level along the source normal, without tilting the source. */
export function faceDepthSnap(source: FaceTarget, target: FaceTarget) {
  if (source.bodyId === target.bodyId && source.face === target.face) return;
  const normal = unit(source.normal);
  return {
    distance: dot(sub(target.point, source.point), normal),
    parallel: Math.abs(dot(normal, unit(target.normal))) > 1 - 1e-6,
  };
}

export type ExtrusionMode = 'height' | 'remaining';

/** An explicit sign overrides the drag direction; an unsigned value follows it. */
export function extrusionDistance(value: string, direction: number): number {
  const distance = parseLength(value, true, true);
  return /^[+-]/.test(value.trim()) ? distance : distance * (direction < 0 ? -1 : 1);
}

export function distanceToSize(value: string, current: number, solid: boolean, direction: number) {
  const size = parseLength(value, false, solid);
  return solid ? size - current : size * (direction < 0 ? -1 : 1);
}

export function transferExtrusionValue(value: string, mode: ExtrusionMode): string {
  return mode === 'remaining' ? value.trim().replace(/^[+-]\s*/, '') : value;
}

export function inputNumber(value: number): string {
  return String(Math.round(value * 1e8) / 1e8);
}
