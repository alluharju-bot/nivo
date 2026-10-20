import { Group, Vector3 } from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import type { Body, Guide } from '../model/project';
import { guidePoints, guideMeasurement } from '../model/guides';
import { annotationText } from '../model/annotationStyle';
import { formatLength } from '../model/units';
import { disposeMaterial } from '../render/materials';
import { pointMarker } from './pointMarker';

/** Retain DOM nodes, marker textures and GPU programs throughout a measurement drag. */
export function createGuideAnnotation(container: HTMLDivElement, parent: Group) {
  const element = document.createElement('div');
  element.className = 'guide-label';
  element.dataset.testid = 'guide-label';
  container.append(element);
  const label = { element, point: new Vector3(), xray: false };
  const lines = [80, 79, 81].map((order) => {
    const line = new Line2(new LineGeometry(), new LineMaterial({ depthWrite: false }));
    line.renderOrder = order;
    return line;
  });
  let markers: ReturnType<typeof pointMarker>[] = [];
  let previous: { guide: Guide; bodies: Body[]; selected: boolean; xray: boolean } | undefined;
  return {
    label,
    update(guide: Guide, bodies: Body[], selected: boolean, xray: boolean) {
      if (
        previous?.guide === guide &&
        previous.bodies === bodies &&
        previous.selected === selected &&
        previous.xray === xray
      )
        return true;
      const points = guidePoints(bodies, guide),
        measurement = guideMeasurement(bodies, guide);
      if (!points || !measurement) return false;
      const vectors = points.map((p) => new Vector3(...p));
      const measured = measurement.map((p) => new Vector3(...p));
      const color = selected ? '#df741f' : '#487b91';
      if (!previous || previous.selected !== selected) {
        for (const marker of markers) {
          parent.remove(marker);
          marker.geometry.dispose();
          disposeMaterial(marker.material);
        }
        markers = points.map((point) => pointMarker(point, color, selected ? 14 : 12));
        parent.add(...markers);
      }
      markers.forEach((marker, i) => {
        marker.position.set(...points[i]);
        marker.userData = { annotationPoint: true, xray };
      });
      const isGuide = guide.mode === 'guide';
      const setLine = (
        index: number,
        points: Vector3[] | undefined,
        dashed: boolean,
        width: number,
        opacity = 1,
      ) => {
        const line = lines[index];
        if (!points) {
          parent.remove(line);
          return;
        }
        parent.add(line);
        line.geometry.dispose();
        line.geometry = new LineGeometry().setPositions(points.flatMap((p) => p.toArray()));
        const material = line.material;
        const transparent = opacity < 1;
        if (material.dashed !== dashed || material.transparent !== transparent)
          material.needsUpdate = true;
        material.color.set(color);
        material.linewidth = width;
        material.dashed = dashed;
        material.dashSize = 14;
        material.gapSize = 8;
        material.depthTest = !xray;
        material.transparent = transparent;
        material.opacity = opacity;
        material.resolution.set(container.clientWidth, container.clientHeight);
        material.userData.originalColor = material.color.getHex();
        material.userData.originalWidth = width;
        line.userData = index < 2 ? { guideId: guide.id, xray } : {};
        line.computeLineDistances();
      };
      setLine(0, vectors, isGuide, selected ? 4 : 2);
      const direction = vectors[1].clone().sub(vectors[0]).normalize();
      setLine(
        1,
        isGuide
          ? [
              vectors[0].clone().addScaledVector(direction, -20000),
              vectors[1].clone().addScaledVector(direction, 20000),
            ]
          : undefined,
        true,
        selected ? 3 : 1.5,
        selected ? 1 : 0.8,
      );
      setLine(2, isGuide && guide.offset ? measured : undefined, false, 1.5);
      const value = measured[0].distanceTo(measured[1]);
      element.dataset.xray = String(xray);
      element.dataset.guideId = guide.id;
      element.dataset.selected = String(selected);
      element.textContent = annotationText(
        guide,
        value,
        `${formatLength(value)} mm${isGuide && !guide.offset ? ' · ' + formatLength(guide.angle) + '°' : ''}`,
      );
      element.title = guide.offset ? 'Etäisyys lähtökohdasta' : 'Pituus';
      label.point.copy(measured[0]).add(measured[1]).multiplyScalar(0.5);
      label.xray = xray;
      previous = { guide, bodies, selected, xray };
      return true;
    },
    dispose() {
      element.remove();
      for (const object of [...lines, ...markers]) {
        parent.remove(object);
        object.geometry.dispose();
        disposeMaterial(object.material);
      }
    },
  };
}
