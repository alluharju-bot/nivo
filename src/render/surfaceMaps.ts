/** Linear height data. White is high; image rows run downward, OpenGL tangent Y upward. */
export function normalPixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  physical?: { width: number; height: number; depth: number },
) {
  const output = new Uint8ClampedArray(width * height * 4);
  const value = (x: number, y: number) => {
    const i = (((y + height) % height) * width + ((x + width) % width)) * 4;
    return (pixels[i] * 0.2126 + pixels[i + 1] * 0.7152 + pixels[i + 2] * 0.0722) / 255;
  };
  const sx = physical ? (physical.depth * width) / (2 * physical.width) : 2;
  const sy = physical ? (physical.depth * height) / (2 * physical.height) : 2;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const nx = (value(x - 1, y) - value(x + 1, y)) * sx;
      const ny = (value(x, y + 1) - value(x, y - 1)) * sy;
      const length = Math.hypot(nx, ny, 1);
      const i = (y * width + x) * 4;
      output[i] = ((nx / length) * 0.5 + 0.5) * 255;
      output[i + 1] = ((ny / length) * 0.5 + 0.5) * 255;
      output[i + 2] = ((1 / length) * 0.5 + 0.5) * 255;
      output[i + 3] = 255;
    }
  return output;
}

/** A restrained approximation from albedo; explicit PBR maps always take precedence. */
export function roughnessPixels(pixels: Uint8ClampedArray) {
  const result = new Uint8ClampedArray(pixels.length);
  for (let i = 0; i < pixels.length; i += 4) {
    const brightness = pixels[i] * 0.2126 + pixels[i + 1] * 0.7152 + pixels[i + 2] * 0.0722;
    result[i] = result[i + 1] = result[i + 2] = 210 + (255 - brightness) * 0.17;
    result[i + 3] = 255;
  }
  return result;
}

export function sourceSize(source: CanvasImageSource, max = 1024) {
  const image = source as HTMLImageElement;
  const width = image.naturalWidth || Number(image.width) || 1;
  const height = image.naturalHeight || Number(image.height) || 1;
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function derivedCanvas(
  source: CanvasImageSource,
  kind: 'normal' | 'roughness',
  physical?: { width: number; height: number; depth: number },
) {
  const { width, height } = sourceSize(source);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(source, 0, 0, width, height);
  const input = context.getImageData(0, 0, width, height);
  const output = context.createImageData(width, height);
  output.data.set(
    kind === 'normal'
      ? normalPixels(input.data, width, height, physical)
      : roughnessPixels(input.data),
  );
  context.putImageData(output, 0, 0);
  return canvas;
}
