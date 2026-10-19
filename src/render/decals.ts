import type { DecalPath, DecalSource, MaskStroke } from '../model/decals';
import type { TextureAsset } from '../model/materials';
import type { SampleTexture } from '../surface/bake';
import type { LayerDomain } from './layerPixels';

const fonts = new Map<string, Promise<FontFace>>();
export function decalFont(font: string) {
  let ready = fonts.get(font);
  if (!ready) {
    const face = new FontFace(
      `Nivo-${font}`,
      `url(${import.meta.env.BASE_URL}fonts/decals/${font}.ttf)`,
    );
    ready = face.load().then((loaded) => {
      document.fonts.add(loaded);
      return loaded;
    });
    fonts.set(font, ready);
    void ready.catch(() => fonts.delete(font));
  }
  return ready;
}
export function drawDecalPaths(
  ctx: CanvasRenderingContext2D,
  paths: DecalPath[],
  w: number,
  h: number,
) {
  ctx.save();
  ctx.lineJoin = ctx.lineCap = 'round';
  ctx.fillStyle = ctx.strokeStyle = '#ffffff';
  for (const path of paths) {
    ctx.globalCompositeOperation = path.erase ? 'destination-out' : 'source-over';
    ctx.lineWidth = path.width * Math.min(w, h);
    const p = path.points.map(([x, y]) => [x * w, y * h]);
    const [a, b = a] = p;
    ctx.beginPath();
    if (path.kind === 'rectangle')
      ctx.rect(
        Math.min(a[0], b[0]),
        Math.min(a[1], b[1]),
        Math.abs(b[0] - a[0]),
        Math.abs(b[1] - a[1]),
      );
    else if (path.kind === 'ellipse')
      ctx.ellipse(
        (a[0] + b[0]) / 2,
        (a[1] + b[1]) / 2,
        Math.abs(b[0] - a[0]) / 2,
        Math.abs(b[1] - a[1]) / 2,
        0,
        0,
        Math.PI * 2,
      );
    else {
      ctx.moveTo(...(a as [number, number]));
      if (path.kind === 'bezier' && p.length === 4)
        ctx.bezierCurveTo(p[1][0], p[1][1], p[2][0], p[2][1], p[3][0], p[3][1]);
      else {
        for (const q of p.slice(1)) ctx.lineTo(q[0], q[1]);
        if (p.length === 1) ctx.lineTo(a[0] + 0.01, a[1]);
      }
    }
    if (path.fill && !['pen', 'line', 'bezier'].includes(path.kind)) ctx.fill();
    else ctx.stroke();
  }
  ctx.restore();
}
export async function drawDecal(
  canvas: HTMLCanvasElement,
  source: DecalSource,
  assets: Record<string, TextureAsset>,
) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!,
    w = canvas.width,
    h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (source.type === 'drawing') {
    drawDecalPaths(ctx, source.paths, w, h);
    return;
  }
  if (source.type === 'image') {
    const asset = assets[source.assetId];
    if (!asset) throw new Error('Tarran kuva puuttuu projektista.');
    const image = new Image();
    image.src = asset.dataUrl;
    await image.decode();
    const s = Math.min(w / image.width, h / image.height);
    ctx.drawImage(
      image,
      (w - image.width * s) / 2,
      (h - image.height * s) / 2,
      image.width * s,
      image.height * s,
    );
    return;
  }
  await decalFont(source.font);
  const lines = source.text.split('\n'),
    size = 100;
  ctx.font = `${size}px Nivo-${source.font}`;
  const widths = lines.map(
    (line) =>
      [...line].reduce((sum, char) => sum + ctx.measureText(char).width, 0) +
      Math.max(0, [...line].length - 1) * source.spacing * size,
  );
  const scale = Math.min(
    (w * 0.96) / Math.max(1, ...widths),
    (h * 0.88) / (lines.length * size * 1.2),
  );
  ctx.save();
  ctx.scale(scale, scale);
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  lines.forEach((line, index) => {
    let x =
      source.align === 'left'
        ? (w * 0.02) / scale
        : source.align === 'right'
          ? (w * 0.98) / scale - widths[index]
          : (w / scale - widths[index]) / 2;
    const y = h / scale / 2 + (index - (lines.length - 1) / 2) * size * 1.2;
    for (const char of line) {
      ctx.fillText(char, x, y);
      x += ctx.measureText(char).width + source.spacing * size;
    }
  });
  ctx.restore();
}
export function canvasSample(canvas: HTMLCanvasElement, srgb = false): SampleTexture {
  return {
    width: canvas.width,
    height: canvas.height,
    pixels: canvas
      .getContext('2d', { willReadFrequently: true })!
      .getImageData(0, 0, canvas.width, canvas.height).data,
    matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    flipY: true,
    wrapS: 1001,
    wrapT: 1001,
    srgb,
  };
}
/** User strokes stay in face UV millimetres. Only their temporary mask is rasterized. */
export function drawWearMask(
  strokes: MaskStroke[],
  domain: LayerDomain,
  width: number,
  height: number,
) {
  const result = document.createElement('canvas');
  result.width = width;
  result.height = height;
  const ctx = result.getContext('2d', { willReadFrequently: true })!;
  const stroke = document.createElement('canvas');
  stroke.width = width;
  stroke.height = height;
  const s = stroke.getContext('2d')!;
  const sx = width / domain.width,
    sy = height / domain.height;
  for (const mark of strokes) {
    s.clearRect(0, 0, width, height);
    s.save();
    s.scale(sx, sy);
    s.translate(-domain.x, domain.y + domain.height);
    s.scale(1, -1);
    s.lineWidth = mark.radius * 2;
    s.lineCap = s.lineJoin = 'round';
    s.strokeStyle = 'white';
    s.beginPath();
    s.moveTo(...mark.points[0]);
    mark.points.slice(1).forEach((point, index) => {
      if (mark.breaks?.includes(index + 1)) {
        s.moveTo(...point);
        s.lineTo(point[0] + 0.001, point[1]);
      } else s.lineTo(...point);
    });
    if (mark.points.length === 1) s.lineTo(mark.points[0][0] + 0.001, mark.points[0][1]);
    s.stroke();
    s.restore();
    ctx.globalCompositeOperation = mark.erase ? 'destination-out' : 'source-over';
    ctx.globalAlpha = mark.strength;
    ctx.filter = `blur(${(1 - mark.hardness) * mark.radius * Math.min(sx, sy) * 0.35}px)`;
    ctx.drawImage(stroke, 0, 0);
  }
  return canvasSample(result);
}
