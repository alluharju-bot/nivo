import { highlightDash } from '../model/highlightStyle';
import type { DrawingAnnotation } from '../model/drawingAnnotations';
import type { Sheet } from './svg';

const esc = (s: string) =>
  s.replace(
    /[<>&"']/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!,
  );
const n = (v: number) => Number(v.toFixed(3));
export function annotationLines(m: DrawingAnnotation): string[] {
  const capacity = Math.max(1, Math.floor((m.width - 6) / (m.fontSize * 0.56)));
  return m.text.split('\n').flatMap((line) => {
    if (!line) return [''];
    const result: string[] = [];
    while (line.length > capacity) {
      const space = line.lastIndexOf(' ', capacity);
      const at = space > capacity / 3 ? space : capacity;
      result.push(line.slice(0, at));
      line = line.slice(at).trimStart();
    }
    result.push(line);
    return result;
  });
}
export function fitAnnotation(m: DrawingAnnotation): DrawingAnnotation {
  const width = Math.min(277, Math.max(m.kind === 'note' ? 20 : 4, m.width));
  const height =
    m.kind === 'note'
      ? Math.max(12, annotationLines({ ...m, width }).length * m.fontSize * 1.4 + 6)
      : Math.max(4, m.height);
  return {
    ...m,
    width,
    height: Math.min(190, height),
    x: Math.max(10, Math.min(287 - width, m.x)),
    y: Math.max(10, Math.min(200 - Math.min(190, height), m.y)),
  };
}
export function pageAnnotationsSvg(markups: DrawingAnnotation[], selected?: string): string {
  return markups
    .filter((m) => !m.hidden)
    .map((m) => {
      const chosen = m.id === selected,
        stroke = m.kind === 'highlight' ? m.color : chosen ? '#d87820' : m.color;
      const dash =
        m.kind === 'highlight' ? highlightDash(m.lineStyle ?? 'dashed', 0.25) : undefined;
      const width = m.kind === 'highlight' ? (m.lineWidth ?? 1.4) * 0.25 : chosen ? 0.7 : 0.35;
      const lines = annotationLines(m);
      const visible = lines.slice(0, Math.max(1, Math.floor((m.height - 5) / (m.fontSize * 1.4))));
      if (visible.length < lines.length)
        visible[visible.length - 1] = visible.at(-1)!.slice(0, -1) + '…';
      return `<g data-paper-annotation="${esc(m.id)}" data-kind="${m.kind}" data-selected="${chosen}"><rect x="${n(m.x)}" y="${n(m.y)}" width="${n(m.width)}" height="${n(m.height)}" rx="${m.kind === 'note' ? 1.2 : 0.8}" fill="${m.color}" fill-opacity="${m.kind === 'note' ? 0.1 : (m.fillOpacity ?? 0.15)}" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" ${dash ? `stroke-dasharray="${dash}"` : ''}/>${m.kind === 'note' ? `<text fill="#243630" font-family="Arial, sans-serif" font-size="${m.fontSize}" font-weight="${m.bold ? 600 : 400}">${visible.map((s, i) => `<tspan x="${n(m.x + 3)}" y="${n(m.y + 4 + m.fontSize + i * m.fontSize * 1.4)}">${esc(s)}</tspan>`).join('')}</text>` : ''}${chosen ? `<rect data-annotation-resize="true" x="${n(m.x + m.width - 1.5)}" y="${n(m.y + m.height - 1.5)}" width="3" height="3" fill="#fff" stroke="#d87820" stroke-width=".5"/>` : ''}</g>`;
    })
    .join('');
}
export function annotateSheet(
  sheet: Sheet,
  markups: DrawingAnnotation[],
  selected?: string,
): Sheet {
  const content = pageAnnotationsSvg(markups, selected);
  return { ...sheet, svg: sheet.svg.replace('</svg>', `${content}</svg>`) };
}
