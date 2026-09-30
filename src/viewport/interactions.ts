import * as THREE from 'three';
import type { BodyMesh } from '../cad/protocol';
import type { Anchor, Vec3, WorkPlane } from '../model/project';
import { planeAxes, resolveAnchor } from '../model/guides';
import { modelSnapPoints, snapPoint, type ReferencePoint, type Snap } from '../model/snap';
import type { ViewportProps } from './types';

export function installInteractions({
  container,
  canvas,
  scene,
  bodies,
  camera,
  current,
  render,
}: {
  container: HTMLDivElement;
  canvas: HTMLCanvasElement;
  scene: THREE.Scene;
  bodies: THREE.Group;
  camera: () => THREE.PerspectiveCamera | THREE.OrthographicCamera;
  current: () => ViewportProps;
  render: () => void;
}) {
  const raycaster = new THREE.Raycaster(),
    pointer = new THREE.Vector2();
  const hint = document.createElement('div');
  hint.className = 'snap-hint';
  hint.dataset.testid = 'snap-hint';
  hint.hidden = true;
  container.append(hint);
  const overlay = new THREE.Group();
  scene.add(overlay);
  const makeMarker = (color: string) => {
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(1, 12, 8),
      new THREE.MeshBasicMaterial({ color, depthTest: false }),
    );
    marker.renderOrder = 100;
    marker.visible = false;
    overlay.add(marker);
    return marker;
  };
  const marker = makeMarker('#c98434'),
    referenceMarker = makeMarker('#207c76'),
    hoverMarker = makeMarker('#e4a948');
  const line = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineDashedMaterial({ color: '#4d9c88', dashSize: 12, gapSize: 8, depthTest: false }),
  );
  line.renderOrder = 99;
  overlay.add(line);
  let lastSnap: Snap | undefined,
    acquired: ReferencePoint | undefined,
    hoveredReference: ReferencePoint | undefined,
    acquiredAt = 0,
    heldReference: ReferencePoint | undefined,
    shift = false;
  let epoch = current().epoch,
    tool = current().tool;
  let externalReference = current().reference;
  let measureSession: { anchor: Anchor; plane: WorkPlane } | undefined;
  type Drag = {
    start: Vec3;
    origin: Vec3;
    screenX: number;
    screenY: number;
    height: number;
    plane: WorkPlane;
    second: boolean;
  };
  let drag: Drag | undefined,
    blocked = false;
  const pointers = new Set<number>();
  const screen = (point: Vec3) => {
    const p = new THREE.Vector3(...point).project(camera());
    return {
      x: ((p.x + 1) * container.clientWidth) / 2,
      y: ((1 - p.y) * container.clientHeight) / 2,
      z: p.z,
    };
  };
  const worldPerPixel = (point: Vec3) => {
    const cam = camera();
    return cam instanceof THREE.OrthographicCamera
      ? (cam.top - cam.bottom) / cam.zoom / container.clientHeight
      : (2 *
          cam.position.distanceTo(new THREE.Vector3(...point)) *
          Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))) /
          container.clientHeight;
  };
  const setRay = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      (-(event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    camera().updateMatrixWorld();
    scene.updateMatrixWorld();
    raycaster.setFromCamera(pointer, camera());
  };
  const workPlane = (): WorkPlane => {
    if (['rectangle', 'pen'].includes(current().tool)) return 'XY';
    const d = camera().getWorldDirection(new THREE.Vector3());
    return Math.abs(d.z) > 0.5 ? 'XY' : Math.abs(d.y) > Math.abs(d.x) ? 'XZ' : 'YZ';
  };
  const planePoint = (event: PointerEvent, plane: WorkPlane, origin: Vec3): Vec3 | undefined => {
    setRay(event);
    const normal = new THREE.Vector3();
    normal.setComponent(planeAxes[plane][2], 1);
    const result = raycaster.ray.intersectPlane(
      new THREE.Plane(normal, -origin[planeAxes[plane][2]]),
      new THREE.Vector3(),
    );
    return result?.toArray() as Vec3 | undefined;
  };
  const nearest = (event: PointerEvent, verticesOnly = false) => {
    const props = current(),
      rect = canvas.getBoundingClientRect(),
      x = event.clientX - rect.left,
      y = event.clientY - rect.top;
    const points = verticesOnly
      ? props.meshes.flatMap((m) =>
          m.verticesCAD.map((v) => ({
            point: v.point,
            key: `${m.id}:${v.anchor.key}`,
            label: 'Verteksi',
            anchor: v.anchor,
          })),
        )
      : modelSnapPoints(
          props.bodies.filter((b) => props.tool !== 'move' || b.id !== props.selected),
          props.meshes,
        );
    return points
      .map((p) => ({
        ...p,
        distance: Math.hypot(screen(p.point).x - x, screen(p.point).y - y),
        depth: screen(p.point).z,
      }))
      .filter((p) => p.distance < 18 && p.depth >= -1 && p.depth <= 1)
      .sort((a, b) => a.distance - b.distance)[0];
  };
  const vertexAt = (event: PointerEvent) => {
    const p = nearest(event, true);
    if (!p) return;
    return current()
      .meshes.flatMap((m) => m.verticesCAD)
      .find((v) => v.point.every((n, i) => Math.abs(n - p.point[i]) < 1e-6));
  };
  const reference = () => heldReference ?? current().reference;
  const show = (snap?: Snap, plane: WorkPlane = workPlane()) => {
    const ref = reference();
    const hovered = !ref && current().tool !== 'measure' ? hoveredReference : undefined;
    hoverMarker.visible = !!hovered;
    if (hovered) {
      hoverMarker.position.set(...hovered.point);
      hoverMarker.scale.setScalar(worldPerPixel(hovered.point) * 6);
    }
    marker.visible = !!snap;
    if (snap) {
      marker.position.set(...snap.point);
      marker.scale.setScalar(worldPerPixel(snap.point) * 4);
      const p = screen(snap.point);
      hint.hidden = false;
      hint.textContent = snap.label;
      hint.style.left = `${Math.min(container.clientWidth - 170, Math.max(8, p.x + 15))}px`;
      hint.style.top = `${Math.max(65, p.y - 30)}px`;
      current().onSnap(snap.label);
    } else hint.hidden = true;
    if (hovered) {
      const p = screen(hovered.point);
      hint.hidden = false;
      hint.textContent = `${hovered.label} · Shift: viite`;
      hint.style.left = `${Math.min(container.clientWidth - 200, Math.max(8, p.x + 15))}px`;
      hint.style.top = `${Math.max(65, p.y - 30)}px`;
    }
    referenceMarker.visible = !!ref;
    const segments: number[] = [];
    if (ref) {
      referenceMarker.position.set(...ref.point);
      referenceMarker.scale.setScalar(worldPerPixel(ref.point) * 6);
      const p = [...ref.point] as Vec3;
      if (snap) p[planeAxes[plane][2]] = snap.point[planeAxes[plane][2]];
      for (const axis of planeAxes[plane].slice(0, 2)) {
        const a = [...p],
          b = [...p];
        a[axis] -= 20000;
        b[axis] += 20000;
        segments.push(...a, ...b);
      }
    }
    if (snap?.line) segments.push(...snap.line.flat());
    line.geometry.dispose();
    line.geometry = new THREE.BufferGeometry();
    line.geometry.setAttribute('position', new THREE.Float32BufferAttribute(segments, 3));
    line.computeLineDistances();
    render();
  };
  const snap = (raw: Vec3, plane: WorkPlane, anchor?: Vec3, inference?: Vec3) => {
    const props = current();
    lastSnap = snapPoint(
      raw,
      props.bodies,
      worldPerPixel(raw) * 14,
      lastSnap,
      props.tool === 'move' ? props.axis : undefined,
      anchor,
      props.gridSnap,
      {
        plane,
        meshes: props.meshes,
        guides: props.guides,
        reference: reference(),
        inferenceOrigin: inference,
        excludeId: props.tool === 'move' ? props.selected : undefined,
        forceDirection: shift && !reference() && ['move', 'pen', 'rectangle'].includes(props.tool),
      },
    );
    show(lastSnap, plane);
    return lastSnap.point;
  };
  const popup = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    current().onPopup([
      Math.max(10, Math.min(event.clientX - rect.left + 25, rect.width - 255)),
      Math.max(105, Math.min(event.clientY - rect.top + 25, rect.height - 200)),
    ]);
  };
  const sync = () => {
    if (externalReference !== current().reference) {
      externalReference = current().reference;
      if (!externalReference) heldReference = undefined;
      show(lastSnap);
    }
    if (epoch !== current().epoch || tool !== current().tool) {
      epoch = current().epoch;
      tool = current().tool;
      drag = undefined;
      measureSession = undefined;
      lastSnap = undefined;
      heldReference = undefined;
      acquired = undefined;
      hoveredReference = undefined;
      pointers.clear();
      blocked = false;
      show();
    }
    if (current().guidePreview && !measureSession)
      measureSession = {
        anchor: current().guidePreview!.anchor,
        plane: current().guidePreview!.plane,
      };
  };
  const updateMeasure = (event: PointerEvent) => {
    if (!measureSession) return;
    const props = current(),
      start = resolveAnchor(props.bodies, measureSession.anchor);
    if (!start) return;
    const raw = planePoint(event, measureSession.plane, start);
    if (!raw) return;
    const found = vertexAt(event);
    const vertex =
      found &&
      Math.abs(
        found.point[planeAxes[measureSession.plane][2]] - start[planeAxes[measureSession.plane][2]],
      ) < 1e-5
        ? found
        : undefined;
    const end = vertex ? vertex.point : snap(raw, measureSession.plane);
    props.onGesture({
      type: 'measure',
      anchor: measureSession.anchor,
      end,
      plane: measureSession.plane,
      freeAngle: shift,
      endAnchor: vertex?.anchor,
    });
  };
  const down = (event: PointerEvent) => {
    sync();
    if (event.button !== 0) return;
    pointers.add(event.pointerId);
    if (pointers.size > 1) {
      drag = undefined;
      blocked = true;
      show();
      return;
    }
    const props = current();
    if (props.busy || props.tool === 'navigate') return;
    if (props.pickReference) {
      const p = nearest(event);
      if (p) {
        props.onReference(p);
        props.onReferencePicked();
        show({ ...p });
      }
      return;
    }
    popup(event);
    const selected = props.bodies.find((b) => b.id === props.selected),
      origin = selected?.origin ?? ([0, 0, 0] as Vec3);
    let plane = workPlane(),
      point = planePoint(
        event,
        plane,
        ['rectangle', 'pen'].includes(props.tool) ? [0, 0, 0] : origin,
      );
    const second = !!measureSession;
    if (props.tool === 'measure') {
      if (!measureSession) {
        const vertex = vertexAt(event);
        if (props.measureMode === 'guide' && !vertex) {
          props.onSnap('Valitse kappaleen verteksi.');
          return;
        }
        if (!vertex && !point) return;
        measureSession = { anchor: vertex?.anchor ?? { point: snap(point!, plane) }, plane };
      }
      plane = measureSession.plane;
      point = resolveAnchor(props.bodies, measureSession.anchor);
      updateMeasure(event);
    }
    if (
      !point &&
      !['extrude', 'select'].includes(props.tool) &&
      !(props.tool === 'move' && props.axis === 'z')
    )
      return;
    const start = props.tool === 'rectangle' ? snap(point!, plane) : (point ?? [0, 0, 0]);
    drag = {
      start,
      origin,
      screenX: event.clientX,
      screenY: event.clientY,
      height: selected?.feature.height ?? 0,
      plane,
      second,
    };
    if (props.tool === 'rectangle')
      props.onGesture({
        type: 'rectangle',
        origin: start,
        width: props.preview?.feature.width ?? 600,
        depth: props.preview?.feature.depth ?? 400,
      });
    canvas.setPointerCapture(event.pointerId);
    canvas.focus({ preventScroll: true });
  };
  const move = (event: PointerEvent) => {
    sync();
    const props = current();
    if (blocked || props.busy) return;
    const hovered = nearest(event);
    hoveredReference = hovered;
    if (hovered) {
      acquired = hovered;
      acquiredAt = performance.now();
      if (!drag && !measureSession) show(hovered);
    } else if (!drag && !measureSession) show();
    if (props.pickReference) return;
    if (props.tool === 'measure' && measureSession) {
      updateMeasure(event);
      return;
    }
    if (props.tool === 'pen') {
      const raw = planePoint(event, 'XY', [0, 0, 0]);
      if (!raw) return;
      const point = snap(raw, 'XY', undefined, props.penPoints.at(-1));
      props.onPenHover(point);
      return;
    }
    if (!drag || pointers.size > 1) return;
    if (props.tool === 'extrude') {
      props.onGesture({
        type: 'extrude',
        height: Math.max(
          0.1,
          Math.round(drag.height + (drag.screenY - event.clientY) * worldPerPixel(drag.origin)),
        ),
      });
      return;
    }
    if (props.tool === 'move' && props.axis === 'z') {
      const origin: [number, number, number] = [
        drag.origin[0],
        drag.origin[1],
        drag.origin[2] + (drag.screenY - event.clientY) * worldPerPixel(drag.origin),
      ];
      props.onGesture({ type: 'move', origin: snap(origin, drag.plane, drag.origin) });
      return;
    }
    const raw = planePoint(event, drag.plane, props.tool === 'rectangle' ? [0, 0, 0] : drag.origin);
    if (!raw) return;
    if (props.tool === 'rectangle') {
      const end = snap(raw, 'XY', undefined, drag.start);
      const width = Math.abs(end[0] - drag.start[0]),
        depth = Math.abs(end[1] - drag.start[1]);
      if (width >= 0.1 && depth >= 0.1)
        props.onGesture({
          type: 'rectangle',
          start: drag.start,
          origin: [Math.min(end[0], drag.start[0]), Math.min(end[1], drag.start[1]), 0],
          width,
          depth,
        });
    } else if (props.tool === 'move') {
      const origin = raw.map((n, i) => drag!.origin[i] + n - drag!.start[i]) as Vec3;
      props.onGesture({ type: 'move', origin: snap(origin, drag.plane, drag.origin, drag.origin) });
    }
  };
  const up = (event: PointerEvent) => {
    const props = current(),
      active = drag;
    if (active && !blocked && !props.busy) {
      const moved = Math.hypot(event.clientX - active.screenX, event.clientY - active.screenY) > 4;
      if (props.tool === 'select' && !moved) {
        setRay(event);
        const hit = raycaster
          .intersectObjects(bodies.children)
          .find((h) => h.object instanceof THREE.Mesh);
        if (hit) {
          const faces = hit.object.userData.faces as BodyMesh['faces'],
            index = (hit.faceIndex ?? 0) * 3;
          props.onSelect(
            hit.object.userData.id,
            faces.find((f) => index >= f.start && index < f.start + f.count)?.ref,
            event.shiftKey || event.ctrlKey || event.metaKey,
          );
        } else props.onSelect(undefined, undefined, event.shiftKey);
      } else if (props.tool === 'pen') {
        const raw = planePoint(event, 'XY', [0, 0, 0]);
        if (raw) {
          const point = snap(raw, 'XY', undefined, props.penPoints.at(-1));
          const first = props.penPoints[0],
            pos = first && screen(first),
            rect = canvas.getBoundingClientRect();
          const close =
            props.penPoints.length >= 3 &&
            pos &&
            Math.hypot(pos.x - (event.clientX - rect.left), pos.y - (event.clientY - rect.top)) <
              18;
          props.onGesture({ type: 'pen', point, close: !!close });
        }
      } else if (props.tool === 'measure' && (moved || active.second)) {
        updateMeasure(event);
        props.onAccept();
        measureSession = undefined;
      } else if (moved && ['rectangle', 'move', 'extrude'].includes(props.tool)) {
        move(event);
        props.onAccept();
      }
    }
    pointers.delete(event.pointerId);
    drag = undefined;
    if (!pointers.size) blocked = false;
  };
  const cancel = (event: PointerEvent) => {
    pointers.delete(event.pointerId);
    drag = undefined;
    if (!pointers.size) blocked = false;
  };
  const keydown = (event: KeyboardEvent) => {
    if ((event.target as HTMLElement).closest('input,textarea,select,[contenteditable]')) return;
    if (event.key === 'Shift' && !event.repeat) {
      shift = true;
      if (current().tool !== 'measure' && acquired && performance.now() - acquiredAt < 2000) {
        heldReference = acquired;
        current().onReference(acquired);
        show(acquired);
      }
    }
  };
  const keyup = (event: KeyboardEvent) => {
    if (event.key === 'Shift') {
      shift = false;
      if (heldReference) {
        heldReference = undefined;
        current().onReference(undefined);
        show();
      }
    }
  };
  const blur = () => {
    shift = false;
    if (heldReference) current().onReference(undefined);
    heldReference = undefined;
    drag = undefined;
    pointers.clear();
    blocked = false;
    show();
  };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', cancel);
  window.addEventListener('keydown', keydown);
  window.addEventListener('keyup', keyup);
  window.addEventListener('blur', blur);
  return {
    sync,
    dispose() {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', blur);
      hint.remove();
      scene.remove(overlay);
      overlay.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
    },
  };
}
