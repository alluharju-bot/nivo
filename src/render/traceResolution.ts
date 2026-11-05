/** Conservative peak framebuffer estimate, including float32 accumulation,
 * cached beauty, lighting filters, guides, depth and retained coarse image.
 * Geometry and the separately bounded texture atlas are not included. */
export const traceBytesPerPixel = 192;
export const previewPixelBudget = 8_388_608;
export type TracePreviewLimits = { pixelBudget: number; maxSide: number; bytesPerPixel: number };

export function tracePreviewLimits(
  options: {
    coarsePointer?: boolean;
    deviceMemory?: number;
    floatBlend?: boolean;
    maxTextureSize?: number;
  } = {},
): TracePreviewLimits {
  // Native 4K/Retina on desktop; tablets retain roughly the previous 3 MP
  // working set. deviceMemory is system RAM, not available VRAM: these are
  // conservative policy limits, never a claim about free GPU memory.
  const mib =
    options.deviceMemory !== undefined && options.deviceMemory <= 2
      ? 384
      : options.coarsePointer || (options.deviceMemory !== undefined && options.deviceMemory <= 4)
        ? 576
        : 1536;
  const bytesPerPixel = traceBytesPerPixel + (options.floatBlend === false ? 96 : 0);
  return {
    pixelBudget: Math.floor((mib * 1024 * 1024) / bytesPerPixel),
    maxSide: Math.min(8192, options.maxTextureSize ?? 8192),
    bytesPerPixel,
  };
}

/** Reach the actual drawing-buffer resolution when it fits the memory policy.
 * Export jobs retain their explicitly chosen size. Only a settled camera grows
 * to full resolution; the first frame and moving preview stay lightweight. */
export function traceResolutions(width: number, height: number, limits = tracePreviewLimits()) {
  const maximum = Math.min(
    1,
    limits.maxSide / Math.max(width, height),
    Math.sqrt(limits.pixelBudget / (width * height)),
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
