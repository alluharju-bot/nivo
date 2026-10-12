/** Interactive preview budget; export jobs retain their explicitly chosen size.
 * 3 MP keeps three RGBA32F accumulation targets below 144 MB, independent of DPR.
 * Start slightly coarser than the old 800 px preview and grow at rest. */
export const previewPixelBudget = 3_000_000;
export function traceResolutions(width: number, height: number) {
  const maximum = Math.min(
    1,
    2560 / Math.max(width, height),
    Math.sqrt(previewPixelBudget / (width * height)),
  );
  const first = Math.min(maximum, 640 / Math.max(width, height));
  const scales = [first];
  while (scales.at(-1)! < maximum) scales.push(Math.min(maximum, scales.at(-1)! * 1.5));
  return scales.map((scale) => ({
    scale,
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  }));
}
