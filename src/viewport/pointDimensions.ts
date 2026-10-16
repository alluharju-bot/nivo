import * as THREE from 'three';
import { isPointDimension, type Body, type Dimension, type Vec3 } from '../model/project';
import { dimensionBodyIds, pointDimensionGeometry } from '../model/dimensions';
import { formatLength } from '../model/units';
import { annotationText, type DimensionLineStyle } from '../model/annotationStyle';

import { dimensionPaths } from '../drawing/dimensionGraphics';

export function createPointDimensions(container: HTMLElement) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.classList.add('model-dimensions', 'point-dimensions');
  svg.setAttribute('aria-label', 'Kahden pisteen dimensiot');
  container.append(svg);
  const entries = new Map<
    string,
    {
      node: SVGGElement;
      path: SVGPathElement;
      extension: SVGPathElement;
      hit: SVGPathElement;
      label: SVGGElement;
      rect: SVGRectElement;
      text: SVGTextElement;
    }
  >();
  return {
    update(
      bodies: Body[],
      dimensions: Dimension[],
      selected: string[],
      display: string,
      camera: THREE.Camera,
      selectedDimensions: string[] = [],
      style: DimensionLineStyle = 'drafting',
    ) {
      const w = container.clientWidth,
        h = container.clientHeight;
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      const keep = new Set<string>();
      const screen = (p: Vec3) => {
        const v = new THREE.Vector3(...p).project(camera);
        return [((v.x + 1) * w) / 2, ((1 - v.y) * h) / 2, v.z];
      };
      for (const d of dimensions) {
        if (
          !isPointDimension(d) ||
          d.hidden ||
          display === 'hidden' ||
          (display === 'selected' &&
            !selectedDimensions.includes(d.id) &&
            !dimensionBodyIds(d).some((id) => selected.includes(id)))
        )
          continue;
        const g = pointDimensionGeometry(bodies, d);
        const [start, end, a, b] = [g.start, g.end, g.a, g.b].map(screen);
        if (Math.abs(a[2]) > 1 || Math.abs(b[2]) > 1 || Math.hypot(b[0] - a[0], b[1] - a[1]) < 1)
          continue;
        keep.add(d.id);
        let entry = entries.get(d.id);
        if (!entry) {
          entry = {
            node: document.createElementNS(ns, 'g'),
            path: document.createElementNS(ns, 'path'),
            extension: document.createElementNS(ns, 'path'),
            hit: document.createElementNS(ns, 'path'),
            label: document.createElementNS(ns, 'g'),
            rect: document.createElementNS(ns, 'rect'),
            text: document.createElementNS(ns, 'text'),
          };
          entry.label.append(entry.rect, entry.text);
          entry.node.append(entry.hit, entry.path, entry.extension, entry.label);
          svg.append(entry.node);
          entries.set(d.id, entry);
        }
        const { node, path, extension, hit, label, rect, text } = entry;
        node.dataset.testid = 'dimension-3d';
        node.dataset.dimension = d.id;
        node.dataset.mm = String(g.value);
        node.classList.toggle('broken', g.orphan);
        node.classList.toggle('is-selected', selectedDimensions.includes(d.id));
        node.dataset.selected = String(selectedDimensions.includes(d.id));
        label.classList.add('dimension-label');
        hit.classList.add('dimension-hit');
        const labelText = g.orphan
          ? 'Viite puuttuu'
          : annotationText(
              d,
              g.value,
              `${d.axis === 'distance' ? '' : d.axis.toUpperCase() + ' · '}${formatLength(g.value)} mm`,
            );
        const paths = dimensionPaths(start, end, a, b, style);
        path.classList.add('dimension-line');
        extension.classList.add('dimension-extension');
        path.setAttribute('d', paths.solid);
        extension.setAttribute('d', paths.dashed);
        extension.setAttribute('stroke-dasharray', paths.dashArray);
        hit.setAttribute('d', paths.hit);
        const angle = d.labelRotation ?? 0;
        label.setAttribute(
          'transform',
          `translate(${(a[0] + b[0]) / 2} ${(a[1] + b[1]) / 2}) rotate(${angle})`,
        );
        rect.setAttribute('x', String(-labelText.length * 3.3 - 6));
        rect.setAttribute('y', '-11');
        rect.setAttribute('width', String(labelText.length * 6.6 + 12));
        rect.setAttribute('height', '22');
        rect.setAttribute('rx', '4');
        text.textContent = labelText;
      }
      for (const [id, entry] of entries)
        if (!keep.has(id)) {
          entry.node.remove();
          entries.delete(id);
        }
    },
    dispose() {
      entries.clear();
      svg.remove();
    },
  };
}
