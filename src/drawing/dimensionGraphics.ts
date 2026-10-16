import type { DimensionLineStyle } from '../model/annotationStyle';

type Point = readonly number[];
const n = (v: number) => Number(v.toFixed(5));
const line = (a: Point, b: Point) => `M${n(a[0])} ${n(a[1])}L${n(b[0])} ${n(b[1])}`;
const along = (p: Point, x: number, y: number, distance: number): Point => [
  p[0] + x * distance,
  p[1] + y * distance,
];

export function dimensionLabelBounds(length: number, rotation: number) {
  const angle = (rotation * Math.PI) / 180,
    width = length * 1.85 + 3,
    height = 5;
  return {
    width: Math.abs(Math.cos(angle)) * width + Math.abs(Math.sin(angle)) * height,
    height: Math.abs(Math.sin(angle)) * width + Math.abs(Math.cos(angle)) * height,
  };
}

/** Screen pixels, or paper millimetres with unit=0.25. Geometry is never moved. */
export function dimensionPaths(
  start: Point,
  end: Point,
  a: Point,
  b: Point,
  style: DimensionLineStyle = 'drafting',
  unit = 1,
) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    length = Math.hypot(dx, dy);
  if (length < 1e-8) return { solid: '', dashed: '', hit: '', dashArray: '' };
  const ux = dx / length,
    uy = dy / length,
    nx = -uy,
    ny = ux;
  const solid: string[] = [],
    dashed: string[] = [],
    hit: string[] = [];
  const main = line(along(a, ux, uy, -2 * unit), along(b, ux, uy, 2 * unit));
  solid.push(main);
  hit.push(main);
  const tx = style === 'drafting' ? (ux - nx) / Math.SQRT2 : nx;
  const ty = style === 'drafting' ? (uy - ny) / Math.SQRT2 : ny;
  for (const p of [a, b]) solid.push(line(along(p, tx, ty, -4 * unit), along(p, tx, ty, 4 * unit)));
  for (const [source, target] of [
    [start, a],
    [end, b],
  ]) {
    const distance = Math.hypot(target[0] - source[0], target[1] - source[1]);
    if (distance < 1e-8) continue;
    const ex = (target[0] - source[0]) / distance,
      ey = (target[1] - source[1]) / distance;
    const from = along(source, ex, ey, Math.min(2 * unit, distance / 4));
    const to = along(target, ex, ey, 5 * unit);
    hit.push(line(from, to));
    if (style === 'solid' || distance < 24 * unit) solid.push(line(from, to));
    else {
      const first = along(source, ex, ey, 10 * unit),
        last = along(target, ex, ey, -7 * unit);
      solid.push(line(from, first), line(last, to));
      dashed.push(line(first, last));
    }
  }
  return {
    solid: solid.join(' '),
    dashed: dashed.join(' '),
    hit: hit.join(' '),
    dashArray: `${4 * unit} ${3 * unit}`,
  };
}

/** Shared SVG export keeps the same markings as the viewport, with a clear text gap. */
export function dimensionSvg(
  start: Point,
  end: Point,
  a: Point,
  b: Point,
  escapedLabel: string,
  labelLength: number,
  rotation = 0,
  style: DimensionLineStyle = 'drafting',
) {
  const paths = dimensionPaths(start, end, a, b, style, 0.25);
  const width = labelLength * 1.85 + 3;
  return `<path class="dimension-line" d="${paths.solid}"/>${paths.dashed ? `<path class="dimension-extension" stroke-dasharray="${paths.dashArray}" d="${paths.dashed}"/>` : ''}<g class="dimension-label" transform="translate(${n((a[0] + b[0]) / 2)} ${n((a[1] + b[1]) / 2)}) rotate(${n(rotation)})"><rect x="${n(-width / 2)}" y="-2.5" width="${n(width)}" height="5" rx="0.5" fill="white" stroke="none"/><text x="0" y="1.1" text-anchor="middle" stroke="none" fill="currentColor" font-family="Arial, sans-serif" font-size="3.2">${escapedLabel}</text></g>`;
}
