import * as THREE from 'three';
import type { BodyMesh, FaceTarget } from '../cad/protocol';
import type { Anchor, Axis, Vec3, WorkPlane } from '../model/project';
import {
  planeAxes,
  resolveAnchor,
  guidePoints,
  guideVector,
  angleBetween,
  guideDirection,
} from '../model/guides';
import {
  add,
  sub,
  scale,
  dot,
  unit,
  axisVector,
  projectOnLine,
  planeForDirection,
} from '../model/geometry';
import { modelSnapPoints, snapPoint, type ReferencePoint, type Snap } from '../model/snap';
import type { ViewportProps } from './types';

export function installInteractions({
  container,
  canvas,
  scene,
  bodies,
  guides,
  camera,
  current,
  render,
}: {
  container: HTMLDivElement;
  canvas: HTMLCanvasElement;
  scene: THREE.Scene;
  bodies: THREE.Group;
  guides: THREE.Group;
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
  let measureSession:
    | { anchor: Anchor; plane: WorkPlane; direction?: Vec3; edgeLength?: number; editing?: boolean }
    | undefined;
  let lastEvent: PointerEvent | undefined,
    shiftDirection: Vec3 | undefined,
    lastPenPoint: Vec3 | undefined;
  let previousAxis = current().axis,
    previousPenCount = current().penPoints.length;
  type Drag = {
    start: Vec3;
    origin: Vec3;
    screenX: number;
    screenY: number;
    height: number;
    plane: WorkPlane;
    second: boolean;
    face?: FaceTarget;
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
    if (current().tool === 'rectangle') return 'XY';
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
      : [
          ...modelSnapPoints(
            props.bodies.filter((b) => props.tool !== 'move' || b.id !== props.selected),
            props.meshes,
          ),
          ...(props.tool === 'pen'
            ? props.penPoints.slice(0, -1).map((point, i) => ({
                point,
                key: `pen:${i}`,
                label: i === 0 ? 'Aloituspiste' : 'Kynän piste',
              }))
            : []),
        ];
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
  const faceAt = (event: PointerEvent) => {
    setRay(event);
    const hit = raycaster
      .intersectObjects(bodies.children)
      .find((h) => h.object instanceof THREE.Mesh);
    if (!hit) return;
    const data = current().meshes.find((m) => m.id === hit.object.userData.id),
      index = (hit.faceIndex ?? 0) * 3;
    const face = data?.faces.find((f) => index >= f.start && index < f.start + f.count);
    return face && data
      ? {
          hit,
          face,
          target: {
            bodyId: data.id,
            face: face.ref,
            normal: face.normal,
            point: hit.point.toArray() as Vec3,
          },
        }
      : undefined;
  };
  const highlightFace = (target?: FaceTarget) => {
    for (const obj of bodies.children)
      if (obj instanceof THREE.Mesh) {
        const faces = obj.userData.faces as BodyMesh['faces'];
        (obj.material as THREE.MeshStandardMaterial[]).forEach((m, i) => {
          const active =
            !!target && target.bodyId === obj.userData.id && target.face === faces[i]?.ref;
          m.emissive.set(active ? '#207cb8' : '#000000');
          m.emissiveIntensity = active ? 0.45 : 0;
        });
      }
    canvas.dataset.hoverFace = target?.face ?? '';
    render();
  };
  const edgeAt = (event: PointerEvent) => {
    setRay(event);
    const rect = canvas.getBoundingClientRect(),
      x = event.clientX - rect.left,
      y = event.clientY - rect.top;
    const candidates = current()
      .meshes.flatMap((m) =>
        m.edgesCAD.map((edge) => {
          const a = screen(edge.start),
            b = screen(edge.end),
            dx = b.x - a.x,
            dy = b.y - a.y;
          const t = Math.max(
            0,
            Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)),
          );
          return { edge, distance: Math.hypot(x - a.x - t * dx, y - a.y - t * dy) };
        }),
      )
      .filter((e) => e.distance < 12)
      .sort((a, b) => a.distance - b.distance);
    const found = candidates[0];
    if (!found) return;
    const p = new THREE.Vector3();
    raycaster.ray.distanceSqToSegment(
      new THREE.Vector3(...found.edge.start),
      new THREE.Vector3(...found.edge.end),
      undefined,
      p,
    );
    const delta = sub(found.edge.end, found.edge.start),
      length = Math.hypot(...delta),
      t = Math.max(
        0,
        Math.min(1, dot(sub(p.toArray() as Vec3, found.edge.start), delta) / (length * length)),
      );
    return {
      ...found,
      point: p.toArray() as Vec3,
      direction: unit(delta),
      length,
      anchor: { edge: { from: found.edge.from, to: found.edge.to, t } } as Anchor,
    };
  };
  const linePoint = (event: PointerEvent, start: Vec3, direction: Vec3): Vec3 => {
    setRay(event);
    const d = new THREE.Vector3(...unit(direction)),
      r = raycaster.ray;
    const w = r.origin.clone().sub(new THREE.Vector3(...start)),
      rd = r.direction.dot(d),
      den = 1 - rd * rd;
    if (den < 0.005) {
      const p = screen(start),
        rect = canvas.getBoundingClientRect();
      return add(
        start,
        scale(direction, (p.y - (event.clientY - rect.top)) * worldPerPixel(start)),
      );
    }
    return add(start, scale(d.toArray() as Vec3, (w.dot(d) - w.dot(r.direction) * rd) / den));
  };
  const reference = () => heldReference ?? current().reference;
  const show = (snap?: Snap, plane: WorkPlane = workPlane()) => {
    const ref = reference();
    const hovered =
      !ref && !shiftDirection && !current().axis && current().tool !== 'measure'
        ? hoveredReference
        : undefined;
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
      shiftDirection = undefined;
      lastPenPoint = undefined;
      previousPenCount = current().penPoints.length;
      current().onConstraint(undefined);
      highlightFace();
      pointers.clear();
      blocked = false;
      show();
    }
    if (current().guidePreview && !measureSession)
      measureSession = {
        anchor: current().guidePreview!.anchor,
        plane: current().guidePreview!.plane,
        direction: current().guidePreview!.direction,
        edgeLength:
          'edge' in current().guidePreview!.anchor ? current().guidePreview!.length : undefined,
        editing: !!current().selectedGuideId,
      };
    if (previousPenCount !== current().penPoints.length) {
      previousPenCount = current().penPoints.length;
      shiftDirection = undefined;
      lastSnap = undefined;
      current().onConstraint(current().axis ? axisVector(current().axis!) : undefined);
    }
    if (previousAxis !== current().axis) {
      previousAxis = current().axis;
      shiftDirection = undefined;
      lastSnap = undefined;
      current().onConstraint(
        current().tool === 'pen' && previousAxis ? axisVector(previousAxis) : undefined,
      );
      if (lastEvent) {
        if (current().tool === 'pen') updatePen(lastEvent);
        else if (current().tool === 'measure' && measureSession) updateMeasure(lastEvent);
      }
    }
  };
  const updatePen = (event: PointerEvent): Vec3 | undefined => {
    const props = current(),
      start = props.penPoints.at(-1),
      direction = props.axis ? axisVector(props.axis) : shiftDirection;
    const found = nearest(event),
      edge = edgeAt(event);
    if (start && direction) {
      const picked = found?.point ?? edge?.point ?? faceAt(event)?.target.point;
      let point = picked
        ? projectOnLine(picked, start, direction)
        : linePoint(event, start, direction);
      if (!picked && props.gridSnap)
        point = add(
          start,
          scale(direction, Math.round(dot(sub(point, start), direction) / 10) * 10),
        );
      show({
        point,
        key: 'constraint',
        label: `${props.axis ? props.axis.toUpperCase() : 'Shift'} · ${picked ? 'Pituus poimittu' : 'Suunta lukittu'}`,
        line: [start, point],
      });
      if (picked) {
        referenceMarker.visible = true;
        referenceMarker.position.set(...picked);
        referenceMarker.scale.setScalar(worldPerPixel(picked) * 5);
        render();
      }
      props.onPenHover(point);
      lastPenPoint = point;
      return point;
    }
    let plane = workPlane();
    const raw = planePoint(event, plane, start ?? [0, 0, 0]);
    if (!raw) return;
    let point: Vec3;
    if (found && !reference()) {
      point = found.point;
      show(found, plane);
    } else point = snap(raw, plane, undefined, start);
    props.onPenHover(point);
    lastPenPoint = point;
    return point;
  };
  const updateMeasure = (event: PointerEvent) => {
    if (!measureSession) return;
    const props = current(),
      start = resolveAnchor(props.bodies, measureSession.anchor);
    if (!start) return;
    let plane = measureSession.plane;
    const axis = props.axis ? axisVector(props.axis) : undefined;
    if (axis) plane = planeForDirection(axis, plane);
    const existing = props.guidePreview;
    const base = add(start, existing?.offset ?? [0, 0, 0]);
    const raw = axis ? linePoint(event, base, axis) : planePoint(event, plane, start);
    if (!raw) return;
    const found = vertexAt(event);
    const vertex =
      found &&
      Math.abs(
        found.point[planeAxes[measureSession.plane][2]] - start[planeAxes[measureSession.plane][2]],
      ) < 1e-5
        ? found
        : undefined;
    const end = vertex && !axis ? vertex.point : axis ? raw : snap(raw, plane);
    let direction = axis,
      offset: Vec3 | undefined;
    const isEdge = 'edge' in measureSession.anchor;
    if (isEdge && !props.freeRotate) {
      direction = axis ?? existing?.direction ?? measureSession.direction;
      if (direction) {
        const free = planePoint(event, plane, start) ?? raw;
        offset = sub(free, projectOnLine(free, start, direction));
      }
    } else {
      const from = props.freeRotate ? base : start;
      direction =
        axis ??
        guideDirection(
          plane,
          angleBetween(from, end, plane, props.freeRotate || shift || props.measureMode === 'free'),
        );
    }
    props.onGesture({
      type: 'measure',
      anchor: measureSession.anchor,
      end,
      plane,
      freeAngle: shift || props.freeRotate,
      endAnchor: vertex?.anchor,
      direction,
      offset,
      edgeLength: measureSession.edgeLength,
    });
  };
  const down = (event: PointerEvent) => {
    lastEvent = event;
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
    if (props.tool === 'extrude') {
      const picked = faceAt(event);
      if (!picked?.face.planar) return;
      props.onFaceTarget(picked.target);
      highlightFace(picked.target);
      popup(event);
      drag = {
        start: picked.target.point,
        origin: picked.target.point,
        screenX: event.clientX,
        screenY: event.clientY,
        height: 0,
        plane: workPlane(),
        second: false,
        face: picked.target,
      };
      canvas.setPointerCapture(event.pointerId);
      canvas.focus({ preventScroll: true });
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
        const edge = !vertex ? edgeAt(event) : undefined;
        if (props.measureMode === 'guide' && !vertex && !edge) {
          props.onSnap('Valitse kappaleen verteksi tai reuna.');
          return;
        }
        if (!vertex && !point) return;
        if (edge) plane = planeForDirection(edge.direction, plane);
        measureSession = {
          anchor: vertex?.anchor ?? edge?.anchor ?? { point: snap(point!, plane) },
          plane,
          direction: edge?.direction,
          edgeLength: edge?.length,
        };
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
    lastEvent = event;
    sync();
    const props = current();
    if (blocked || props.busy) return;
    if (props.tool === 'extrude') {
      if (drag?.face) {
        const end = linePoint(event, drag.start, drag.face.normal),
          distance = Math.round(dot(sub(end, drag.start), drag.face.normal) * 100) / 100;
        props.onGesture({ type: 'extrude', distance });
      } else {
        const face = faceAt(event);
        highlightFace(face?.face.planar ? face.target : undefined);
        if (face?.face.planar)
          show({ point: face.target.point, key: 'face', label: 'Vedä pintaa · E' });
        else show();
      }
      return;
    }
    const hovered = nearest(event);
    hoveredReference = hovered;
    if (hovered) {
      acquired = hovered;
      acquiredAt = performance.now();
      if (!drag && !measureSession) show(hovered);
    } else if (!drag && !measureSession) show();
    if (props.pickReference) return;
    if (props.tool === 'measure' && measureSession) {
      if (!measureSession.editing || drag || props.freeRotate) updateMeasure(event);
      return;
    }
    if (props.tool === 'pen') {
      updatePen(event);
      return;
    }
    if (!drag || pointers.size > 1) return;
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
        raycaster.params.Line.threshold = worldPerPixel(props.bodies[0]?.origin ?? [0, 0, 0]) * 7;
        const guideHit = raycaster
          .intersectObjects(guides.children)
          .find((h) => h.object.userData.guideId);
        const obstruction = faceAt(event)?.hit;
        if (
          guideHit &&
          (!obstruction ||
            guideHit.distance <=
              obstruction.distance + worldPerPixel(guideHit.point.toArray() as Vec3) * 2 ||
            guideHit.object.userData.xray)
        ) {
          props.onSelectGuide(guideHit.object.userData.guideId);
          pointers.delete(event.pointerId);
          drag = undefined;
          return;
        }
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
        const point = updatePen(event);
        if (point) {
          const first = props.penPoints[0],
            pos = first && screen(first),
            rect = canvas.getBoundingClientRect();
          const close =
            props.penPoints.length >= 3 &&
            Math.hypot(...sub(point, first)) < worldPerPixel(point) * 10 &&
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
    // Axis shortcuts must not intercept application commands such as Ctrl/Cmd+Z.
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const props = current(),
      key = event.key.toLowerCase();
    if (key === 'escape' && (props.axis || shiftDirection)) {
      event.preventDefault();
      event.stopPropagation();
      props.onAxis(undefined);
      shiftDirection = undefined;
      props.onConstraint(undefined);
      lastSnap = undefined;
      show();
      return;
    }
    if (['x', 'y', 'z'].includes(key) && ['pen', 'measure'].includes(props.tool)) {
      event.preventDefault();
      props.onAxis(props.axis === key ? undefined : (key as Axis));
      return;
    }
    if (event.key === 'Shift' && !event.repeat) {
      shift = true;
      if (props.tool === 'pen' && props.penPoints.length && lastPenPoint) {
        const delta = sub(lastPenPoint, props.penPoints.at(-1)!);
        if (Math.hypot(...delta) > 0.01) {
          shiftDirection = unit(delta);
          props.onConstraint(shiftDirection);
          if (lastEvent) updatePen(lastEvent);
        }
      } else if (
        current().tool !== 'measure' &&
        acquired &&
        performance.now() - acquiredAt < 2000
      ) {
        heldReference = acquired;
        current().onReference(acquired);
        show(acquired);
      }
    }
  };
  const keyup = (event: KeyboardEvent) => {
    if (event.key === 'Shift') {
      shift = false;
      if (shiftDirection) {
        shiftDirection = undefined;
        current().onConstraint(current().axis ? axisVector(current().axis!) : undefined);
      }
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
    shiftDirection = undefined;
    current().onConstraint(undefined);
    drag = undefined;
    pointers.clear();
    blocked = false;
    show();
  };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', cancel);
  window.addEventListener('keydown', keydown, true);
  window.addEventListener('keyup', keyup);
  window.addEventListener('blur', blur);
  return {
    sync,
    dispose() {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', keydown, true);
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
