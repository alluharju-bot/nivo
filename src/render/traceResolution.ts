/** Interactive preview budget; export jobs retain their explicitly chosen size.
 * 3 MP bounds lighting accumulators, guide images and shared filter scratch,
 * independent of DPR. Opaque tracing leaves alpha fallback targets at 1×1.
 * Start slightly coarser than the old 800 px preview and grow at rest. */
export const previewPixelBudget = 3_000_000;
export function traceResolutions(width: number, height: number) {
  const maximum = Math.min(
    1,
    2560 / Math.max(width, height),
    Math.sqrt(previewPixelBudget / (width * height)),
  );
  // Work backwards from the final size so each coarse pixel has four children.
  // Apart from one-pixel rounding, a retained parent costs at most 1/4 of the
  // current image. Avoid a nearly-full-sized extra target at the final step.
  const scales = [maximum];
  while (scales[0] * Math.max(width, height) > 640) scales.unshift(scales[0] / 2);
  return scales.map((scale) => ({
    scale,
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  }));
}
