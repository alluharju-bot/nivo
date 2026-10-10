/** Five recent distinct dimensions, newest first. Invalid/unfinished input is never remembered. */
export function rememberMeasures(previous: readonly number[], values: readonly number[]): number[] {
  let next = [...previous];
  for (const raw of values) {
    const value = Math.round(Math.abs(raw) * 1e6) / 1e6;
    if (!Number.isFinite(value) || value < 0.1 || value > 100_000) continue;
    next = [value, ...next.filter((n) => Math.abs(n - value) > 1e-5)].slice(0, 5);
  }
  return next;
}

/** Small on-screen attraction, with a physical cap to avoid jumps near zero or edge-on planes. */
export function nearestRememberedMeasure(
  value: number,
  memory: readonly number[],
  pixelsAway: (candidate: number) => number,
): number | undefined {
  if (!Number.isFinite(value) || value < 0.1) return;
  let result: number | undefined,
    best = 5;
  for (const candidate of memory) {
    if (Math.abs(candidate - value) > Math.max(0.5, value * 0.05)) continue;
    const pixels = pixelsAway(candidate);
    if (Number.isFinite(pixels) && pixels < best) {
      best = pixels;
      result = candidate;
    }
  }
  return result;
}

export const memoryMaySnap = (key: string) =>
  ['', 'free', 'grid', 'axis', 'axis-hint', 'direction', 'edge-offset', 'recent-measure'].includes(
    key,
  ) || key.startsWith('direction:');
