import type { Body, Markup, Vec3 } from '../model/project';
import { areaUnion, markupLabel, notePosition, noteTarget } from '../model/markups';
import { fromUV } from '../model/sketch';
import { resolveAnchor } from '../model/guides';
const esc = (s: string) =>
  s.replace(
    /[<>&"']/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!,
  );
const n = (v: number) => Number(v.toFixed(3));
/** Keep pickable label elements alive while the camera or their style changes. */
export function updateMarkupSvg(svg: SVGSVGElement, content: string) {
  const staging = svg.cloneNode(false) as SVGSVGElement;
  staging.innerHTML = content;
  const sync = (target: Element, source: Element) => {
    for (const attr of [...target.attributes])
      if (!source.hasAttribute(attr.name)) target.removeAttribute(attr.name);
    for (const attr of [...source.attributes])
      if (target.getAttribute(attr.name) !== attr.value) target.setAttribute(attr.name, attr.value);
    [...source.childNodes].forEach((node, i) => {
      const old = target.childNodes[i];
      if (old instanceof Element && node instanceof Element && old.tagName === node.tagName)
        sync(old, node);
      else if (old?.nodeType === Node.TEXT_NODE && node.nodeType === Node.TEXT_NODE) {
        if (old.textContent !== node.textContent) old.textContent = node.textContent;
      } else if (old) old.replaceWith(node.cloneNode(true));
      else target.append(node.cloneNode(true));
    });
    while (target.childNodes.length > source.childNodes.length) target.lastChild!.remove();
  };
  const existing = new Map([...svg.children].map((el) => [el.getAttribute('data-markup'), el]));
  [...staging.children].forEach((source, i) => {
    const id = source.getAttribute('data-markup'),
      target = existing.get(id) ?? (source.cloneNode(true) as Element);
    existing.delete(id);
    sync(target, source);
    if (svg.children[i] !== target) svg.insertBefore(target, svg.children[i] ?? null);
  });
  existing.forEach((el) => el.remove());
}
export function markupSvg(
  markups: Markup[],
  bodies: Body[],
  project: (p: Vec3) => [number, number, number],
  selected: string[] = [],
  size = 1,
) {
  return markups
    .filter((m) => !m.hidden)
    .map((m) => {
      const chosen = selected.includes(m.id),
        stroke = chosen ? '#e57820' : m.color;
      const layout = markupLabel(m),
        label = layout.lines;
      let paths = '',
        at: number[],
        font = 14 * size,
        bold = true,
        background = m.color,
        textColor = '#263c36',
        shape = 'rounded';
      if (m.kind === 'area') {
        const union = areaUnion(m.rectangles),
          p = (u: number, v: number) => project(fromUV([u, v], m.frame));
        const points = union.cells.flatMap(([x, y, r, b]) => [p(x, y), p(r, y), p(r, b), p(x, b)]);
        if (!points.length || points.some((p) => p[2] !== undefined && Math.abs(p[2]) > 1))
          return '';
        // An edge-on region has no legible surface to annotate in this view.
        const cell = union.cells[0],
          corners = [p(cell[0], cell[1]), p(cell[2], cell[1]), p(cell[2], cell[3])];
        if (
          Math.abs(
            (corners[1][0] - corners[0][0]) * (corners[2][1] - corners[0][1]) -
              (corners[1][1] - corners[0][1]) * (corners[2][0] - corners[0][0]),
          ) < 0.001
        )
          return '';
        paths = `<path class="area-fill" fill="${m.color}" fill-opacity="${chosen ? 0.32 : 0.18}" stroke="none" d="${union.cells.map(([x, y, r, b]) => `M${p(x, y).slice(0, 2).map(n)}L${p(r, y).slice(0, 2).map(n)}L${p(r, b).slice(0, 2).map(n)}L${p(x, b).slice(0, 2).map(n)}Z`).join('')}"/><path fill="none" stroke="${stroke}" stroke-width="${(chosen ? 2.5 : 1.5) * size}" d="${union.edges.map(([x, y, r, b]) => `M${p(x, y).slice(0, 2).map(n)}L${p(r, b).slice(0, 2).map(n)}`).join('')}"/>`;
        at = p(...union.center);
        background = '#f7fbf7';
      } else {
        const target = project(noteTarget(m, bodies));
        at = project(notePosition(m, bodies));
        if ([target, at].some((p) => p[2] !== undefined && Math.abs(p[2]) > 1)) return '';
        font = m.fontSize * size;
        bold = m.bold;
        background = m.color;
        textColor = m.textColor;
        shape = m.shape;
        const orphan = !resolveAnchor(bodies, m.anchor);
        paths = `<path class="note-leader" fill="none" stroke="${orphan ? '#b74434' : chosen ? '#e57820' : textColor}" stroke-width="${1.5 * size}" ${orphan ? 'stroke-dasharray="4 3"' : ''} d="M${target.slice(0, 2).map(n)}L${at.slice(0, 2).map(n)}"/><circle cx="${n(target[0])}" cy="${n(target[1])}" r="${3 * size}" fill="${chosen ? '#e57820' : textColor}"/>`;
      }
      const width = layout.width * size,
        height = layout.height * size;
      return `<g data-markup="${esc(m.id)}" data-kind="${m.kind}" data-selected="${chosen}" class="${chosen ? 'is-selected' : ''}">${paths}<g class="markup-label" transform="translate(${n(at[0])} ${n(at[1])})"><rect x="${-width / 2}" y="${-height / 2}" width="${width}" height="${height}" rx="${shape === 'rounded' ? 6 * size : 0}" fill="${shape === 'plain' ? 'transparent' : background}" stroke="${chosen ? '#e57820' : shape === 'plain' ? 'none' : m.kind === 'area' ? m.color : textColor}" stroke-width="${size}"/><text text-anchor="middle" dominant-baseline="middle" font-family="Arial, sans-serif" font-size="${font}" font-weight="${bold ? 600 : 400}" fill="${textColor}">${label.map((s, i) => `<tspan x="0" y="${n((i - (label.length - 1) / 2) * font * 1.35)}">${esc(s)}</tspan>`).join('')}</text></g></g>`;
    })
    .join('');
}
