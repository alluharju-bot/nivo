import * as THREE from 'three';
import type { Body } from '../model/project';
import type { TexturePlacement } from '../model/materials';
import { textureFrameMatrix } from '../render/materials';

/** The same surface drag and handles in modeling and rendering. No CAD or history writes. */
export function installTextureEditing({
  host,
  canvas,
  camera,
  hitAt,
  current,
  enableCamera,
  onStart,
}: {
  host: HTMLElement;
  canvas: HTMLCanvasElement;
  camera: () => THREE.Camera;
  hitAt: (
    ray: THREE.Raycaster,
  ) => { bodyId: string; point: THREE.Vector3; normal: THREE.Vector3 } | undefined;
  current: () =>
    | {
        body: Body;
        texture: TexturePlacement;
        change: (texture: TexturePlacement) => void;
        commit: () => void;
      }
    | undefined;
  enableCamera: (enabled: boolean) => void;
  onStart?: () => void;
}) {
  const handles = document.createElement('div');
  handles.className = 'texture-handles';
  handles.hidden = true;
  host.append(handles);
  const scale = document.createElement('button'),
    rotate = document.createElement('button');
  scale.textContent = '↗';
  rotate.textContent = '↻';
  scale.setAttribute('aria-label', 'Skaalaa tekstuuria');
  rotate.setAttribute('aria-label', 'Kierrä tekstuuria');
  scale.title = 'Vedä: tekstuurin koko';
  rotate.title = 'Vedä: tekstuurin kierto';
  handles.append(scale, rotate);
  const center = (body: Body) =>
    new THREE.Vector3(...body.origin).add(
      new THREE.Vector3(body.feature.width / 2, body.feature.depth / 2, body.feature.height / 2),
    );
  const rayAt = (event: PointerEvent) => {
    const box = canvas.getBoundingClientRect(),
      ray = new THREE.Raycaster();
    ray.setFromCamera(
      new THREE.Vector2(
        ((event.clientX - box.left) / box.width) * 2 - 1,
        1 - ((event.clientY - box.top) / box.height) * 2,
      ),
      camera(),
    );
    return ray;
  };
  let drag:
    | {
        pointer: number;
        bodyId: string;
        target: HTMLElement;
        mode: 'move' | 'scale' | 'rotate';
        x: number;
        y: number;
        initial: TexturePlacement;
        plane: THREE.Plane;
        inverse: THREE.Matrix4;
        start: THREE.Vector3;
        u: number;
        v: number;
        center: { x: number; y: number };
        changed: boolean;
      }
    | undefined;
  const release = () => {
    if (drag?.target.hasPointerCapture(drag.pointer))
      drag.target.releasePointerCapture(drag.pointer);
    drag = undefined;
    canvas.dataset.textureDragging = '';
    enableCamera(true);
  };
  const cancel = () => {
    if (drag && current()?.body.id === drag.bodyId) current()?.change(drag.initial);
    if (drag) release();
  };
  const update = () => {
    const editing = current();
    if (drag && drag.bodyId !== editing?.body.id) release();
    handles.hidden = !editing;
    canvas.dataset.textureEditing = editing?.body.id ?? '';
    if (!editing) return;
    const p = center(editing.body).project(camera());
    handles.hidden = p.z < -1 || p.z > 1 || Math.abs(p.x) > 1.2 || Math.abs(p.y) > 1.2;
    handles.style.left = `${((p.x + 1) * host.clientWidth) / 2}px`;
    handles.style.top = `${((1 - p.y) * host.clientHeight) / 2}px`;
  };
  const down = (event: PointerEvent, mode: 'move' | 'scale' | 'rotate' = 'move') => {
    const editing = current();
    if (!editing || event.button !== 0 || event.shiftKey) return;
    const hit = hitAt(rayAt(event));
    if (mode === 'move' && hit?.bodyId !== editing.body.id) return;
    const point = hit?.bodyId === editing.body.id ? hit.point : center(editing.body);
    const normal =
      hit?.bodyId === editing.body.id
        ? hit.normal
        : camera().getWorldDirection(new THREE.Vector3()).negate();
    const inverse = textureFrameMatrix(editing.body).invert();
    const n = normal.clone().transformDirection(inverse).toArray().map(Math.abs),
      axis = n.indexOf(Math.max(...n));
    const box = handles.getBoundingClientRect();
    drag = {
      pointer: event.pointerId,
      bodyId: editing.body.id,
      target: event.currentTarget as HTMLElement,
      mode,
      x: event.clientX,
      y: event.clientY,
      initial: { ...editing.texture },
      plane: new THREE.Plane().setFromNormalAndCoplanarPoint(normal, point),
      inverse,
      start: point.clone().applyMatrix4(inverse),
      u: axis === 0 ? 1 : 0,
      v: axis === 2 ? 1 : 2,
      center: { x: box.left + box.width / 2, y: box.top + box.height / 2 },
      changed: false,
    };
    onStart?.();
    enableCamera(false);
    canvas.dataset.textureDragging = mode;
    event.preventDefault();
    event.stopImmediatePropagation();
    drag.target.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent) => {
    const d = drag,
      editing = current();
    if (!d || d.pointer !== event.pointerId || editing?.body.id !== d.bodyId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const texture = { ...d.initial };
    if (d.mode === 'move') {
      const p = rayAt(event).ray.intersectPlane(d.plane, new THREE.Vector3());
      if (!p) return;
      const delta = p.applyMatrix4(d.inverse).sub(d.start);
      texture.offsetX = THREE.MathUtils.clamp(
        texture.offsetX + delta.getComponent(d.u),
        -100000,
        100000,
      );
      texture.offsetY = THREE.MathUtils.clamp(
        texture.offsetY + delta.getComponent(d.v),
        -100000,
        100000,
      );
    } else if (d.mode === 'scale') {
      let factor = Math.exp((event.clientX - d.x - (event.clientY - d.y)) * 0.008);
      factor = THREE.MathUtils.clamp(
        factor,
        Math.max(0.1 / texture.width, texture.lockAspect ? 0.1 / texture.height : 0),
        Math.min(100000 / texture.width, texture.lockAspect ? 100000 / texture.height : Infinity),
      );
      texture.width *= factor;
      if (texture.lockAspect) texture.height *= factor;
    } else {
      const a =
        Math.atan2(event.clientY - d.center.y, event.clientX - d.center.x) -
        Math.atan2(d.y - d.center.y, d.x - d.center.x);
      texture.rotation =
        (((texture.rotation + (Math.atan2(Math.sin(a), Math.cos(a)) * 180) / Math.PI) % 360) +
          360) %
        360;
    }
    d.changed ||= Math.hypot(event.clientX - d.x, event.clientY - d.y) > 1;
    editing.change(texture);
  };
  const up = (event: PointerEvent) => {
    if (drag?.pointer !== event.pointerId) return;
    const changed = drag.changed;
    release();
    event.stopImmediatePropagation();
    if (changed) current()?.commit();
  };
  const key = (event: KeyboardEvent) => {
    if (event.key === 'Escape') cancel();
  };
  const scaleDown = (e: PointerEvent) => down(e, 'scale'),
    rotateDown = (e: PointerEvent) => down(e, 'rotate');
  canvas.addEventListener('pointerdown', down, true);
  scale.addEventListener('pointerdown', scaleDown);
  rotate.addEventListener('pointerdown', rotateDown);
  window.addEventListener('pointermove', move, true);
  window.addEventListener('pointerup', up, true);
  window.addEventListener('pointercancel', cancel);
  window.addEventListener('blur', cancel);
  window.addEventListener('keydown', key, true);
  return {
    update,
    cancel,
    dispose() {
      release();
      handles.remove();
      canvas.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('keydown', key, true);
    },
  };
}
