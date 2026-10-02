import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { bounds, type Body } from '../model/project';

type Camera = THREE.PerspectiveCamera | THREE.OrthographicCamera;

export function selectionCenter(bodies: Body[], selectedIds: string[], editingBodyId?: string) {
  const selected = bodies.filter((body) =>
    editingBodyId ? body.id === editingBodyId : selectedIds.includes(body.id),
  );
  if (!selected.length) return undefined;
  const box = bounds(selected);
  return new THREE.Vector3(...box.min).add(new THREE.Vector3(...box.max)).multiplyScalar(0.5);
}

/** Change the working depth without changing the view direction or screen framing. */
export function focusDepth(camera: Camera, target: THREE.Vector3, focus: THREE.Vector3) {
  const direction = camera.getWorldDirection(new THREE.Vector3());
  const depth = focus.clone().sub(camera.position).dot(direction);
  if (depth < 2 || !Number.isFinite(depth)) return;
  target.copy(camera.position).addScaledVector(direction, Math.min(depth, 250_000));
}

/** Keep an off-center pivot fixed in camera space while OrbitControls changes the angle. */
export function orbitAbout(
  camera: Camera,
  target: THREE.Vector3,
  pivot: THREE.Vector3,
  localPivot: THREE.Vector3,
) {
  const translation = pivot
    .clone()
    .sub(localPivot.clone().applyQuaternion(camera.quaternion))
    .sub(camera.position);
  camera.position.add(translation);
  target.add(translation);
  camera.updateMatrixWorld();
}

export function installCameraNavigation(
  controls: OrbitControls<Camera>,
  canvas: HTMLCanvasElement,
) {
  controls.zoomToCursor = true;
  let focus: THREE.Vector3 | undefined;
  let orbit: { pivot: THREE.Vector3; localPivot: THREE.Vector3 } | undefined;
  const touches = new Set<number>();

  const beginOrbit = () => {
    orbit = focus
      ? {
          pivot: focus.clone(),
          localPivot: focus
            .clone()
            .sub(controls.object.position)
            .applyQuaternion(controls.object.quaternion.clone().invert()),
        }
      : undefined;
  };
  const prepareZoom = () => {
    if (focus) focusDepth(controls.object, controls.target, focus);
  };
  const down = (event: PointerEvent) => {
    if (event.pointerType === 'touch') {
      touches.add(event.pointerId);
      orbit = undefined;
      if (touches.size === 1 && controls.touches.ONE === THREE.TOUCH.ROTATE) beginOrbit();
      if (touches.size === 2) prepareZoom();
      return;
    }
    const action = [
      controls.mouseButtons.LEFT,
      controls.mouseButtons.MIDDLE,
      controls.mouseButtons.RIGHT,
    ][event.button];
    const modified = event.ctrlKey || event.metaKey || event.shiftKey;
    if ((action === THREE.MOUSE.ROTATE && !modified) || (action === THREE.MOUSE.PAN && modified))
      beginOrbit();
    else orbit = undefined;
  };
  const up = (event: PointerEvent) => {
    touches.delete(event.pointerId);
    orbit = undefined;
    if (touches.size === 1 && controls.touches.ONE === THREE.TOUCH.ROTATE) beginOrbit();
  };
  const cancel = () => {
    touches.clear();
    orbit = undefined;
  };
  const change = () => {
    if (orbit) orbitAbout(controls.object, controls.target, orbit.pivot, orbit.localPivot);
  };
  // Capture runs before OrbitControls, including its dynamically registered move listeners.
  canvas.addEventListener('pointerdown', down, true);
  canvas.addEventListener('pointerup', up, true);
  canvas.addEventListener('pointercancel', cancel, true);
  canvas.addEventListener('lostpointercapture', cancel);
  canvas.addEventListener('wheel', prepareZoom, { capture: true, passive: true });
  window.addEventListener('blur', cancel);
  controls.addEventListener('change', change);

  return {
    sync(bodies: Body[], selectedIds: string[], editingBodyId?: string) {
      focus = selectionCenter(bodies, selectedIds, editingBodyId);
      prepareZoom();
      canvas.dataset.cameraFocus = focus ? JSON.stringify(focus.toArray()) : '';
    },
    dispose() {
      canvas.removeEventListener('pointerdown', down, true);
      canvas.removeEventListener('pointerup', up, true);
      canvas.removeEventListener('pointercancel', cancel, true);
      canvas.removeEventListener('lostpointercapture', cancel);
      canvas.removeEventListener('wheel', prepareZoom, true);
      window.removeEventListener('blur', cancel);
      controls.removeEventListener('change', change);
    },
  };
}
