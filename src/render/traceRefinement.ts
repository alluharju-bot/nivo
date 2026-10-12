/** Display-only history, never counted as additional path-tracing samples.
 * Entirely retire the coarse estimate so it cannot blur the final result. */
export const refinementSamples = 8;
export function coarseImageWeight(samples: number) {
  const t = Math.min(1, Math.max(0, samples / refinementSamples));
  return 1 - t * t * (3 - 2 * t);
}
