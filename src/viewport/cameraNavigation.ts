import * as THREE from 'three';
import { intersectModel } from './spatialIndex';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { bounds, type Body } from '../model/project';

type Camera = THREE.PerspectiveCamera | THREE.OrthographicCamera;
type Pointer = Pick<PointerEvent, 'clientX' | 'clientY'>;

/** Turntable orbit: world Z stays vertical, so curved mouse strokes cannot accumulate roll. */
export function rotateInView(controls: OrbitControls<Camera>, dx: number, dy: number) {
  const camera = controls.object;
  const offset = camera.position.clone().sub(controls.target);
  const radius = offset.length();
  const horizontal = Math.hypot(offset.x, offset.y);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  // At an exact named top/bottom view, retain the cube's heading instead of
  // deriving an arbitrary heading from numerical noise in the camera position.
  const heading =
    horizontal > radius * 1e-7 ? Math.atan2(offset.x, -offset.y) : Math.atan2(right.y, right.x);
  const yaw = heading - dx;
  const limit = Math.PI / 2 - 1e-4;
  const pitch = THREE.MathUtils.clamp(Math.atan2(offset.z, horizontal) + dy, -limit, limit);
  camera.position
    .set(
      radius * Math.sin(yaw) * Math.cos(pitch),
      -radius * Math.cos(yaw) * Math.cos(pitch),
      radius * Math.sin(pitch),
    )
    .add(controls.target);
  camera.up.set(0, 0, 1);
  camera.lookAt(controls.target);
  camera.updateMatrixWorld();
  // Keep native pan, cursor zoom and change events in sync. No spherical rotation delta.
  controls.update();
}

/** OrbitControls caches its up-axis at construction. Recreate it when a view changes up. */
export function rebuildOrbitControls(previous: OrbitControls<Camera>, camera: Camera) {
  const position = camera.position.clone();
  const element = previous.domElement!;
  previous.dispose();
  const next = new OrbitControls<Camera>(camera, element);
  next.target.copy(previous.target);
  for (const key of [
    'enabled',
    'enableRotate',
    'enableZoom',
    'enablePan',
    'enableDamping',
    'dampingFactor',
    'rotateSpeed',
    'zoomSpeed',
    'panSpeed',
    'minDistance',
    'maxDistance',
    'minZoom',
    'maxZoom',
    'screenSpacePanning',
    'zoomToCursor',
  ] as const)
    next[key] = previous[key] as never;
  Object.assign(next.mouseButtons, previous.mouseButtons);
  Object.assign(next.touches, previous.touches);
  camera.position.copy(position);
  next.update();
  return next;
}

/** Pick the frontmost visible surface; guides and rotation handles are not surfaces. */
export function orbitSurfacePoint(
  camera: Camera,
  pointer: THREE.Vector2,
  objects: THREE.Object3D[],
) {
  const meshes: THREE.Object3D[] = [];
  camera.updateMatrixWorld();
  const ray = new THREE.Raycaster();
  ray.setFromCamera(pointer, camera);
  const indexedHits: THREE.Intersection[] = [];
  for (const object of objects) {
    if (object instanceof THREE.Group && object.userData.spatialIndex) {
      indexedHits.push(...intersectModel(ray, object, 'selection'));
      continue;
    }
    object.updateWorldMatrix(true, true);
    object.traverseVisible((child) => {
      if (child instanceof THREE.Mesh && child.userData.modelDisplay !== 'ghost')
        meshes.push(child);
    });
  }
  return [...indexedHits, ...ray.intersectObjects(meshes, false)]
    .sort((a, b) => a.distance - b.distance)
    .filter((hit) => hit.object instanceof THREE.Mesh)
    .find((hit) => {
      const material = (hit.object as THREE.Mesh).material;
      const faceMaterial = Array.isArray(material)
        ? material[hit.face?.materialIndex ?? 0]
        : material;
      return (faceMaterial?.visible || hit.object.userData.batched) && faceMaterial.opacity > 0;
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
  let orbit:
    | {
        pivot: THREE.Vector3;
        localPivot: THREE.Vector3;
        pointer: Pointer;
        pole: number;
        pitchSign?: number;
      }
    | undefined;
  const touches = new Map<number, Pointer>();
  let resumeRotation: (() => void) | undefined;
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
      pointer,
      pole:
        Math.abs(controls.object.getWorldDirection(new THREE.Vector3()).z) > 1 - 1e-8
          ? Math.sign(controls.object.position.z - controls.target.z)
          : 0,
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
    resumeRotation?.();
    if (touches.has(event.pointerId)) touches.set(event.pointerId, event);
    if (!orbit || !controls.enabled || !controls.enableRotate) return;
    const radians = (2 * Math.PI * controls.rotateSpeed) / Math.max(1, canvas.clientHeight);
    const dx = (event.clientX - orbit.pointer.clientX) * radians;
    const dy = (event.clientY - orbit.pointer.clientY) * radians;
    orbit.pointer = event;
    // The first vertical motion leaves an exact top/bottom view in either drag
    // direction. Keep that choice for this stroke, never bounce at the pole.
    if (orbit.pitchSign === undefined && Math.abs(dy) > 1e-9)
      orbit.pitchSign = orbit.pole ? -orbit.pole * Math.sign(dy) : 1;
    rotateInView(controls, dx, dy * (orbit.pitchSign ?? 1));
    // OrbitControls still tracks pointers, capture and touch transitions. Suppress only
    // its spherical rotation for this event; otherwise the same drag rotates twice.
    controls.enableRotate = false;
    const resume = () => {
      controls.enableRotate = true;
      canvas.ownerDocument.removeEventListener('pointermove', resume);
      clearTimeout(fallback);
      resumeRotation = undefined;
    };
    // Restore after the native document listener, not in a microtask: browsers can
    // run microtasks between capture and bubble listeners of the same event.
    const fallback = setTimeout(resume, 0);
    resumeRotation = resume;
    canvas.ownerDocument.addEventListener('pointermove', resume, { once: true });
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
      resumeRotation?.();
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
