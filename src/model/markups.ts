import type { AreaMarkup, Markup, NoteMarkup, Body, Vec3 } from './project';
import { resolveAnchor } from './guides';
import { add } from './geometry';
import { fromUV, toUV, sketchFrame } from './sketch';
export type AreaRect = [number, number, number, number];
type Interval = [number, number];
export interface AreaUnion {
  area: number;
  cells: AreaRect[];
  edges: [number, number, number, number][];
  center: [number, number];
}
const cache = new WeakMap<AreaRect[], AreaUnion>();
/** Exact union of coplanar rectangles: overlap contributes once, including islands and holes. */
export function areaUnion(rectangles: AreaRect[]): AreaUnion {
  const cached = cache.get(rectangles);
  if (cached) return cached;
  const xs = [...new Set(rectangles.flatMap((r) => [r[0], r[2]]))].sort((a, b) => a - b);
  const cells: AreaRect[] = [],
    edges: AreaUnion['edges'] = [];
  let area = 0,
    cx = 0,
    cy = 0,
    previous: Interval[] = [];
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i],
      next = xs[i + 1];
    const intervals: Interval[] = [];
    if (next !== undefined) {
      const active = rectangles
        .filter((r) => r[0] < next && r[2] > x)
        .map((r) => [r[1], r[3]] as Interval)
        .sort((a, b) => a[0] - b[0]);
      for (const r of active) {
        const last = intervals.at(-1);
        if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
        else intervals.push([...r]);
      }
    }
    const ys = [...new Set([...previous, ...intervals].flat())].sort((a, b) => a - b);
    for (let j = 0; j < ys.length - 1; j++) {
      const m = (ys[j] + ys[j + 1]) / 2;
      if (
        previous.some((r) => r[0] < m && r[1] > m) !== intervals.some((r) => r[0] < m && r[1] > m)
      )
        edges.push([x, ys[j], x, ys[j + 1]]);
    }
    for (const [y1, y2] of intervals) {
      const a = (next - x) * (y2 - y1);
      area += a;
      cx += (a * (x + next)) / 2;
      cy += (a * (y1 + y2)) / 2;
      cells.push([x, y1, next, y2]);
      edges.push([x, y1, next, y1], [x, y2, next, y2]);
    }
    previous = intervals;
  }
  const result: AreaUnion = { area, cells, edges, center: area ? [cx / area, cy / area] : [0, 0] };
  cache.set(rectangles, result);
  return result;
}
const areaFormatter = new Intl.NumberFormat('fi-FI', { maximumFractionDigits: 3 });
export const areaText = (area: number) => `${areaFormatter.format(area / 1_000_000)} m²`;
/** Rotate the unfinished area around its first picked corner without changing its union. */
export function reframeArea(area: AreaMarkup, normal: Vec3, pivot: Vec3): AreaMarkup {
  const uv = toUV(pivot, area.frame);
  return {
    ...area,
    frame: sketchFrame(pivot, normal),
    rectangles: area.rectangles.map(([x, y, r, b]) => [x - uv[0], y - uv[1], r - uv[0], b - uv[1]]),
  };
}
export function noteTarget(note: NoteMarkup, bodies: Body[]) {
  return resolveAnchor(bodies, note.anchor) ?? note.fallback;
}
export function notePosition(note: NoteMarkup, bodies: Body[]) {
  return add(noteTarget(note, bodies), note.offset);
}
export function markupName(markup: Markup) {
  return markup.kind === 'area' ? markup.name : markup.text.split('\n')[0] || 'Huomautus';
}
/** Shared label metrics keep screen labels and printable page bounds in agreement. */
export function markupLabel(markup: Markup) {
  const font = markup.kind === 'area' ? 14 : markup.fontSize;
  const lines = (markup.kind === 'area' ? markup.name : markup.text)
    .split('\n')
    .flatMap((line) => line.match(/.{1,38}(?:\s|$)|.{1,38}/g)?.map((s) => s.trim()) ?? ['']);
  if (markup.kind === 'area') lines.push(areaText(areaUnion(markup.rectangles).area));
  return {
    lines,
    width: Math.max(36, ...lines.map((s) => s.length * font * 0.6 + 18)),
    height: lines.length * font * 1.35 + 12,
  };
}
export function markupLabelPosition(markup: Markup, bodies: Body[]) {
  return markup.kind === 'area'
    ? fromUV(areaUnion(markup.rectangles).center, markup.frame)
    : notePosition(markup, bodies);
}
export function markupPoints(markup: Markup, bodies: Body[]): Vec3[] {
  return markup.kind === 'note'
    ? [
        ...(markup.leader === false ? [] : [noteTarget(markup, bodies)]),
        notePosition(markup, bodies),
      ]
    : areaUnion(markup.rectangles).cells.flatMap(([x, y, r, b]) =>
        [
          [x, y],
          [r, y],
          [r, b],
          [x, b],
        ].map((p) => fromUV(p as [number, number], markup.frame)),
      );
}
export function areaContains(area: AreaMarkup, uv: [number, number]) {
  return area.rectangles.some(
    ([x, y, r, b]) => uv[0] >= x && uv[0] <= r && uv[1] >= y && uv[1] <= b,
  );
}
