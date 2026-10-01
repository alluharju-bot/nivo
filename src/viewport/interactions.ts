import { offsetDirection } from '../model/faceBoundary';
import { faceDepthSnap } from '../model/extrusion';
import { formatLength } from '../model/units';
import * as THREE from 'three';
import type { BodyMesh, FaceTarget, BoundaryTarget } from '../cad/protocol';
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
import {
  modelSnapPoints,
  snapPoint,
  snapOnSketchPlane,
  type ReferencePoint,
  type Snap,
} from '../model/snap';
import { sketchFrame, toUV, fromUV, type SketchFrame } from '../model/sketch';
import { rotationHandles } from '../model/rotationHandles';
import { cross } from '../model/transforms';
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
  const edgeHighlight = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 1, 8),
    new THREE.MeshBasicMaterial({ color: '#f0a12c', depthTest: false }),
  );
  edgeHighlight.visible = false;
  edgeHighlight.renderOrder = 98;
  overlay.add(edgeHighlight);
  const boundaryHighlight = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: '#cc672b', depthTest: false }),
  );
  boundaryHighlight.renderOrder = 100;
  boundaryHighlight.visible = false;
  overlay.add(boundaryHighlight);
  const highlightEdge = (edge?: { start: Vec3; end: Vec3 }) => {
    edgeHighlight.visible = !!edge;
    canvas.dataset.hoverEdge = edge ? JSON.stringify([edge.start, edge.end]) : '';
    if (edge) {
      const a = new THREE.Vector3(...edge.start),
        b = new THREE.Vector3(...edge.end);
      edgeHighlight.position.copy(a).add(b).multiplyScalar(0.5);
      edgeHighlight.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        b.clone().sub(a).normalize(),
      );
      const radius = worldPerPixel(edgeHighlight.position.toArray() as Vec3) * 1.8;
      edgeHighlight.scale.set(radius, a.distanceTo(b), radius);
    }
    render();
  };
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
    | {
        anchor: Anchor;
        plane: WorkPlane;
        direction?: Vec3;
        edgeLength?: number;
        editing?: boolean;
        frame?: SketchFrame;
        adjacent?: BodyMesh['faces'];
        surfaceChosen?: boolean;
      }
    | undefined;
  let lastEvent: PointerEvent | undefined,
    shiftDirection: Vec3 | undefined,
    lastPenPoint: Vec3 | undefined;
  let previousAxis = current().axis,
    previousPenCount = current().penPoints.length;
  let drawingPlane: SketchFrame | undefined;
  let drawingTarget: FaceTarget | undefined;
  type Drag = {
    start: Vec3;
    origin: Vec3;
    screenX: number;
    screenY: number;
    height: number;
    plane: WorkPlane;
    second: boolean;
    face?: FaceTarget;
    sketch?: SketchFrame;
    bodyId?: string;
  };
  let shapeSession: Drag | undefined;
  let offsetSession: { target: FaceTarget; direction: Vec3; initial: number } | undefined;
  let extrudeSession:
    | {
        target: FaceTarget;
        x: number;
        y: number;
        dx: number;
        dy: number;
        baseDistance: number;
        distance: number;
      }
    | undefined;
  const startOffset = (target: FaceTarget) => {
    const mesh = current().meshes.find((m) => m.id === target.bodyId);
    if (!mesh) return;
    offsetSession = {
      target,
      direction: offsetDirection(mesh, target),
      initial: Number.isFinite(current().offsetDistance) ? current().offsetDistance : 18,
    };
  };
  const updateOffset = (event: PointerEvent) => {
    if (!offsetSession) return;
    const { target, direction, initial } = offsetSession;
    const point = framePoint(event, sketchFrame(target.point, target.normal));
    if (!point) return;
    const distance = Math.max(
      0.1,
      Math.round((initial + dot(sub(point, target.point), direction)) * 100) / 100,
    );
    current().onGesture({ type: 'offset', distance });
    highlightFace(target);
  };
  let rotationDrag:
    | {
        pivot: Vec3;
        axis: Vec3;
        reference: Vec3;
        initial: number;
        total: number;
        last: number;
        x: number;
        y: number;
        tangentX: number;
        tangentY: number;
        pixelsPerRadian: number;
        edgeOn: boolean;
      }
    | undefined;
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
  const startExtrusion = (target: FaceTarget, event: PointerEvent, distance = 0) => {
    // Fix the drag mapping for the gesture. A moving perspective ray can become
    // parallel to the normal and make closest-line calculations jump or go dead.
    const pixels = worldPerPixel(target.point),
      a = screen(target.point),
      b = screen(add(target.point, scale(target.normal, pixels))),
      dx = b.x - a.x,
      dy = b.y - a.y,
      lengthSq = dx * dx + dy * dy;
    extrudeSession = {
      target,
      x: event.clientX,
      y: event.clientY,
      dx: lengthSq < 0.04 ? 0 : (dx * pixels) / lengthSq,
      dy: lengthSq < 0.04 ? -pixels : (dy * pixels) / lengthSq,
      baseDistance: distance,
      distance,
    };
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
  const normalPlane = (normal: Vec3): WorkPlane => {
    const [x, y, z] = normal.map(Math.abs);
    return z >= x && z >= y ? 'XY' : y >= x ? 'XZ' : 'YZ';
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
  const framePoint = (event: PointerEvent, frame: SketchFrame): Vec3 | undefined => {
    setRay(event);
    return raycaster.ray
      .intersectPlane(
        new THREE.Plane(new THREE.Vector3(...frame.normal), -dot(frame.normal, frame.origin)),
        new THREE.Vector3(),
      )
      ?.toArray() as Vec3 | undefined;
  };
  const frameSnap = (point: Vec3, frame: SketchFrame, start?: Vec3) => {
    const p = current(),
      extra = p.penPoints.slice(0, -1).map((point, i) => ({
        point,
        key: `pen:${i}`,
        label: i === 0 ? 'Aloituspiste' : 'Kynän piste',
      }));
    const snapped = snapOnSketchPlane(
      point,
      frame,
      p.bodies,
      p.meshes,
      p.guides,
      worldPerPixel(point) * 12,
      p.gridSnap,
      reference(),
      start,
      extra,
    );
    show(snapped);
    return snapped.point;
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
            props.bodies.filter(
              (b) => props.tool !== 'move' || props.copyMove || b.id !== props.selected,
            ),
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
      .sort((a, b) =>
        Math.abs(a.distance - b.distance) < 1 ? a.depth - b.depth : a.distance - b.distance,
      )[0];
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
            point: face.planar
              ? sub(
                  hit.point.toArray() as Vec3,
                  scale(
                    face.normal,
                    dot(sub(hit.point.toArray() as Vec3, face.center), face.normal),
                  ),
                )
              : (hit.point.toArray() as Vec3),
          },
        }
      : undefined;
  };
  const editableFaceAt = (event: PointerEvent) => {
    const picked = faceAt(event);
    return picked &&
      !current().bodies.find((b) => b.id === picked.target.bodyId)?.locked &&
      (!current().editingBodyId || current().editingBodyId === picked.target.bodyId)
      ? picked
      : undefined;
  };
  const sketchSurfaceAt = (event: PointerEvent): FaceTarget | undefined => {
    const hit = faceAt(event),
      vertex = vertexAt(event);
    if (
      vertex &&
      (!hit ||
        hit.hit.distance >=
          raycaster.ray.origin.distanceTo(new THREE.Vector3(...vertex.point)) -
            worldPerPixel(vertex.point) * 2)
    ) {
      const mesh = current().meshes.find((m) => m.id === vertex.anchor.bodyId);
      const towardCamera = raycaster.ray.direction.clone().negate().toArray() as Vec3;
      // A corner can miss the triangle mesh or belong to several faces. Pick
      // the adjacent plane facing the camera, then snap to the exact CAD vertex.
      const face = mesh?.faces
        .filter(
          (f) =>
            f.planar &&
            Math.abs(dot(sub(vertex.point, f.center), f.normal)) < 1e-5 &&
            dot(f.normal, towardCamera) > 0.05,
        )
        .sort((a, b) => dot(b.normal, towardCamera) - dot(a.normal, towardCamera))[0];
      if (face && mesh)
        return { bodyId: mesh.id, face: face.ref, normal: face.normal, point: vertex.point };
    }
    return hit?.face.planar ? hit.target : undefined;
  };
  const highlightFace = (target?: FaceTarget, reference = false) => {
    if (
      !reference &&
      (current().bodies.find((b) => b.id === target?.bodyId)?.locked ||
        (current().editingBodyId && target?.bodyId !== current().editingBodyId))
    )
      target = undefined;
    current().onFaceHover(reference ? undefined : target);
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
  const highlightBoundary = (target?: BoundaryTarget) => {
    highlightFace();
    boundaryHighlight.visible = !!target;
    boundaryHighlight.geometry.dispose();
    boundaryHighlight.geometry = new THREE.BufferGeometry();
    boundaryHighlight.geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(target?.lines ?? [], 3),
    );
    for (const obj of bodies.children)
      if (obj instanceof THREE.Mesh && obj.userData.id === target?.bodyId) {
        const faces = obj.userData.faces as BodyMesh['faces'];
        (obj.material as THREE.MeshStandardMaterial[]).forEach((material, i) => {
          const active = target!.faces.includes(faces[i].ref);
          material.emissive.set(active ? '#ce8d4a' : '#000000');
          material.emissiveIntensity = active ? 0.32 : 0;
        });
      }
    canvas.dataset.eraseBoundary = target
      ? JSON.stringify({ bodyId: target.bodyId, faces: target.faces })
      : '';
    render();
  };
  const boundaryAt = (event: PointerEvent): BoundaryTarget | undefined => {
    const props = current(),
      rect = canvas.getBoundingClientRect();
    const cursor = new THREE.Vector2(event.clientX - rect.left, event.clientY - rect.top);
    const candidates: {
      target: BoundaryTarget;
      point: THREE.Vector3;
      distance: number;
      depth: number;
    }[] = [];
    for (const mesh of props.meshes) {
      if (props.editingBodyId && props.editingBodyId !== mesh.id) continue;
      if (props.bodies.find((b) => b.id === mesh.id)?.locked) continue;
      for (const boundary of mesh.boundaries) {
        for (let i = 0; i < boundary.lines.length; i += 6) {
          const start = boundary.lines.slice(i, i + 3) as Vec3,
            end = boundary.lines.slice(i + 3, i + 6) as Vec3;
          const a = screen(start),
            b = screen(end),
            dx = b.x - a.x,
            dy = b.y - a.y;
          const t = Math.max(
            0,
            Math.min(1, ((cursor.x - a.x) * dx + (cursor.y - a.y) * dy) / (dx * dx + dy * dy || 1)),
          );
          const distance = Math.hypot(cursor.x - a.x - t * dx, cursor.y - a.y - t * dy);
          const depth = a.z + t * (b.z - a.z);
          if (distance > 12 || depth < -1 || depth > 1) continue;
          candidates.push({
            target: { ...boundary, bodyId: mesh.id },
            point: new THREE.Vector3(...start).lerp(new THREE.Vector3(...end), t),
            distance,
            depth,
          });
        }
      }
    }
    candidates.sort((a, b) =>
      Math.abs(a.distance - b.distance) < 1 ? a.depth - b.depth : a.distance - b.distance,
    );
    return candidates.find(({ point }) => {
      const projected = point.clone().project(camera()),
        ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(projected.x, projected.y), camera());
      const hit = ray.intersectObjects(bodies.children).find((h) => h.object instanceof THREE.Mesh);
      return (
        !hit ||
        hit.distance >=
          ray.ray.origin.distanceTo(point) - worldPerPixel(point.toArray() as Vec3) * 0.5
      );
    })?.target;
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
          return {
            edge,
            mesh: m,
            depth: a.z + t * (b.z - a.z),
            distance: Math.hypot(x - a.x - t * dx, y - a.y - t * dy),
          };
        }),
      )
      .filter((e) => e.distance < 12 && e.depth >= -1 && e.depth <= 1)
      .sort((a, b) =>
        Math.abs(a.distance - b.distance) < 1 ? a.depth - b.depth : a.distance - b.distance,
      );
    const found = candidates.find((candidate) => {
      const point = new THREE.Vector3();
      raycaster.ray.distanceSqToSegment(
        new THREE.Vector3(...candidate.edge.start),
        new THREE.Vector3(...candidate.edge.end),
        undefined,
        point,
      );
      const projected = point.clone().project(camera());
      const visibility = new THREE.Raycaster();
      visibility.setFromCamera(new THREE.Vector2(projected.x, projected.y), camera());
      const obstruction = visibility
        .intersectObjects(bodies.children)
        .find((h) => h.object instanceof THREE.Mesh);
      return (
        !obstruction ||
        obstruction.distance >=
          visibility.ray.origin.distanceTo(point) - worldPerPixel(point.toArray() as Vec3) * 2
      );
    });
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
  const depthTargetAt = (event: PointerEvent, source: FaceTarget) => {
    const picked = faceAt(event);
    const match = picked?.face.planar ? faceDepthSnap(source, picked.target) : undefined;
    canvas.dataset.depthTarget = match ? `${picked!.target.bodyId}:${picked!.target.face}` : '';
    canvas.dataset.depthKind = match ? (match.parallel ? 'plane' : 'point') : '';
    hoveredReference = undefined;
    if (!match) {
      highlightFace(source);
      show();
      return;
    }
    highlightFace(picked!.target, true);
    show({
      point: picked!.target.point,
      key: 'depth-target',
      label: `${match.parallel ? 'Tavoitepinta · sama taso' : 'Tavoitepiste · vino pinta'} · ${formatLength(match.distance)} mm`,
      line: [picked!.target.point, add(source.point, scale(source.normal, match.distance))],
    });
    return match;
  };
  const clearDepthTarget = () => {
    canvas.dataset.depthTarget = '';
    canvas.dataset.depthKind = '';
  };
  const updateExtrusion = (event: PointerEvent) => {
    const session = extrudeSession;
    if (!session) return;
    const props = current();
    if (props.extrusionLocked) {
      clearDepthTarget();
      highlightFace(session.target);
      show();
      return;
    }
    if (shift) {
      const snap = depthTargetAt(event, session.target);
      // Searching is explicit: empty space or the source face leaves the last
      // depth intact, rather than unexpectedly falling back to free dragging.
      if (!snap) {
        props.onSnap('Shift · Osoita toista tasopintaa tavoitteeksi.');
        return;
      }
      session.distance = snap.distance;
    } else {
      clearDepthTarget();
      highlightFace(session.target);
      show();
      session.distance =
        Math.round(
          (session.baseDistance +
            (event.clientX - session.x) * session.dx +
            (event.clientY - session.y) * session.dy) *
            100,
        ) / 100;
    }
    props.onGesture({ type: 'extrude', distance: session.distance });
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
        excludeId: props.tool === 'move' && !props.copyMove ? props.selected : undefined,
        projectGuides: props.tool === 'move',
        forceDirection: shift && !reference() && ['move', 'pen', 'rectangle'].includes(props.tool),
      },
    );
    show(lastSnap, plane);
    return lastSnap.point;
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
      rotationDrag = undefined;
      offsetSession = undefined;
      extrudeSession = undefined;
      shapeSession = undefined;
      canvas.dataset.depthTarget = '';
      canvas.dataset.depthKind = '';
      measureSession = undefined;
      lastSnap = undefined;
      heldReference = undefined;
      acquired = undefined;
      hoveredReference = undefined;
      shiftDirection = undefined;
      drawingPlane = current().sketchFrame;
      drawingTarget = current().sketchTarget;
      lastPenPoint = undefined;
      previousPenCount = current().penPoints.length;
      current().onConstraint(undefined);
      highlightFace();
      highlightEdge();
      highlightBoundary();
      pointers.clear();
      blocked = false;
      show();
    }
    if (current().tool === 'offset' && current().faceTarget && !offsetSession)
      startOffset(current().faceTarget!);
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
    if (drawingPlane && drawingTarget) {
      const raw = framePoint(event, drawingPlane);
      if (!raw) return;
      const point = frameSnap(raw, drawingPlane, start);
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
    const existing = props.guidePreview;
    const base = add(start, existing?.offset ?? [0, 0, 0]);
    const isEdge = props.measureMode === 'guide' && 'edge' in measureSession.anchor;
    if (isEdge && !props.freeRotate) {
      const direction = existing?.direction ?? measureSession.direction;
      if (!direction) return;
      if (
        !axis &&
        !measureSession.surfaceChosen &&
        drag &&
        Math.hypot(event.clientX - drag.screenX, event.clientY - drag.screenY) > 4
      ) {
        const hit = faceAt(event);
        if (hit && measureSession.adjacent?.includes(hit.face)) {
          measureSession.frame = sketchFrame(start, hit.face.normal);
          measureSession.plane = plane = normalPlane(hit.face.normal);
          measureSession.surfaceChosen = true;
        }
      }
      let raw = axis
        ? linePoint(event, start, axis)
        : measureSession.frame
          ? framePoint(event, measureSession.frame)
          : planePoint(event, plane, start);
      if (!raw) return;
      if (!axis && measureSession.frame) raw = frameSnap(raw, measureSession.frame);
      let offset = axis ? sub(raw, start) : sub(raw, projectOnLine(raw, start, direction));
      if (axis && props.gridSnap) offset = scale(axis, Math.round(dot(offset, axis) / 10) * 10);
      const end = add(start, offset);
      show(
        {
          point: end,
          key: 'edge-offset',
          label: axis
            ? `${props.axis!.toUpperCase()} · Siirtosuunta lukittu`
            : 'Reunan suuntainen apuviiva',
          line: [start, end],
        },
        plane,
      );
      props.onGesture({
        type: 'measure',
        anchor: measureSession.anchor,
        end,
        plane,
        freeAngle: false,
        direction,
        offset,
        edgeLength: measureSession.edgeLength,
      });
      return;
    }
    if (axis && !isEdge) plane = planeForDirection(axis, plane);
    const raw = axis && !isEdge ? linePoint(event, start, axis) : planePoint(event, plane, base);
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
    const from = props.freeRotate ? base : start;
    const direction =
      (!isEdge && axis) ||
      guideDirection(
        plane,
        angleBetween(from, end, plane, props.freeRotate || shift || props.measureMode === 'free'),
      );
    props.onGesture({
      type: 'measure',
      anchor: measureSession.anchor,
      end,
      plane,
      freeAngle: shift || props.freeRotate,
      endAnchor: vertex?.anchor,
      direction,
      edgeLength: measureSession.edgeLength,
    });
  };
  const rotationHandleAt = (event: PointerEvent) => {
    const rotation = current().rotation;
    if (!rotation || rotation.picking) return;
    const rect = canvas.getBoundingClientRect(),
      x = event.clientX - rect.left,
      y = event.clientY - rect.top;
    return rotationHandles(rotation, current().bodies)
      .flatMap((handle) =>
        handle.points.slice(1).map((point, i) => {
          const a = screen(handle.points[i]),
            b = screen(point),
            dx = b.x - a.x,
            dy = b.y - a.y;
          const t = Math.max(
            0,
            Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)),
          );
          return {
            ...handle,
            point: add(handle.points[i], scale(sub(point, handle.points[i]), t)),
            distance: Math.hypot(x - a.x - t * dx, y - a.y - t * dy),
          };
        }),
      )
      .filter((h) => h.distance < 11)
      .sort((a, b) => a.distance - b.distance)[0];
  };
  const rotationPoint = (event: PointerEvent) => {
    const vertex = nearest(event),
      edge = edgeAt(event),
      hit = faceAt(event);
    const rotation = current().rotation;
    return (
      vertex?.point ??
      edge?.point ??
      hit?.target.point ??
      (rotation
        ? framePoint(event, sketchFrame(rotation.pivot, rotation.axis))
        : planePoint(event, workPlane(), [0, 0, 0]))
    );
  };
  const updateRotation = (event: PointerEvent) => {
    const active = rotationDrag;
    if (!active) return;
    let angle: number;
    if (active.edgeOn)
      angle =
        active.initial +
        ((((event.clientX - active.x) * active.tangentX +
          (event.clientY - active.y) * active.tangentY) /
          active.pixelsPerRadian) *
          180) /
          Math.PI;
    else {
      const point = framePoint(event, sketchFrame(active.pivot, active.axis));
      if (!point || Math.hypot(...sub(point, active.pivot)) < 1e-6) return;
      const direction = unit(sub(point, active.pivot));
      const raw =
        (Math.atan2(
          dot(active.axis, cross(active.reference, direction)),
          dot(active.reference, direction),
        ) *
          180) /
        Math.PI;
      active.total += ((raw - active.last + 540) % 360) - 180;
      active.last = raw;
      angle = active.initial + active.total;
    }
    current().onRotationAngle(shift ? Math.round(angle / 15) * 15 : Math.round(angle * 100) / 100);
  };
  const down = (event: PointerEvent) => {
    lastEvent = event;
    sync();
    if (event.button !== 0) return;
    pointers.add(event.pointerId);
    if (pointers.size > 1) {
      drag = undefined;
      extrudeSession = undefined;
      shapeSession = undefined;
      rotationDrag = undefined;
      blocked = true;
      show();
      return;
    }
    const props = current();
    if (props.busy || props.tool === 'navigate') return;
    if (props.tool === 'erase') {
      const target = boundaryAt(event);
      highlightBoundary(target);
      drag = {
        start: [0, 0, 0],
        origin: [0, 0, 0],
        screenX: event.clientX,
        screenY: event.clientY,
        height: 0,
        plane: 'XY',
        second: false,
      };
      canvas.setPointerCapture(event.pointerId);
      canvas.focus({ preventScroll: true });
      return;
    }
    if (props.pickReference) {
      const p = nearest(event);
      if (p) {
        props.onReference(p);
        props.onReferencePicked();
        show({ ...p });
      }
      return;
    }
    if (props.tool === 'rotate') {
      const rotation = props.rotation;
      if (rotation?.picking) {
        const edge = edgeAt(event);
        if (rotation.picking === 'edge') {
          if (edge) {
            props.onRotationPick(edge.point, edge.direction);
            highlightEdge();
          } else props.onSnap('Valitse suora reuna kiertoakseliksi.');
        } else {
          const point = rotationPoint(event);
          if (point) props.onRotationPick(point);
        }
        canvas.focus({ preventScroll: true });
        return;
      }
      const handle = rotationHandleAt(event);
      if (handle && rotation) {
        const axis = handle.axis,
          pivot = rotation.pivot;
        const point = framePoint(event, sketchFrame(pivot, axis)) ?? handle.point;
        const reference = unit(sub(point, pivot)),
          tangent = cross(axis, reference);
        const a = screen(handle.point),
          b = screen(add(handle.point, scale(tangent, handle.radius)));
        const pixelsPerRadian = Math.max(20, Math.hypot(b.x - a.x, b.y - a.y));
        setRay(event);
        rotationDrag = {
          pivot,
          axis,
          reference,
          initial: rotation.angle,
          total: 0,
          last: 0,
          x: event.clientX,
          y: event.clientY,
          tangentX: (b.x - a.x) / pixelsPerRadian,
          tangentY: (b.y - a.y) / pixelsPerRadian,
          pixelsPerRadian,
          edgeOn: Math.abs(dot(raycaster.ray.direction.toArray() as Vec3, axis)) < 0.08,
        };
        props.onRotationAxis(axis);
        drag = {
          start: pivot,
          origin: pivot,
          screenX: event.clientX,
          screenY: event.clientY,
          height: 0,
          plane: 'XY',
          second: false,
        };
        canvas.setPointerCapture(event.pointerId);
      } else {
        const hit = editableFaceAt(event);
        if (hit) {
          const body = props.bodies.find((b) => b.id === hit.target.bodyId);
          if (body?.locked) props.onSnap('Kappale on kiinnitetty. Vapauta se G-näppäimellä.');
          else props.onRotationPick(hit.target.point, undefined, hit.target.bodyId);
        }
      }
      canvas.focus({ preventScroll: true });
      return;
    }
    if (props.tool === 'offset') {
      const continuing = !!offsetSession;
      if (!offsetSession) {
        const picked = editableFaceAt(event);
        if (!picked?.face.planar) return;
        props.onFaceTarget(picked.target);
        props.onStart();
        startOffset(picked.target);
      }
      if (!offsetSession) return;
      drag = {
        start: offsetSession.target.point,
        origin: offsetSession.target.point,
        screenX: event.clientX,
        screenY: event.clientY,
        height: 0,
        plane: workPlane(),
        second: continuing,
      };
      canvas.setPointerCapture(event.pointerId);
      canvas.focus({ preventScroll: true });
      return;
    }
    if (props.tool === 'extrude') {
      shift = event.shiftKey;
      if (props.pickDepth && props.faceTarget) {
        const snap = depthTargetAt(event, props.faceTarget);
        if (snap) props.onDepthPicked(snap.distance);
        else props.onSnap('Valitse toinen tasopinta tavoitteeksi.');
        return;
      }
      const continuing = !!extrudeSession || (props.extrusionLocked && !!props.faceTarget);
      if (!extrudeSession && continuing)
        startExtrusion(props.faceTarget!, event, props.faceDistance);
      if (!extrudeSession) {
        const picked = editableFaceAt(event);
        if (!picked?.face.planar) return;
        startExtrusion(picked.target, event);
        props.onFaceTarget(picked.target);
        highlightFace(picked.target);
        props.onStart();
      }
      if (!extrudeSession) return;
      drag = {
        start: extrudeSession.target.point,
        origin: extrudeSession.target.point,
        screenX: event.clientX,
        screenY: event.clientY,
        height: 0,
        plane: workPlane(),
        second: continuing,
        face: extrudeSession.target,
      };
      canvas.setPointerCapture(event.pointerId);
      canvas.focus({ preventScroll: true });
      return;
    }
    if (['rectangle', 'circle'].includes(props.tool) && shapeSession) {
      drag = { ...shapeSession, screenX: event.clientX, screenY: event.clientY, second: true };
      canvas.setPointerCapture(event.pointerId);
      canvas.focus({ preventScroll: true });
      return;
    }
    if (
      props.tool === 'rectangle' ||
      props.tool === 'circle' ||
      (props.tool === 'pen' && !props.penPoints.length)
    ) {
      const target = sketchSurfaceAt(event);
      if (target) {
        drawingTarget = target;
        drawingPlane = sketchFrame(
          scale(target.normal, dot(target.normal, target.point)),
          target.normal,
        );
      } else {
        drawingTarget = undefined;
        drawingPlane = props.tool === 'pen' ? undefined : sketchFrame([0, 0, 0]);
      }
      if (drawingPlane) {
        const raw = framePoint(event, drawingPlane);
        if (!raw) return;
        const start = frameSnap(raw, drawingPlane),
          frame = { ...drawingPlane, origin: start };
        props.onSketchPlane(frame, drawingTarget);
        if (props.tool !== 'pen') {
          props.onStart();
          drag = {
            start,
            origin: start,
            screenX: event.clientX,
            screenY: event.clientY,
            height: 0,
            plane: 'XY',
            second: false,
            sketch: drawingPlane,
          };
          shapeSession = drag;
          props.onGesture({
            type: 'profile',
            frame,
            width: 0,
            depth: 0,
          });
          canvas.setPointerCapture(event.pointerId);
          canvas.focus({ preventScroll: true });
          return;
        }
      }
    }
    props.onStart();
    const moveHit = props.tool === 'move' ? faceAt(event) : undefined;
    const moveTarget = moveHit?.target.bodyId;
    if (
      props.tool === 'move' &&
      props.editingBodyId &&
      (moveTarget ?? props.selected) !== props.editingBodyId
    )
      return;
    if (
      props.tool === 'move' &&
      props.bodies.find((b) => b.id === (moveTarget ?? props.selected))?.locked
    ) {
      props.onSnap('Kappale on kiinnitetty. Vapauta se G-näppäimellä.');
      return;
    }
    if (moveTarget) props.onMoveTarget(moveTarget);
    const selected = props.bodies.find((b) => b.id === (moveTarget ?? props.selected)),
      origin = selected?.origin ?? ([0, 0, 0] as Vec3);
    let plane = workPlane(),
      point = planePoint(
        event,
        plane,
        ['rectangle', 'pen'].includes(props.tool) ? [0, 0, 0] : origin,
      );
    if (props.tool === 'move' && selected) {
      const vertex = vertexAt(event);
      // Carry the actual grab point: snapping an origin moves the wrong corner.
      const grab = vertex?.anchor.bodyId === selected.id ? vertex.point : moveHit?.target.point;
      if (grab) point = grab;
      props.onCopyMove(event.ctrlKey || event.altKey || props.copyMove);
    }
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
        const adjacent = edge?.mesh.faces.filter(
          (f) =>
            f.planar &&
            Math.abs(dot(sub(edge.edge.start, f.center), f.normal)) < 1e-5 &&
            Math.abs(dot(sub(edge.edge.end, f.center), f.normal)) < 1e-5,
        );
        const hit = faceAt(event);
        const face =
          adjacent?.find((f) => f === hit?.face) ??
          adjacent
            ?.slice()
            .sort(
              (a, b) =>
                Math.abs(
                  dot(b.normal, camera().getWorldDirection(new THREE.Vector3()).toArray() as Vec3),
                ) -
                Math.abs(
                  dot(a.normal, camera().getWorldDirection(new THREE.Vector3()).toArray() as Vec3),
                ),
            )[0];
        if (edge)
          plane = face ? normalPlane(face.normal) : planeForDirection(edge.direction, plane);
        measureSession = {
          anchor: vertex?.anchor ?? edge?.anchor ?? { point: snap(point!, plane) },
          plane,
          direction: edge?.direction,
          edgeLength: props.measureMode === 'guide' ? edge?.length : undefined,
          frame: edge && face ? sketchFrame(edge.point, face.normal) : undefined,
          adjacent,
        };
      }
      plane = measureSession.plane;
      point = resolveAnchor(props.bodies, measureSession.anchor);
      updateMeasure(event);
    }
    if (
      !point &&
      !['extrude', 'select', 'boolean'].includes(props.tool) &&
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
      bodyId: props.tool === 'move' ? selected?.id : undefined,
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
    if (props.tool === 'erase') {
      const target = boundaryAt(event);
      highlightBoundary(target);
      props.onSnap(
        target
          ? 'Poista rajaus · korostetut tasopinnat yhdistyvät.'
          : 'Osoita samantasoisten pintojen jakoviivaa.',
      );
      return;
    }
    if (props.tool === 'rotate') {
      if (rotationDrag) {
        updateRotation(event);
        return;
      }
      const rotation = props.rotation;
      if (rotation?.picking) {
        const edge = edgeAt(event);
        highlightEdge(rotation.picking === 'edge' ? edge?.edge : undefined);
        const point = rotation.picking === 'edge' ? edge?.point : rotationPoint(event);
        show(
          point
            ? {
                point,
                key: 'rotation-pivot',
                label: rotation.picking === 'edge' ? 'Reuna · kiertoakseli' : 'Kiertopiste',
              }
            : undefined,
        );
      } else {
        const handle = rotationHandleAt(event),
          face = !handle && faceAt(event);
        canvas.dataset.rotationHandle = handle?.name ?? '';
        highlightFace(face ? face.target : undefined);
        show(
          handle
            ? { point: handle.point, key: 'rotation-handle', label: `Kierrä · ${handle.name}` }
            : face
              ? {
                  point: face.target.point,
                  key: 'rotation-body',
                  label: 'Valitse kierrettävä kappale',
                }
              : undefined,
        );
      }
      return;
    }
    if (props.tool === 'offset' && offsetSession) {
      updateOffset(event);
      return;
    }
    if (props.tool === 'select' || props.tool === 'offset') {
      const face = editableFaceAt(event);
      highlightFace(face?.target);
      show();
      return;
    }
    if (props.tool === 'extrude') {
      shift = event.shiftKey;
      if (props.pickDepth && props.faceTarget) {
        depthTargetAt(event, props.faceTarget);
      } else if (extrudeSession) {
        updateExtrusion(event);
      } else {
        const face = editableFaceAt(event);
        highlightFace(face?.face.planar ? face.target : undefined);
        if (face?.face.planar)
          show({ point: face.target.point, key: 'face', label: 'Vedä pintaa · E' });
        else show();
      }
      return;
    }
    if ((props.tool === 'rectangle' || props.tool === 'circle') && shapeSession?.sketch) {
      const sketch = shapeSession.sketch,
        start = shapeSession.start;
      const raw = framePoint(event, sketch);
      if (!raw) return;
      const end = frameSnap(raw, sketch, props.tool === 'rectangle' ? start : undefined),
        relative = { ...sketch, origin: start },
        delta = toUV(end, relative);
      const width =
          props.tool === 'circle'
            ? 2 * (props.radialShape === 'ellipse' ? Math.abs(delta[0]) : Math.hypot(...delta))
            : Math.abs(delta[0]),
        depth = props.tool === 'circle' ? 2 * Math.abs(delta[1]) : Math.abs(delta[1]);
      props.onGesture({
        type: 'profile',
        frame: {
          ...sketch,
          origin:
            props.tool === 'rectangle'
              ? fromUV([Math.min(0, delta[0]), Math.min(0, delta[1])], relative)
              : start,
        },
        width,
        depth: props.tool === 'circle' ? Math.max(0.1, depth) : depth,
        start,
        end,
      });
      return;
    }
    if (
      ['rectangle', 'circle', 'pen'].includes(props.tool) &&
      !drag &&
      (!props.penPoints.length || props.tool !== 'pen')
    ) {
      highlightFace(sketchSurfaceAt(event), true);
    }
    if (props.tool === 'measure' && !measureSession && !props.pickReference) {
      const vertex = vertexAt(event),
        edge = vertex ? undefined : edgeAt(event);
      highlightEdge(edge?.edge);
      if (edge)
        show({ point: edge.point, key: 'edge', label: 'Reuna · vedä rinnakkainen apuviiva' });
      else if (vertex) show({ point: vertex.point, key: 'vertex', label: 'Verteksi' });
      else show();
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
    if (props.tool === 'move') {
      const start = drag.start;
      let raw: Vec3 | undefined;
      if (props.axis) raw = linePoint(event, start, axisVector(props.axis));
      else raw = planePoint(event, drag.plane, start);
      if (!raw) return;
      const target = !props.axis && !shift ? nearest(event) : undefined;
      const end = target ? target.point : snap(raw, drag.plane, start, start);
      if (target) show(target, drag.plane);
      props.onGesture({
        type: 'move',
        bodyId: drag.bodyId,
        origin: add(drag.origin, sub(end, start)),
      });
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
    }
  };
  const up = (event: PointerEvent) => {
    const props = current(),
      active = drag;
    if (active && !blocked && !props.busy) {
      const moved = Math.hypot(event.clientX - active.screenX, event.clientY - active.screenY) > 4;
      if (props.tool === 'erase' && !moved) {
        const target = boundaryAt(event);
        if (target) props.onRemoveBoundary(target);
      } else if (props.tool === 'rotate' && rotationDrag) {
        if (moved) {
          updateRotation(event);
          props.onAccept();
        }
        rotationDrag = undefined;
      } else if (props.tool === 'offset') {
        if (moved || active.second) {
          // Use the last pointermove value. A click must not overwrite a typed dimension.
          props.onAccept();
        }
      } else if (props.tool === 'extrude') {
        if (moved || active.second) {
          move(event);
          if (props.extrusionLocked || !shift || canvas.dataset.depthTarget) props.onAccept();
        }
      } else if ((props.tool === 'rectangle' || props.tool === 'circle') && shapeSession) {
        if (moved || active.second) {
          move(event);
          props.onAccept();
        }
      } else if (props.tool === 'boolean' && !moved) {
        const hit = faceAt(event);
        if (hit) props.onSelect(hit.target.bodyId);
      } else if (props.tool === 'select' && !moved) {
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
      } else if (moved && ['rectangle', 'circle', 'move'].includes(props.tool)) {
        move(event);
        props.onAccept();
      }
    }
    pointers.delete(event.pointerId);
    drag = undefined;
    rotationDrag = undefined;
    if (!pointers.size) blocked = false;
  };
  const cancel = (event: PointerEvent) => {
    pointers.delete(event.pointerId);
    drag = undefined;
    extrudeSession = undefined;
    shapeSession = undefined;
    canvas.dataset.depthTarget = '';
    canvas.dataset.depthKind = '';
    rotationDrag = undefined;
    if (!pointers.size) blocked = false;
  };
  const keydown = (event: KeyboardEvent) => {
    if ((event.target as HTMLElement).closest('input,textarea,select,[contenteditable]')) return;
    if ((event.key === 'Control' || event.key === 'Alt') && current().tool === 'move') {
      event.preventDefault();
      current().onCopyMove(true);
      return;
    }
    // Axis shortcuts must not intercept application commands such as Ctrl/Cmd+Z.
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const props = current(),
      key = event.key.toLowerCase();
    if (['x', 'y', 'z'].includes(key) && props.tool === 'rotate') {
      event.preventDefault();
      props.onRotationAxis(axisVector(key as Axis));
      return;
    }
    if (['x', 'y', 'z'].includes(key) && ['pen', 'measure'].includes(props.tool)) {
      event.preventDefault();
      props.onAxis(props.axis === key ? undefined : (key as Axis));
      return;
    }
    if (event.key === 'Shift' && !event.repeat) {
      shift = true;
      if (props.tool === 'extrude') {
        if (!props.busy && !props.pickDepth && lastEvent) updateExtrusion(lastEvent);
        return;
      }
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
    if ((event.key === 'Control' || event.key === 'Alt') && current().tool === 'move')
      current().onCopyMove(event.ctrlKey || event.altKey);
    if (event.key === 'Shift') {
      shift = false;
      if (current().tool === 'extrude') {
        if (extrudeSession && lastEvent) {
          // Continue freely from the chosen depth, without undoing the snap
          // or jumping to the original cursor-to-distance mapping.
          extrudeSession.x = lastEvent.clientX;
          extrudeSession.y = lastEvent.clientY;
          extrudeSession.baseDistance = extrudeSession.distance;
        }
        if (!current().pickDepth) {
          clearDepthTarget();
          highlightFace(extrudeSession?.target ?? current().faceTarget);
          show();
        }
        return;
      }
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
    current().onCopyMove(false);
    offsetSession = undefined;
    extrudeSession = undefined;
    shapeSession = undefined;
    canvas.dataset.depthTarget = '';
    canvas.dataset.depthKind = '';
    if (heldReference) current().onReference(undefined);
    heldReference = undefined;
    shiftDirection = undefined;
    current().onConstraint(undefined);
    drag = undefined;
    rotationDrag = undefined;
    pointers.clear();
    blocked = false;
    show();
  };
  const leave = () => {
    if (!drag && !measureSession) {
      highlightBoundary();
      highlightEdge();
      highlightFace();
      show();
    }
  };
  const doubleClick = (event: MouseEvent) => {
    if (current().tool !== 'select' || current().busy || event.button !== 0) return;
    const target = editableFaceAt(event as PointerEvent);
    if (target) current().onEditBody(target.target.bodyId);
  };
  canvas.addEventListener('dblclick', doubleClick);
  canvas.addEventListener('pointerleave', leave);
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
      canvas.removeEventListener('dblclick', doubleClick);
      canvas.removeEventListener('pointerleave', leave);
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
