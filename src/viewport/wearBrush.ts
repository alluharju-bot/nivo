import * as THREE from 'three';
import type { MaskStroke } from '../model/decals';
export type WearBrush = Omit<MaskStroke, 'points' | 'breaks'> & {
  layerId: string;
  bodyId?: string;
  face?: number;
  onStroke: (id: string, face: number, stroke: MaskStroke) => void;
  onUnavailable?: (message: string) => void;
};
type Hit = {
  id: string;
  face: number;
  uv: [number, number];
  point: THREE.Vector3;
  normal: THREE.Vector3;
};
/** Consume only left-button paint gestures. Camera navigation keeps its normal controls. */
export function installWearBrush(
  canvas: HTMLCanvasElement,
  scene: THREE.Scene,
  current: () => WearBrush | undefined,
  pick: (e: PointerEvent) => Hit | undefined,
  render: () => void,
) {
  const material = new THREE.LineBasicMaterial({
    color: '#f5a454',
    depthWrite: false,
    toneMapped: false,
  });
  const circle = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(
      Array.from(
        { length: 64 },
        (_, i) =>
          new THREE.Vector3(Math.cos((i / 64) * Math.PI * 2), Math.sin((i / 64) * Math.PI * 2), 0),
      ),
    ),
    material,
  );
  const trail = new THREE.Line(new THREE.BufferGeometry(), material);
  const overlays = new THREE.Group();
  overlays.name = 'wear-brush-overlays';
  circle.visible = trail.visible = false;
  overlays.add(circle, trail);
  scene.add(overlays);
  let stroke:
    | {
        id: string;
        face: number;
        pointer: number;
        brush: WearBrush;
        points: [number, number][];
        world: THREE.Vector3[];
        breaks: number[];
      }
    | undefined;
  const clear = () => {
    stroke = undefined;
    circle.visible = trail.visible = false;
    canvas.removeAttribute('data-wear-brush');
    delete canvas.dataset.pointerActive;
    render();
  };
  const target = (e: PointerEvent, brush: WearBrush) => {
    const hit = pick(e);
    return hit &&
      (!brush.bodyId || brush.bodyId === hit.id) &&
      (brush.face === undefined || brush.face === hit.face)
      ? hit
      : undefined;
  };
  const consume = (e: PointerEvent) => {
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  const add = (hit: Hit) => {
    if (!stroke || hit.id !== stroke.id || hit.face !== stroke.face || stroke.points.length >= 1024)
      return;
    const previous = stroke.points.at(-1);
    if (
      previous &&
      Math.hypot(hit.uv[0] - previous[0], hit.uv[1] - previous[1]) < stroke.brush.radius * 0.08
    )
      return;
    const previousWorld = stroke.world.at(-1);
    if (
      previous &&
      previousWorld &&
      Math.hypot(hit.uv[0] - previous[0], hit.uv[1] - previous[1]) >
        previousWorld.distanceTo(hit.point) * 4 + stroke.brush.radius * 2
    )
      stroke.breaks.push(stroke.points.length);
    stroke.points.push(hit.uv);
    stroke.world.push(hit.point.clone().addScaledVector(hit.normal, 0.05));
    trail.geometry.dispose();
    trail.geometry = new THREE.BufferGeometry().setFromPoints(stroke.world);
    trail.visible = true;
  };
  const down = (e: PointerEvent) => {
    const brush = current();
    if (!brush) return;
    if (e.button !== 0) {
      if (stroke) clear();
      return;
    }
    consume(e);
    const hit = target(e, brush);
    if (!hit) return;
    canvas.focus({ preventScroll: true });
    canvas.setPointerCapture(e.pointerId);
    canvas.dataset.pointerActive = 'true';
    stroke = {
      id: hit.id,
      face: hit.face,
      pointer: e.pointerId,
      brush,
      points: [],
      world: [],
      breaks: [],
    };
    add(hit);
    render();
  };
  const move = (e: PointerEvent) => {
    const brush = current();
    if (!brush) {
      if (circle.visible || stroke) clear();
      return;
    }
    if (e.buttons & 6) {
      clear();
      return;
    }
    consume(e);
    const hit = target(e, brush);
    circle.visible = !!hit;
    if (hit) {
      canvas.dataset.wearBrush = 'true';
      circle.position.copy(hit.point).addScaledVector(hit.normal, 0.05);
      circle.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), hit.normal);
      circle.scale.setScalar(brush.radius);
      material.color.set(brush.erase ? '#6fcada' : '#f5a454');
      if (stroke?.pointer === e.pointerId) add(hit);
    }
    render();
  };
  const up = (e: PointerEvent) => {
    if (!stroke || stroke.pointer !== e.pointerId) return;
    consume(e);
    const done = stroke;
    clear();
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    if (done.points.length && current()?.layerId === done.brush.layerId)
      done.brush.onStroke(done.id, done.face, {
        points: done.points,
        ...(done.breaks.length ? { breaks: done.breaks } : {}),
        radius: done.brush.radius,
        strength: done.brush.strength,
        hardness: done.brush.hardness,
        erase: done.brush.erase,
      });
  };
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Escape') clear();
  };
  const leave = () => {
    circle.visible = false;
    render();
  };
  canvas.addEventListener('pointerdown', down, true);
  canvas.addEventListener('pointermove', move, true);
  canvas.addEventListener('pointerup', up, true);
  canvas.addEventListener('pointercancel', clear);
  canvas.addEventListener('pointerleave', leave);
  window.addEventListener('blur', clear);
  window.addEventListener('keydown', key, true);
  return {
    sync: () => {
      if (!current() && (circle.visible || stroke)) clear();
    },
    dispose: () => {
      canvas.removeEventListener('pointerdown', down, true);
      canvas.removeEventListener('pointermove', move, true);
      canvas.removeEventListener('pointerup', up, true);
      canvas.removeEventListener('pointercancel', clear);
      canvas.removeEventListener('pointerleave', leave);
      window.removeEventListener('blur', clear);
      window.removeEventListener('keydown', key, true);
      scene.remove(overlays);
      circle.geometry.dispose();
      trail.geometry.dispose();
      material.dispose();
    },
  };
}
