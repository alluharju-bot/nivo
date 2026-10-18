import type { SurfaceLayer } from '../model/surfaceLayerSchema';
import { facadeNoise } from './facade';

const clamp = (n: number) => Math.max(0, Math.min(1, n));
/** Continuous, seeded islands. Millimetre scale is independent of substrate UV placement. */
export function paintCoverage(layer: SurfaceLayer, u: number, v: number, footprint: number) {
  if (layer.amount === 0) return 1;
  if (layer.amount === 1) return 0;
  const angle = (layer.rotation * Math.PI) / 180;
  const size = layer.chipSize ?? 30;
  const x = u - (layer.center?.[0] ?? 0),
    y = v - (layer.center?.[1] ?? 0);
  const a = (Math.cos(angle) * x + Math.sin(angle) * y) / size;
  const b = (-Math.sin(angle) * x + Math.cos(angle) * y) / size;
  // Very long period: no small repeating tile or discontinuity at negative UVs.
  const n = (frequency: number, salt: number) =>
    facadeNoise((a * frequency) / 4096, (b * frequency) / 4096, 4096, 4096, layer.seed + salt);
  const field = n(1, 0) * 0.65 + n(4, 1) * 0.25 + n(13, 2) * 0.1;
  const threshold = 0.12 + layer.amount * 0.76;
  const feather = Math.min(0.25, 0.012 + (footprint / size) * 0.5);
  const t = clamp((field - threshold) / feather + 0.5);
  return t * t * (3 - 2 * t);
}
