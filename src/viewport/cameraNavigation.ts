import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { bounds, type Body } from '../model/project';

type Camera = THREE.PerspectiveCamera | THREE.OrthographicCamera;
type Pointer = Pick<PointerEvent, 'clientX' | 'clientY'>;

/** Pick the frontmost visible surface; guides and rotation handles are not surfaces. */
export function orbitSurfacePoint(
  camera: Camera,
  pointer: THREE.Vector2,
  objects: THREE.Object3D[],
) {
  const meshes: THREE.Object3D[] = [];
  for (const object of objects) {
    object.updateWorldMatrix(true, true);
    object.traverseVisible((child) => {
      if (child instanceof THREE.Mesh) meshes.push(child);
    });
  }
  camera.updateMatrixWorld();
  const ray = new THREE.Raycaster();
  ray.setFromCamera(pointer, camera);
  return ray.intersectObjects(meshes, false).find((hit) => {
    const material = (hit.object as THREE.Mesh).material;
    const faceMaterial = Array.isArray(material)
      ? material[hit.face?.materialIndex ?? 0]
      : material;
    return faceMaterial?.visible && faceMaterial.opacity > 0;
  })?.point;
}

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
  surfaces: () => THREE.Object3D[],
) {
  controls.zoomToCursor = true;
  let focus: THREE.Vector3 | undefined;
  let orbit: { pivot: THREE.Vector3; localPivot: THREE.Vector3 } | undefined;
  const touches = new Map<number, Pointer>();
  const marker = document.createElement('div');
  marker.className = 'orbit-pivot';
  marker.dataset.testid = 'orbit-pivot';
  marker.setAttribute('aria-hidden', 'true');
  marker.hidden = true;
  canvas.parentElement?.append(marker);

  const clearOrbit = () => {
    orbit = undefined;
    marker.hidden = true;
    canvas.dataset.orbitPivot = '';
  };
  const beginOrbit = (pointer: Pointer) => {
    if (!controls.enabled || !controls.enableRotate) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const ndc = new THREE.Vector2(
      ((pointer.clientX - rect.left) / rect.width) * 2 - 1,
      1 - ((pointer.clientY - rect.top) / rect.height) * 2,
    );
    const pivot =
      orbitSurfacePoint(controls.object, ndc, surfaces()) ??
      focus?.clone() ??
      controls.target.clone();
    focusDepth(controls.object, controls.target, pivot);
    orbit = {
      pivot,
      localPivot: pivot
        .clone()
        .sub(controls.object.position)
        .applyQuaternion(controls.object.quaternion.clone().invert()),
    };
    const screen = pivot.clone().project(controls.object);
    marker.style.left = `${((screen.x + 1) * rect.width) / 2}px`;
    marker.style.top = `${((1 - screen.y) * rect.height) / 2}px`;
    marker.hidden = Math.abs(screen.x) > 1 || Math.abs(screen.y) > 1 || Math.abs(screen.z) > 1;
    canvas.dataset.orbitPivot = JSON.stringify(pivot.toArray());
  };
  const prepareZoom = () => {
    if (focus) focusDepth(controls.object, controls.target, focus);
  };
  const down = (event: PointerEvent) => {
    if (event.pointerType === 'touch') {
      touches.set(event.pointerId, event);
      clearOrbit();
      if (touches.size === 1 && controls.touches.ONE === THREE.TOUCH.ROTATE) beginOrbit(event);
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
      beginOrbit(event);
    else clearOrbit();
  };
  const move = (event: PointerEvent) => {
    if (touches.has(event.pointerId)) touches.set(event.pointerId, event);
  };
  const up = (event: PointerEvent) => {
    touches.delete(event.pointerId);
    clearOrbit();
    const remaining = touches.values().next().value;
    if (touches.size === 1 && controls.touches.ONE === THREE.TOUCH.ROTATE && remaining)
      beginOrbit(remaining);
  };
  const cancel = () => {
    touches.clear();
    clearOrbit();
  };
  const change = () => {
    if (orbit) orbitAbout(controls.object, controls.target, orbit.pivot, orbit.localPivot);
  };
  // Capture runs before OrbitControls, including its dynamically registered move listeners.
  canvas.addEventListener('pointerdown', down, true);
  canvas.addEventListener('pointermove', move, true);
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
      canvas.removeEventListener('pointermove', move, true);
      canvas.removeEventListener('pointerup', up, true);
      canvas.removeEventListener('pointercancel', cancel, true);
      canvas.removeEventListener('lostpointercapture', cancel);
      canvas.removeEventListener('wheel', prepareZoom, true);
      window.removeEventListener('blur', cancel);
      controls.removeEventListener('change', change);
      marker.remove();
    },
  };
}
