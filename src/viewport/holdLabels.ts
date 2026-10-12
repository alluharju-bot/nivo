import { Vector3, type Camera } from 'three';
import type { Body } from '../model/project';

/** Selection feedback only: fixed-size DOM icons, no new mesh or per-frame geometry work. */
export function createHoldLabels(host: HTMLElement) {
  const layer = document.createElement('div');
  layer.className = 'hold-labels';
  host.append(layer);
  const labels = new Map<string, { element: HTMLSpanElement; point: Vector3 }>();
  const projected = new Vector3();
  return {
    sync(bodies: Body[], heldIds: readonly string[]) {
      const ids = new Set(heldIds);
      const parts = bodies.filter((b) => ids.has(b.id));
      const visibleIds = new Set(parts.map((b) => b.id));
      for (const [id, label] of labels)
        if (!visibleIds.has(id)) {
          label.element.remove();
          labels.delete(id);
        }
      for (const body of parts) {
        let label = labels.get(body.id);
        if (!label) {
          const element = document.createElement('span');
          element.className = 'hold-marker';
          element.dataset.heldBody = body.id;
          element.setAttribute('role', 'img');
          element.innerHTML =
            '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v3"/></svg>';
          layer.append(element);
          label = { element, point: new Vector3() };
          labels.set(body.id, label);
        }
        label.element.setAttribute('aria-label', `Hold: ${body.name}`);
        label.element.title = `Hold: ${body.name}`;
        label.point.set(
          body.origin[0] + body.feature.width / 2,
          body.origin[1] + body.feature.depth / 2,
          body.origin[2] + body.feature.height / 2,
        );
      }
    },
    update(camera: Camera, width: number, height: number) {
      for (const { element, point } of labels.values()) {
        projected.copy(point).project(camera);
        element.hidden =
          !Number.isFinite(projected.z) ||
          Math.abs(projected.z) > 1 ||
          Math.abs(projected.x) > 1 ||
          Math.abs(projected.y) > 1;
        if (!element.hidden)
          element.style.transform = `translate(${((projected.x + 1) * width) / 2}px, ${((1 - projected.y) * height) / 2}px) translate(-50%, -50%)`;
      }
    },
    dispose() {
      labels.clear();
      layer.remove();
    },
  };
}
