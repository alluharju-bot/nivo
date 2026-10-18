import * as THREE from 'three';
import type { LightEditing } from '../ui/LightPanel';

/** An editing helper only: excluded from exported geometry and lighting. */
export function createLightHelper(
  host: HTMLElement,
  canvas: HTMLCanvasElement,
  scene: THREE.Scene,
  current: () => LightEditing | undefined,
) {
  const group = new THREE.Group();
  group.name = 'light-direction-helper';
  const points: THREE.Vector3[] = [];
  for (let i = 0; i < 64; i++) {
    const a = (i * Math.PI) / 32,
      b = ((i + 1) * Math.PI) / 32;
    points.push(
      new THREE.Vector3(Math.cos(a), Math.sin(a), 1),
      new THREE.Vector3(Math.cos(b), Math.sin(b), 1),
    );
    if (i % 16 === 0)
      points.push(new THREE.Vector3(), new THREE.Vector3(Math.cos(a), Math.sin(a), 1));
  }
  points.push(new THREE.Vector3(), new THREE.Vector3(0, 0, 1));
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color: '#ce8b30',
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    toneMapped: false,
  });
  group.add(new THREE.LineSegments(geometry, material));
  scene.add(group);
  const handle = document.createElement('button');
  handle.className = 'light-aim-handle';
  handle.textContent = '☀';
  handle.setAttribute('aria-label', 'Suuntaa valo');
  handle.title = 'Suuntaa valo kohteeseen';
  handle.onclick = () => current()?.onStartAim();
  host.append(handle);
  return {
    update(camera: THREE.Camera) {
      const state = current();
      group.visible = !!state?.enabled;
      handle.hidden = !group.visible;
      canvas.dataset.lightHelper = state?.enabled
        ? JSON.stringify({ origin: state.origin, direction: state.direction, angle: state.angle })
        : '';
      if (!state?.enabled) return;
      const origin = new THREE.Vector3(...state.origin),
        direction = new THREE.Vector3(...state.direction);
      const pixel =
        camera instanceof THREE.PerspectiveCamera
          ? (2 * origin.distanceTo(camera.position) * Math.tan((camera.fov * Math.PI) / 360)) /
            host.clientHeight
          : camera instanceof THREE.OrthographicCamera
            ? (camera.top - camera.bottom) / camera.zoom / host.clientHeight
            : 1;
      const spread = Math.tan((state.angle * Math.PI) / 360);
      const length = (pixel * 150) / Math.max(1, spread);
      group.position.copy(origin);
      group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
      group.scale.set(length * spread, length * spread, length);
      const end = origin.addScaledVector(direction, length).project(camera);
      handle.hidden = Math.abs(end.z) > 1 || Math.abs(end.x) > 1 || Math.abs(end.y) > 1;
      handle.style.left = `${((end.x + 1) * host.clientWidth) / 2}px`;
      handle.style.top = `${((1 - end.y) * host.clientHeight) / 2}px`;
      handle.classList.toggle('active', state.aiming);
      // The projected endpoint can coincide with the target under the cursor.
      // While picking, it must never swallow the confirmation click.
      handle.style.pointerEvents = state.aiming ? 'none' : 'auto';
    },
    dispose() {
      handle.remove();
      scene.remove(group);
      geometry.dispose();
      material.dispose();
    },
  };
}
