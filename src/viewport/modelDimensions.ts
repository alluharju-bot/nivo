import * as THREE from 'three';
import {
  isPointDimension,
  dimensionEnvelope,
  axisIndex,
  corners,
  type Body,
  type BodyGroup,
  type Dimension,
} from '../model/project';
import { dimensionBodyIds } from '../model/dimensions';
import { formatLength } from '../model/units';
import { annotationText, type DimensionLineStyle } from '../model/annotationStyle';
import { dimensionPaths } from '../drawing/dimensionGraphics';
const ns = 'http://www.w3.org/2000/svg';
const svgNode = <K extends keyof SVGElementTagNameMap>(name: K) =>
  document.createElementNS(ns, name);

/** Persistent dimensions drawn in screen pixels; values always come from the exact model. */
export function createModelDimensions(container: HTMLElement) {
  const svg = svgNode('svg');
  svg.classList.add('model-dimensions');
  svg.setAttribute('aria-label', 'Mallin mitat');
  container.append(svg);
  const entries = new Map<
    string,
    {
      group: SVGGElement;
      path: SVGPathElement;
      extension: SVGPathElement;
      hit: SVGPathElement;
      label: SVGGElement;
      text: SVGTextElement;
      background: SVGRectElement;
      title: SVGTitleElement;
    }
  >();
  return {
    update(
      bodies: Body[],
      dimensions: Dimension[],
      selected: string[],
      display: 'all' | 'selected' | 'hidden',
      camera: THREE.Camera,
      groups: BodyGroup[],
      selectedDimensions: string[] = [],
      style: DimensionLineStyle = 'drafting',
    ) {
      const width = container.clientWidth,
        height = container.clientHeight;
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
      const keep = new Set<string>();
      const occupied: { x: number; y: number; width: number; height: number }[] = [];
      const project = (p: number[]) => {
        const v = new THREE.Vector3(p[0], p[1], p[2]).project(camera);
        return { x: ((v.x + 1) * width) / 2, y: ((1 - v.y) * height) / 2, z: v.z };
      };
      for (const dimension of dimensions) {
        if (isPointDimension(dimension) || dimension.hidden) continue;
        if (
          display === 'hidden' ||
          (display === 'selected' &&
            !selectedDimensions.includes(dimension.id) &&
            !dimensionBodyIds(dimension, { bodies, groups }).some((id) => selected.includes(id)))
        )
          continue;
        const body = dimensionEnvelope({ bodies, groups }, dimension);
        if (!body || body.purpose === 'construction') continue;
        const axis = axisIndex[dimension.axis],
          sizes = [body.feature.width, body.feature.depth, body.feature.height];
        const value = sizes[axis];
        if (value <= 0) continue;
        const center = project(body.origin.map((n, i) => n + sizes[i] / 2));
        const candidates = corners(body)
          .filter((p) => p[axis] === body.origin[axis])
          .map((point) => {
            const end = [...point];
            end[axis] += value;
            const a = project(point),
              b = project(end),
              length = Math.hypot(b.x - a.x, b.y - a.y);
            const nx = -(b.y - a.y) / length,
              ny = (b.x - a.x) / length;
            const outside = ((a.x + b.x) / 2 - center.x) * nx + ((a.y + b.y) / 2 - center.y) * ny;
            return {
              a,
              b,
              nx: nx * (outside < 0 ? -1 : 1),
              ny: ny * (outside < 0 ? -1 : 1),
              score: Math.abs(outside),
              length,
            };
          })
          .filter((c) => c.length > 0.5 && Math.abs(c.a.z) <= 1 && Math.abs(c.b.z) <= 1)
          .sort((a, b) => b.score - a.score);
        const edge = candidates[0];
        if (!edge) continue;
        keep.add(dimension.id);
        let entry = entries.get(dimension.id);
        if (!entry) {
          const group = svgNode('g'),
            path = svgNode('path'),
            extension = svgNode('path'),
            hit = svgNode('path'),
            label = svgNode('g'),
            text = svgNode('text'),
            background = svgNode('rect'),
            title = svgNode('title');
          group.dataset.testid = 'dimension-3d';
          group.dataset.dimension = dimension.id;
          group.dataset.body = body.id;
          background.setAttribute('rx', '4');
          hit.classList.add('dimension-hit');
          label.classList.add('dimension-label');
          label.append(background, text);
          group.append(title, hit, path, extension, label);
          svg.append(group);
          entry = { group, path, extension, hit, label, text, background, title };
          entries.set(dimension.id, entry);
        }
        const { a, b, nx, ny } = edge;
        const label = annotationText(
          dimension,
          value,
          `${dimension.axis.toUpperCase()} · ${formatLength(value)} mm`,
        );
        const labelWidth = label.length * 6.2 + 12;
        const angle = dimension.labelRotation ?? 0;
        const angleRadians = (angle * Math.PI) / 180;
        const boxWidth =
          Math.abs(Math.cos(angleRadians)) * labelWidth + Math.abs(Math.sin(angleRadians)) * 20;
        const boxHeight =
          Math.abs(Math.sin(angleRadians)) * labelWidth + Math.abs(Math.cos(angleRadians)) * 20;
        let gap = 28;
        for (let attempt = 0; attempt < 16; attempt++, gap += 24) {
          const box = {
            x: (a.x + b.x) / 2 + nx * gap - boxWidth / 2,
            y: (a.y + b.y) / 2 + ny * gap - boxHeight / 2,
            width: boxWidth,
            height: boxHeight,
          };
          const overlaps = occupied.some(
            (old) =>
              box.x < old.x + old.width + 6 &&
              box.x + box.width + 6 > old.x &&
              box.y < old.y + old.height + 6 &&
              box.y + box.height + 6 > old.y,
          );
          if (!overlaps || attempt === 15) {
            occupied.push(box);
            break;
          }
        }
        const ax = a.x + nx * gap,
          ay = a.y + ny * gap,
          bx = b.x + nx * gap,
          by = b.y + ny * gap;
        const paths = dimensionPaths([a.x, a.y], [b.x, b.y], [ax, ay], [bx, by], style);
        entry.path.classList.add('dimension-line');
        entry.extension.classList.add('dimension-extension');
        entry.path.setAttribute('d', paths.solid);
        entry.extension.setAttribute('d', paths.dashed);
        entry.extension.setAttribute('stroke-dasharray', paths.dashArray);
        entry.text.textContent = label;
        entry.hit.setAttribute('d', paths.hit);
        entry.group.classList.toggle('is-selected', selectedDimensions.includes(dimension.id));
        entry.group.dataset.selected = String(selectedDimensions.includes(dimension.id));
        entry.title.textContent = `${body.name} · ${label}`;
        entry.group.dataset.mm = String(value);
        entry.group.setAttribute('aria-label', `${body.name} · ${label}`);
        entry.label.setAttribute(
          'transform',
          `translate(${(ax + bx) / 2} ${(ay + by) / 2}) rotate(${angle})`,
        );
        entry.background.setAttribute('x', String(-labelWidth / 2));
        entry.background.setAttribute('y', '-10');
        entry.background.setAttribute('width', String(labelWidth));
        entry.background.setAttribute('height', '20');
      }
      for (const [id, entry] of entries)
        if (!keep.has(id)) {
          entry.group.remove();
          entries.delete(id);
        }
    },
    dispose() {
      svg.remove();
      entries.clear();
    },
  };
}
