import { parseLength } from './units';

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
