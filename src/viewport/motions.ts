import * as THREE from 'three';
import { easeMotion, motionTransforms, motionWorld, type MotionViewport } from '../model/motion';

/** Animation touches scene matrices only. No CAD rebuild, React frame state or autosave. */
export function createMotionPreview(
  container: HTMLElement,
  scene: THREE.Scene,
  current: () => MotionViewport | undefined,
  objects: () => Map<
    string,
    { mesh: THREE.Mesh; outline: THREE.LineSegments; boundary?: THREE.Object3D }
  >,
  render: () => void,
) {
  const group = new THREE.Group();
  group.name = 'motion-pivots';
  scene.add(group);
  const markers = new Map<string, { marker: THREE.Group; label: HTMLButtonElement }>();
  let positions: Record<string, number> = {},
    frame = 0,
    serial = -1,
    definitions: unknown;
  let targets: Record<string, number> = {};
  let driven = new Set<string>();
  const identity = new THREE.Matrix4();
  const tweens = new Map<
    string,
    { from: number; to: number; start: number; duration: number; easing: 'smooth' | 'linear' }
  >();
  const clearMarkers = () => {
    markers.forEach(({ label, marker }) => {
      label.remove();
      marker.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
    });
    markers.clear();
    group.clear();
  };
  const apply = () => {
    const state = current();
    const matrices = state
      ? motionTransforms(state.motions, state.bodies, positions)
      : new Map<string, THREE.Matrix4>();
    const nodes = objects();
    for (const id of new Set([...driven, ...matrices.keys()])) {
      const node = nodes.get(id);
      if (!node) continue;
      for (const object of [node.mesh, node.outline, node.boundary]) {
        if (!object) continue;
        object.matrixAutoUpdate = false;
        object.matrix.copy(matrices.get(id) ?? identity);
        object.matrixWorldNeedsUpdate = true;
      }
    }
    driven = new Set(matrices.keys());
    const byId = new Map(state?.bodies.map((b) => [b.id, b]));
    for (const m of state?.motions ?? []) {
      const anchor = byId.get(m.anchorId),
        entry = markers.get(m.id);
      if (!anchor || !entry) continue;
      const world = motionWorld(m, anchor),
        parent = matrices.get(m.anchorId) ?? identity;
      entry.marker.position.set(...world.pivot).applyMatrix4(parent);
      const axis = new THREE.Vector3(...world.axis).transformDirection(parent);
      entry.marker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis);
    }
    container
      .querySelector('canvas[data-testid="viewport"]')
      ?.setAttribute('data-motion-positions', JSON.stringify(positions));
    render();
  };
  const tick = (now: number) => {
    frame = 0;
    for (const [id, tween] of tweens) {
      const t = (now - tween.start) / tween.duration;
      positions[id] = tween.from + (tween.to - tween.from) * easeMotion(t, tween.easing);
      if (t >= 1) {
        positions[id] = tween.to;
        tweens.delete(id);
      }
    }
    apply();
    if (tweens.size) frame = requestAnimationFrame(tick);
  };
  const sync = () => {
    const state = current();
    if (!state) {
      if (definitions === undefined) return;
      cancelAnimationFrame(frame);
      frame = 0;
      tweens.clear();
      positions = {};
      targets = {};
      serial = -1;
      definitions = undefined;
      clearMarkers();
      apply();
      return;
    }
    if (definitions !== state.motions) {
      definitions = state.motions;
      clearMarkers();
      const ids = new Set(state.motions.map((m) => m.id));
      Object.keys(positions).forEach((id) => {
        if (!ids.has(id)) {
          delete positions[id];
          tweens.delete(id);
        }
      });
      for (const m of state.motions) {
        const marker = new THREE.Group();
        const color = m.id === state.activeId ? '#b355dd' : '#426a88';
        const material = new THREE.LineBasicMaterial({
          color,
          depthTest: false,
          depthWrite: false,
          toneMapped: false,
        });
        marker.add(
          new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([
              new THREE.Vector3(0, 0, -1),
              new THREE.Vector3(0, 0, 1),
            ]),
            material,
          ),
        );
        const ring = new THREE.LineLoop(
          new THREE.BufferGeometry().setFromPoints(
            Array.from(
              { length: 48 },
              (_, i) =>
                new THREE.Vector3(
                  Math.cos((i * Math.PI) / 24) * 0.3,
                  Math.sin((i * Math.PI) / 24) * 0.3,
                  0,
                ),
            ),
          ),
          material.clone(),
        );
        const arrow = new THREE.Mesh(
          new THREE.ConeGeometry(0.12, 0.3, 12),
          new THREE.MeshBasicMaterial({
            color,
            depthTest: false,
            depthWrite: false,
            toneMapped: false,
          }),
        );
        arrow.rotation.x = Math.PI / 2;
        arrow.position.z = 1;
        marker.add(ring, arrow);
        marker.renderOrder = 150;
        marker.traverse((o) => {
          o.renderOrder = 150;
        });
        group.add(marker);
        const label = document.createElement('button');
        label.className = 'motion-pivot-label';
        label.textContent = m.name;
        label.setAttribute('aria-label', `Pivot: ${m.name}`);
        label.onclick = () => current()?.onActive(m.id);
        container.append(label);
        markers.set(m.id, { marker, label });
      }
    }
    if (serial !== state.playback.serial) {
      serial = state.playback.serial;
      for (const m of state.motions) {
        if (state.playback.onlyId && state.playback.onlyId !== m.id) continue;
        const target = state.playback.targets[m.id] ?? 0;
        if (state.playback.immediate) {
          positions[m.id] = target;
          tweens.delete(m.id);
        } else if (target !== (targets[m.id] ?? 0))
          tweens.set(m.id, {
            from: positions[m.id] ?? 0,
            to: target,
            start: performance.now(),
            duration: m.duration * 1000 * Math.max(0.01, Math.abs(target - (positions[m.id] ?? 0))),
            easing: m.easing,
          });
      }
      targets = { ...state.playback.targets };
    }
    for (const [id, { marker }] of markers)
      marker.traverse((o) => {
        if (o instanceof THREE.Line || o instanceof THREE.Mesh)
          (o.material as THREE.LineBasicMaterial).color.set(
            id === state.activeId ? '#b355dd' : '#426a88',
          );
      });
    apply();
    if (tweens.size && !frame) frame = requestAnimationFrame(tick);
  };
  return {
    sync,
    update(camera: THREE.Camera) {
      for (const [id, { marker, label }] of markers) {
        const point = marker.position.clone().project(camera),
          height = container.clientHeight;
        const worldPerPixel =
          camera instanceof THREE.PerspectiveCamera
            ? (2 *
                marker.position.distanceTo(camera.position) *
                Math.tan((camera.fov * Math.PI) / 360)) /
              height
            : camera instanceof THREE.OrthographicCamera
              ? (camera.top - camera.bottom) / camera.zoom / height
              : 1;
        marker.scale.setScalar(worldPerPixel * 34);
        label.hidden = Math.abs(point.z) > 1 || Math.abs(point.x) > 1 || Math.abs(point.y) > 1;
        label.style.left = `${((point.x + 1) / 2) * container.clientWidth + 12}px`;
        label.style.top = `${((1 - point.y) / 2) * height + 12}px`;
        label.classList.toggle('active', id === current()?.activeId);
      }
    },
    dispose() {
      cancelAnimationFrame(frame);
      clearMarkers();
      scene.remove(group);
    },
  };
}
