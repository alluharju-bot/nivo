import { bodyDisplayMode } from '../model/display';
import { dimensionAt, dimensionBoxSelection } from './dimensionPicking';
import type { GuideEndpoint } from '../model/guideEditing';
import { pointMarker } from './pointMarker';
import { onCurve } from '../model/curveSnap';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { rotationAngle } from '../model/rotationSnap';
import { sectionDistance } from '../model/sections';
import { BodySpatialIndex, intersectModel } from './spatialIndex';
import { contextualFace, moveAxisFromScreen } from './picking';
import {
  projectSelectionBounds,
  projectGuideSelectionBounds,
  insideSelectionRect,
  type ScreenBounds,
} from './boxSelection';
import { isPointDimension, uid, axisIndex, type PointDimension } from '../model/project';
import { anchorBodyId, pointDimensionGeometry } from '../model/dimensions';
import { offsetDirection } from '../model/faceBoundary';
import { dragSize, type SizeDrag } from '../model/sizeDrag';
import { faceDepthSnap, pointDepthSnap } from '../model/extrusion';
import { formatLength } from '../model/units';
import * as THREE from 'three';
import type { BodyMesh, FaceTarget, BoundaryTarget } from '../cad/protocol';
import {
  featureIsSolid,
  type Anchor,
  type Axis,
  type Vec3,
  type WorkPlane,
} from '../model/project';
import {
  planeAxes,
  resolveAnchor,
  referenceAnchor,
  guidePoints,
  guideVector,
  guidePlaneNormal,
  angleBetween,
  guideDirection,
  lineIntersection,
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
  snapPriority,
  snapScore,
  onSnapLine,
  closestOnSnapLine,
  guideEdgeIntersection,
  guideEdgeProjection,
  gridLength,
  snapPoint,
  snapOnSketchPlane,
  type ReferencePoint,
  type Snap,
} from '../model/snap';
import { sketchFrame, toUV, fromUV, type SketchFrame } from '../model/sketch';
import { rotationHandles } from '../model/rotationHandles';
import { cross } from '../model/transforms';
import { penAxisHint } from '../model/penInput';
import { surfaceIntersections } from './surfaceIntersections';
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
  const selectableBody = (id: string) => bodyDisplayMode(current().modelDisplay, id) !== 'ghost';
  const occludingBody = (id: string) =>
    !['ghost', 'wireframe'].includes(bodyDisplayMode(current().modelDisplay, id));
  const raycaster = new THREE.Raycaster(),
    pointer = new THREE.Vector2();
  const hint = document.createElement('div');
  hint.className = 'snap-hint';
  hint.dataset.testid = 'snap-hint';
  hint.hidden = true;
  container.append(hint);
  const selectionBox = document.createElement('div');
  selectionBox.className = 'selection-box';
  selectionBox.dataset.testid = 'selection-box';
  selectionBox.hidden = true;
  const selectionCount = document.createElement('span');
  selectionBox.append(selectionCount);
  container.append(selectionBox);
  let selectionBounds: ScreenBounds[] | undefined;
  let guideSelectionBounds: { window: ScreenBounds[]; crossing: ScreenBounds[] } | undefined;
  const clearSelectionBox = () => {
    selectionBox.hidden = true;
    selectionBounds = undefined;
    guideSelectionBounds = undefined;
  };
  const boxSelection = (event: PointerEvent) => {
    if (!drag) return { ids: [], guideIds: [], dimensionIds: [] };
    const rect = canvas.getBoundingClientRect(),
      x1 = drag.screenX - rect.left,
      y1 = drag.screenY - rect.top,
      x2 = Math.max(0, Math.min(rect.width, event.clientX - rect.left)),
      y2 = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
    if (!selectionBounds) {
      const props = current();
      selectionBounds = projectSelectionBounds(
        props.meshes.filter(
          (m) =>
            selectableBody(m.id) &&
            (!props.editingBodyId || m.id === props.editingBodyId) &&
            (!props.scopeIds || props.scopeIds.includes(m.id)),
        ),
        camera(),
        rect.width,
        rect.height,
        props.section ? (point) => sectionDistance(props.section!, point) : undefined,
      );
    }
    if (!guideSelectionBounds) {
      const props = current();
      const eligible = props.tool === 'boolean' ? [] : props.guides;
      const section = props.section
        ? (point: Vec3) => sectionDistance(props.section!, point)
        : undefined;
      guideSelectionBounds = {
        window: projectGuideSelectionBounds(
          props.bodies,
          eligible,
          camera(),
          rect.width,
          rect.height,
          false,
          section,
        ),
        crossing: projectGuideSelectionBounds(
          props.bodies,
          eligible,
          camera(),
          rect.width,
          rect.height,
          true,
          section,
        ),
      };
    }
    const crossing = x2 < x1;
    const ids = insideSelectionRect(selectionBounds, x1, y1, x2, y2, crossing);
    const guideIds = insideSelectionRect(
      guideSelectionBounds[crossing ? 'crossing' : 'window'],
      x1,
      y1,
      x2,
      y2,
      crossing,
    );
    selectionBox.classList.toggle('crossing', crossing);
    selectionBox.dataset.mode = crossing ? 'crossing' : 'window';
    selectionBox.hidden = false;
    Object.assign(selectionBox.style, {
      left: `${Math.min(x1, x2)}px`,
      top: `${Math.min(y1, y2)}px`,
      width: `${Math.abs(x2 - x1)}px`,
      height: `${Math.abs(y2 - y1)}px`,
    });
    const dimensionIds =
      current().tool === 'boolean'
        ? []
        : dimensionBoxSelection(
            container,
            drag.screenX,
            drag.screenY,
            event.clientX,
            event.clientY,
            crossing,
          );
    selectionCount.textContent = `${[ids.length ? `${ids.length} osaa` : '', guideIds.length ? `${guideIds.length} viivaa` : '', dimensionIds.length ? `${dimensionIds.length} dimensiota` : ''].filter(Boolean).join(' + ') || '0 kohdetta'} · ${crossing ? 'alueeseen osuvat' : 'kokonaan sisällä'}${drag.extendSelection || event.shiftKey ? ' · lisää valintaan' : ''}`;
    return { ids, guideIds, dimensionIds };
  };
  const overlay = new THREE.Group();
  const moveAxisLine = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 1, 8),
    new THREE.MeshBasicMaterial({
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: 0.64,
    }),
  );
  moveAxisLine.visible = false;
  moveAxisLine.renderOrder = 95;
  overlay.add(moveAxisLine);
  const moveAxisLabel = document.createElement('div');
  moveAxisLabel.className = 'move-axis-label';
  moveAxisLabel.hidden = true;
  container.appendChild(moveAxisLabel);
  const showMoveAxis = (axis?: Axis, start?: Vec3, end?: Vec3) => {
    moveAxisLine.visible = !!axis && !!start && !!end;
    moveAxisLabel.hidden = !moveAxisLine.visible;
    canvas.dataset.visibleMoveAxis = axis ?? '';
    if (!axis || !start || !end) return;
    const color = { x: '#b7534e', y: '#388960', z: '#427dba' }[axis],
      direction = axisVector(axis),
      pixel = worldPerPixel(start);
    moveAxisLine.position.set(...start);
    moveAxisLine.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(...direction),
    );
    moveAxisLine.scale.set(
      pixel * 1.15,
      pixel * Math.max(canvas.clientWidth, canvas.clientHeight) * 5,
      pixel * 1.15,
    );
    (moveAxisLine.material as THREE.MeshBasicMaterial).color.set(color);
    const distance = dot(sub(end, start), direction);
    moveAxisLabel.style.color = color;
    moveAxisLabel.textContent = `${axis.toUpperCase()} lukittu · ${distance > 0 ? '+' : ''}${formatLength(distance)} mm`;
  };
  overlay.name = 'interaction-overlays';
  scene.add(overlay);
  const makeMarker = (color: string) => {
    const marker = pointMarker([0, 0, 0], color, 14);
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
    new THREE.LineDashedMaterial({
      color: '#4d9c88',
      dashSize: 12,
      gapSize: 8,
      depthTest: false,
    }),
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
  const makeDetailLine = (color: string, width: number) => {
    const line = new LineSegments2(
      new LineSegmentsGeometry(),
      new LineMaterial({
        color,
        linewidth: width,
        toneMapped: false,
        depthTest: false,
        depthWrite: false,
        resolution: new THREE.Vector2(container.clientWidth, container.clientHeight),
      }),
    );
    line.visible = false;
    line.renderOrder = 100;
    overlay.add(line);
    return line;
  };
  const detailSelected = makeDetailLine('#b87424', 3.5);
  const detailHover = makeDetailLine('#f0a12c', 4.5);
  detailHover.renderOrder = 101;
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
        end?: Vec3;
        edgeLength?: number;
        editing?: boolean;
        frame?: SketchFrame;
        rotationFrame?: SketchFrame;
        adjacent?: BodyMesh['faces'];
        surfaceChosen?: boolean;
      }
    | undefined;
  let selectionPointerInside = false;
  let lastEvent: PointerEvent | undefined,
    shiftDirection: Vec3 | undefined,
    lastPenPoint: Vec3 | undefined;
  let penShiftPending = false;
  let measureShiftPending = false;
  let previousAxis = current().axis,
    previousPenCount = current().penPoints.length;
  let previousConstraintReset = current().constraintReset;
  let drawingPlane: SketchFrame | undefined;
  let drawingTarget: FaceTarget | undefined;
  let penPressPoint: Vec3 | undefined;
  type Drag = {
    start: Vec3;
    origin: Vec3;
    screenX: number;
    screenY: number;
    height: number;
    plane: WorkPlane;
    second: boolean;
    moved?: boolean;
    face?: FaceTarget;
    sketch?: SketchFrame;
    bodyId?: string;
    extendSelection?: boolean;
    selection?: boolean;
    selectionBodyId?: string;
    movingIds?: string[];
    moveAxis?: Axis;
  };
  let detailSession:
    | (SizeDrag & {
        edge: { bodyId: string; index: number; point: Vec3 };
        pointerId: number;
        started: boolean;
      })
    | undefined;
  const cancelDetailDrag = () => {
    if (detailSession?.started) current().onDetailDragCancel();
    detailSession = undefined;
    canvas.dataset.detailDragging = '';
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
      current().gridSnap ? current().gridStep : 0.1,
      gridLength(
        initial + dot(sub(point, target.point), direction),
        current().gridStep,
        current().gridSnap,
      ),
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
  let emptySelectionClicks = 0;
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
    const d = camera().getWorldDirection(new THREE.Vector3());
    return Math.abs(d.z) > 0.5 ? 'XY' : Math.abs(d.y) > Math.abs(d.x) ? 'XZ' : 'YZ';
  };
  const emptyDrawingPlane = (): WorkPlane => {
    const direction = camera().getWorldDirection(new THREE.Vector3());
    // A tilted perspective view does not imply a vertical plane through the
    // origin. Start in the visible ground grid; exact side views use their plane.
    return Math.abs(direction.z) < 1e-6 ? workPlane() : 'XY';
  };
  const planePoint = (event: PointerEvent, plane: WorkPlane, origin: Vec3): Vec3 | undefined => {
    setRay(event);
    const normal = new THREE.Vector3();
    normal.setComponent(planeAxes[plane][2], 1);
    if (Math.abs(raycaster.ray.direction.dot(normal)) < 1e-8) return;
    const result = raycaster.ray.intersectPlane(
      new THREE.Plane(normal, -origin[planeAxes[plane][2]]),
      new THREE.Vector3(),
    );
    return result?.toArray() as Vec3 | undefined;
  };
  const framePoint = (event: PointerEvent, frame: SketchFrame): Vec3 | undefined => {
    setRay(event);
    if (Math.abs(dot(raycaster.ray.direction.toArray() as Vec3, frame.normal)) < 1e-8) return;
    return raycaster.ray
      .intersectPlane(
        new THREE.Plane(new THREE.Vector3(...frame.normal), -dot(frame.normal, frame.origin)),
        new THREE.Vector3(),
      )
      ?.toArray() as Vec3 | undefined;
  };
  const frameSnap = (point: Vec3, frame: SketchFrame, start?: Vec3, event?: PointerEvent) => {
    const p = current(),
      extra = p.penPoints.slice(0, -1).map((point, i) => ({
        point,
        key: `pen:${i}`,
        label: i === 0 ? 'Aloituspiste' : 'Kynän piste',
      }));
    if (event) {
      const accepts = (point: Vec3) =>
        Math.abs(dot(sub(point, frame.origin), frame.normal)) < 1e-5 &&
        (p.tool !== 'pen' || !start || Math.hypot(...sub(point, start)) > 1e-6);
      const picked = referenceAt(event, accepts, true);
      if (picked) {
        show(picked);
        return picked.point;
      }
    }
    if (p.tool === 'pen' && start) {
      const axis = penAxisHint(start, point, frame.normal);
      if (axis) {
        const index = axisIndex[axis.axis];
        axis.point[index] =
          start[index] + gridLength(axis.point[index] - start[index], p.gridStep, p.gridSnap);
        show({
          point: axis.point,
          key: 'axis-hint',
          label: `${axis.axis.toUpperCase()} · akselin suunta`,
          line: [start, axis.point],
        });
        return axis.point;
      }
    }
    const snapped = snapOnSketchPlane(
      point,
      frame,
      p.bodies,
      p.meshes,
      event ? [] : p.guides,
      worldPerPixel(point) * 12,
      p.gridSnap,
      reference(),
      start,
      event ? [] : extra,
      p.gridStep,
      p.tool === 'rectangle' ? 'coordinates' : 'length',
      event ? [] : undefined,
      p.tool === 'pen' ? 5 : Infinity,
    );
    show(snapped);
    return snapped.point;
  };
  // Occlusion tolerance is physical: zooming out must not expose rear corners of a thin board.
  const occlusionTolerance = (point: Vec3) =>
    Math.max(0.01, ...point.map((n) => Math.abs(n) * 1e-7));
  const visiblePoint = (point: Vec3, ignoreBody?: string) => {
    if (bodies.userData.acceptPoint && !bodies.userData.acceptPoint(new THREE.Vector3(...point)))
      return false;
    const p = new THREE.Vector3(...point),
      q = p.clone().project(camera()),
      ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(q.x, q.y), camera());
    const hit = intersectModel(ray, bodies, 'occlusion').find(
      (h) => h.object instanceof THREE.Mesh && h.object.userData.id !== ignoreBody,
    );
    const distance = ray.ray.origin.distanceTo(p),
      tolerance = occlusionTolerance(point);
    if (hit && hit.distance < distance - tolerance) return false;
    // A triangle raycast may miss its exact silhouette by floating-point error.
    // CAD boundary segments still occlude a rear anchor at the same pixel.
    const onRay = new THREE.Vector3();
    refreshLookup();
    const index = bodies.userData.spatialIndex as BodySpatialIndex | undefined;
    const rayMeshes = index
      ? index
          .ray(ray.ray, tolerance)
          .map((id) => meshById.get(id)!)
          .filter(Boolean)
      : current().meshes;
    for (const mesh of rayMeshes) {
      if (mesh.id === ignoreBody || !occludingBody(mesh.id)) continue;
      const body = bodyById.get(mesh.id);
      if (body?.purpose === 'construction' && !featureIsSolid(body.feature)) continue;
      for (const edge of mesh.edgesCAD) {
        const separation = ray.ray.distanceSqToSegment(
          new THREE.Vector3(...edge.start),
          new THREE.Vector3(...edge.end),
          onRay,
        );
        if (
          (!bodies.userData.acceptPoint || bodies.userData.acceptPoint(onRay)) &&
          separation <= tolerance * tolerance &&
          ray.ray.origin.distanceTo(onRay) < distance - tolerance
        )
          return false;
      }
    }
    return true;
  };
  let indexedMeshes: ReturnType<typeof current>['meshes'] | undefined;
  let meshById = new Map<string, ReturnType<typeof current>['meshes'][number]>();
  let indexedBodies: ReturnType<typeof current>['bodies'];
  let bodyById = new Map<string, ReturnType<typeof current>['bodies'][number]>();
  let surfacePriorityById = new Map<string, number>();
  const refreshLookup = () => {
    if (indexedMeshes !== current().meshes) {
      indexedMeshes = current().meshes;
      meshById = new Map(indexedMeshes.map((mesh) => [mesh.id, mesh]));
    }
    if (indexedBodies !== current().bodies) {
      indexedBodies = current().bodies;
      bodyById = new Map(indexedBodies.map((body) => [body.id, body]));
      surfacePriorityById = new Map(
        indexedBodies.map((body, i) => [body.id, featureIsSolid(body.feature) ? 0 : i + 1]),
      );
    }
  };
  const snapRadius = (event: PointerEvent, kind: 'point' | 'mid' | 'line') =>
    (event.pointerType === 'touch'
      ? { point: 28, mid: 22, line: 18 }
      : { point: 20, mid: 16, line: 12 })[kind];
  const nearby = (event: PointerEvent) => {
    refreshLookup();
    const rect = canvas.getBoundingClientRect();
    const index = bodies.userData.spatialIndex as BodySpatialIndex | undefined;
    const ids = index?.screen(
      camera(),
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      1 - ((event.clientY - rect.top) / rect.height) * 2,
      (2 * snapRadius(event, 'point')) / rect.width,
      (2 * snapRadius(event, 'point')) / rect.height,
    );
    return ids
      ? ids.map((id) => meshById.get(id)).filter((m): m is NonNullable<typeof m> => !!m)
      : current().meshes;
  };
  type ReferenceEdge = {
    mesh: BodyMesh;
    edge: BodyMesh['edgesCAD'][number];
    synthetic?: boolean;
    curve?: boolean;
    key: string;
  };
  const referenceEdgeCache = new WeakMap<BodyMesh, ReferenceEdge[]>();
  // All tools see the same CAD edges and trimmed surface-surface intersections.
  // Scope limits edits, never the availability of visible reference geometry.
  const referenceEdges = (event: PointerEvent, excluded: string[] = []): ReferenceEdge[] => {
    const meshes = nearby(event).filter((m) => !excluded.includes(m.id));
    const edges: ReferenceEdge[] = meshes.flatMap((mesh) => {
      let cached = referenceEdgeCache.get(mesh);
      if (!cached) {
        cached = [
          ...mesh.edgesCAD.map((edge, i) => ({ mesh, edge, key: `${mesh.id}:edge:${i}` })),
          ...(mesh.curveEdges ?? []).map((edge, i) => ({
            mesh,
            edge,
            curve: true,
            key: `${mesh.id}:curve-edge:${i}`,
          })),
        ];
        referenceEdgeCache.set(mesh, cached);
      }
      return cached;
    });
    const props = current(),
      towardCamera = camera().getWorldDirection(new THREE.Vector3()).negate().toArray() as Vec3;
    for (let i = 0; i < meshes.length; i++)
      for (let j = i + 1; j < meshes.length; j++) {
        const a = meshes[i],
          b = meshes[j];
        surfaceIntersections(a, b).forEach((line, index) => {
          const preferred =
            props.editingBodyId ??
            (props.tool === 'move'
              ? props.selectedIds.find((id) => id === a.id || id === b.id)
              : undefined);
          const owner =
            preferred === a.id
              ? a
              : preferred === b.id
                ? b
                : dot(line.faces[0].normal, towardCamera) >= dot(line.faces[1].normal, towardCamera)
                  ? a
                  : b;
          const body = bodyById.get(owner.id);
          if (!body) return;
          edges.push({
            mesh: owner,
            synthetic: true,
            key: `${owner.id}:surface-intersection:${owner === a ? b.id : a.id}:${index}`,
            edge: {
              start: line.start,
              end: line.end,
              from: referenceAnchor(body, line.start),
              to: referenceAnchor(body, line.end),
            },
          });
        });
      }
    return edges;
  };
  const intersectionPoints = (edges: ReferenceEdge[]): ReferencePoint[] =>
    edges
      .filter((e) => e.synthetic)
      .flatMap(({ edge, key }) => [
        { point: edge.start, key: `${key}:start`, label: 'Pintojen risteyspiste' },
        { point: edge.end, key: `${key}:end`, label: 'Pintojen risteyspiste' },
        {
          point: scale(add(edge.start, edge.end), 0.5),
          key: `${key}:mid:`,
          label: 'Pintojen risteys · keskipiste',
        },
      ]);
  const nearest = (
    event: PointerEvent,
    verticesOnly = false,
    accepts: (point: Vec3, key: string) => boolean = () => true,
    surfaceOnly = false,
  ) => {
    const props = current(),
      rect = canvas.getBoundingClientRect(),
      x = event.clientX - rect.left,
      y = event.clientY - rect.top;
    const nearMeshes = nearby(event);
    const nearBodies = nearMeshes.map((mesh) => bodyById.get(mesh.id)!).filter(Boolean);
    const points = verticesOnly
      ? nearMeshes.flatMap((m) =>
          m.verticesCAD.map((v) => ({
            point: v.point,
            key: `${m.id}:${v.anchor.key}`,
            label: 'Verteksi',
            anchor: v.anchor,
          })),
        )
      : [
          ...modelSnapPoints(
            nearBodies.filter(
              (b) => props.tool !== 'move' || props.copyMove || !props.selectedIds.includes(b.id),
            ),
            props.meshes,
          ),
          ...intersectionPoints(referenceEdges(event)),
          ...(props.tool === 'pen'
            ? props.penPoints.slice(0, -1).map((point, i) => ({
                point,
                key: `pen:${i}`,
                label: i === 0 ? 'Aloituspiste' : 'Kynän piste',
              }))
            : []),
        ];
    return points
      .filter((p) => accepts(p.point, p.key) && (!surfaceOnly || !p.key.endsWith(':center')))
      .map((p) => ({
        ...p,
        distance: Math.hypot(screen(p.point).x - x, screen(p.point).y - y),
        depth: screen(p.point).z,
        priority: snapPriority(p),
      }))
      .filter(
        (p) =>
          p.distance < snapRadius(event, p.priority <= 0 ? 'point' : 'mid') &&
          p.depth >= -1 &&
          p.depth <= 1,
      )
      .sort(
        (a, b) =>
          snapScore(a.distance, a.priority) - snapScore(b.distance, b.priority) ||
          (Math.abs(a.distance - b.distance) < 1 ? a.depth - b.depth : a.distance - b.distance),
      )
      .find((p) =>
        visiblePoint(
          p.point,
          p.key.endsWith(':center')
            ? props.bodies.find((b) => p.key.startsWith(`${b.id}:`))?.id
            : undefined,
        ),
      );
  };
  const vertexAt = (event: PointerEvent) => {
    const p = nearest(event, true);
    if (!p) return;
    for (const mesh of nearby(event)) {
      const vertex = mesh.verticesCAD.find((v) => `${mesh.id}:${v.anchor.key}` === p.key);
      if (vertex) return vertex;
    }
  };
  const wireAt = (event: PointerEvent) => {
    setRay(event);
    raycaster.params.Line.threshold = worldPerPixel(current().bodies[0]?.origin ?? [0, 0, 0]) * 6;
    const hits = intersectModel(raycaster, bodies, 'selection'),
      wire = hits.find((h) => h.object.userData.wireOnly),
      face = hits.find((h) => h.object instanceof THREE.Mesh);
    return wire &&
      (!face || wire.distance <= face.distance + worldPerPixel(wire.point.toArray() as Vec3) * 2)
      ? wire
      : undefined;
  };
  const faceAt = (event: PointerEvent, reference = false) => {
    setRay(event);
    raycaster.params.Line.threshold = worldPerPixel(current().bodies[0]?.origin ?? [0, 0, 0]) * 6;
    const hits = intersectModel(raycaster, bodies, reference ? 'reference' : 'selection');
    let hit = hits.find((h) => h.object instanceof THREE.Mesh);
    // A flat construction shape is selectable by its outline; its interior
    // remains transparent to face picking, including E/O and sketch planes.
    if (['select', 'move'].includes(current().tool)) {
      const outline = hits.find((h) => h.object.userData.constructionLine);
      if (
        outline &&
        (!hit || outline.distance <= hit.distance + worldPerPixel(outline.point.toArray() as Vec3))
      ) {
        const surface = bodies.children.find(
          (object) =>
            object instanceof THREE.Mesh && object.userData.id === outline.object.userData.id,
        );
        if (surface) hit = { ...outline, object: surface, faceIndex: 0 };
      }
    }
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
  const editBlocked = (event: PointerEvent, bodyId: string) => {
    const props = current();
    if (
      (!props.editingBodyId || props.editingBodyId === bodyId) &&
      (!props.scopeIds || props.scopeIds.includes(bodyId))
    )
      return false;
    const rect = container.getBoundingClientRect();
    props.onEditBlocked({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    });
    return true;
  };
  const editableFaceAt = (event: PointerEvent, explain = false) => {
    const picked = faceAt(event);
    if (picked && explain && editBlocked(event, picked.target.bodyId)) return;
    return picked &&
      !current().bodies.find((b) => b.id === picked.target.bodyId)?.locked &&
      (!current().editingBodyId || current().editingBodyId === picked.target.bodyId)
      ? picked
      : undefined;
  };
  const sketchSurfaceAt = (event: PointerEvent): FaceTarget | undefined => {
    const hit = faceAt(event, true),
      point = nearest(event, false, () => true, true);
    const edge = point ? undefined : edgeAt(event);
    const anchor = point?.point ?? edge?.point;
    const bodyId = point
      ? current().bodies.find((b) => point.key.startsWith(`${b.id}:`))?.id
      : edge?.mesh.id;
    if (anchor && bodyId) {
      setRay(event);
      const mesh = current().meshes.find((m) => m.id === bodyId)!;
      const face = contextualFace(
        mesh,
        anchor,
        raycaster.ray.direction.clone().negate().toArray() as Vec3,
      );
      if (face) return { bodyId, face: face.ref, normal: face.normal, point: anchor };
    }
    return hit?.face.planar ? hit.target : undefined;
  };
  const referenceImageAt = (event: PointerEvent) => {
    setRay(event);
    const hits = (current().referenceImages ?? [])
      .filter((image) => !image.hidden)
      .flatMap((image) => {
        const point = raycaster.ray.intersectPlane(
          new THREE.Plane().setFromNormalAndCoplanarPoint(
            new THREE.Vector3(...image.frame.normal),
            new THREE.Vector3(...image.frame.origin),
          ),
          new THREE.Vector3(),
        );
        if (!point) return [];
        const uv = toUV(point.toArray() as Vec3, image.frame);
        if (uv[0] < 0 || uv[0] > image.width || uv[1] < 0 || uv[1] > image.height) return [];
        return [
          {
            point: point.toArray() as Vec3,
            normal: image.frame.normal,
            distance: point.distanceTo(raycaster.ray.origin),
          },
        ];
      });
    return hits.sort((a, b) => a.distance - b.distance)[0];
  };
  const sketchStartAt = (event: PointerEvent) => {
    const props = current(),
      target = sketchSurfaceAt(event);
    const picked = pickReference(event, () => true, true);
    const guide = picked.guide;
    const exact =
      picked.point ??
      guide ??
      (picked.edge && {
        point: picked.edge.point,
        key: picked.edge.key,
        label: picked.edge.label,
        line: [picked.edge.edge.start, picked.edge.edge.end] as [Vec3, Vec3],
      });
    const guideOwnsPlane =
      guide && (!target || Math.abs(dot(sub(guide.point, target.point), target.normal)) > 1e-5);
    const image = target || guide ? undefined : referenceImageAt(event);
    const explicit = ['rectangle', 'circle'].includes(props.tool) ? props.axis : undefined;
    const normal = explicit
      ? axisVector(explicit)
      : ((guideOwnsPlane ? guidePlaneNormal(guide.guide) : target?.normal) ??
        image?.normal ??
        axisVector((['x', 'y', 'z'] as const)[planeAxes[emptyDrawingPlane()][2]]));
    const anchor = exact?.point ??
      target?.point ??
      nearest(event, false, () => true, true)?.point ??
      image?.point ?? [0, 0, 0];
    const frame = sketchFrame(scale(normal, dot(normal, anchor)), normal);
    if (!exact && !target && !guide && !image) {
      setRay(event);
      if (Math.abs(dot(raycaster.ray.direction.toArray() as Vec3, normal)) < 0.02) {
        show();
        return;
      }
    }
    const raw = exact?.point ?? framePoint(event, frame);
    if (!raw) return;
    const point = exact?.point ?? frameSnap(raw, frame, undefined, event);
    if (exact) show(exact);
    const matchesSurface =
      target &&
      Math.abs(Math.abs(dot(normal, target.normal)) - 1) < 1e-5 &&
      Math.abs(dot(sub(anchor, target.point), normal)) < 1e-5;
    canvas.dataset.sketchPlane = JSON.stringify(frame.normal);
    return {
      point,
      frame,
      target: matchesSurface && selectableBody(target.bodyId) ? target : undefined,
    };
  };
  const hoverFace = new THREE.Mesh(
    new THREE.BufferGeometry(),
    new THREE.MeshBasicMaterial({
      color: '#2795cc',
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );
  hoverFace.visible = false;
  hoverFace.renderOrder = 4;
  overlay.add(hoverFace);
  let hoverKey = '';
  const highlightFace = (target?: FaceTarget, reference = false) => {
    if (
      !reference &&
      (current().bodies.find((b) => b.id === target?.bodyId)?.locked ||
        (current().editingBodyId && target?.bodyId !== current().editingBodyId))
    )
      target = undefined;
    current().onFaceHover(reference ? undefined : target);
    const mesh = target && current().meshes.find((m) => m.id === target.bodyId);
    const face = mesh && mesh.faces.find((f) => f.ref === target!.face);
    const key = face ? `${target!.bodyId}:${face.ref}` : '';
    // One overlay is enough; moving across the same face does not allocate geometry.
    if (key !== hoverKey || (mesh && hoverFace.userData.source !== mesh)) {
      (hoverFace.material as THREE.MeshBasicMaterial).color.set('#2795cc');
      hoverKey = key;
      hoverFace.userData.source = mesh;
      hoverFace.visible = !!face;
      hoverFace.geometry.dispose();
      hoverFace.geometry = new THREE.BufferGeometry();
      if (face && mesh) {
        hoverFace.geometry.setAttribute(
          'position',
          new THREE.Float32BufferAttribute(mesh.vertices, 3),
        );
        hoverFace.geometry.setIndex(mesh.triangles.slice(face.start, face.start + face.count));
      }
      render();
    }
    canvas.dataset.hoverFace = target?.face ?? '';
  };
  const highlightBoundary = (target?: BoundaryTarget) => {
    (boundaryHighlight.material as THREE.LineBasicMaterial).color.set('#cc672b');
    highlightFace();
    boundaryHighlight.visible = !!target;
    boundaryHighlight.geometry.dispose();
    boundaryHighlight.geometry = new THREE.BufferGeometry();
    boundaryHighlight.geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(target?.lines ?? [], 3),
    );
    if (target) {
      const mesh = current().meshes.find((m) => m.id === target.bodyId);
      if (mesh) {
        hoverKey = `boundary:${target.bodyId}:${target.faces.join(',')}`;
        hoverFace.visible = true;
        (hoverFace.material as THREE.MeshBasicMaterial).color.set('#ce8d4a');
        hoverFace.geometry.dispose();
        hoverFace.geometry = new THREE.BufferGeometry();
        hoverFace.geometry.setAttribute(
          'position',
          new THREE.Float32BufferAttribute(mesh.vertices, 3),
        );
        hoverFace.geometry.setIndex(
          mesh.faces
            .filter((f) => target.faces.includes(f.ref))
            .flatMap((f) => mesh.triangles.slice(f.start, f.start + f.count)),
        );
      }
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
    for (const mesh of nearby(event)) {
      if (!selectableBody(mesh.id) || (props.editingBodyId && props.editingBodyId !== mesh.id))
        continue;
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
      if (bodies.userData.acceptPoint && !bodies.userData.acceptPoint(new THREE.Vector3(...point)))
        return false;
      const projected = point.clone().project(camera()),
        ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(projected.x, projected.y), camera());
      const hit = intersectModel(ray, bodies, 'occlusion').find(
        (h) => h.object instanceof THREE.Mesh,
      );
      return (
        !hit ||
        hit.distance >=
          ray.ray.origin.distanceTo(point) - worldPerPixel(point.toArray() as Vec3) * 0.5
      );
    })?.target;
  };
  const detailEdgeAt = (event: PointerEvent) => {
    const props = current(),
      rect = container.getBoundingClientRect();
    const x = event.clientX - rect.left,
      y = event.clientY - rect.top;
    const candidates: {
      bodyId: string;
      index: number;
      point: Vec3;
      distance: number;
      depth: number;
    }[] = [];
    for (const mesh of nearby(event)) {
      if (
        !selectableBody(mesh.id) ||
        (props.editingBodyId && props.editingBodyId !== mesh.id) ||
        props.bodies.find((b) => b.id === mesh.id)?.locked
      )
        continue;
      for (const edge of mesh.sourceDetailEdges ?? mesh.detailEdges ?? [])
        for (let i = 0; i < edge.lines.length; i += 6) {
          const a = edge.lines.slice(i, i + 3) as Vec3,
            b = edge.lines.slice(i + 3, i + 6) as Vec3;
          const p = screen(a),
            q = screen(b),
            dx = q.x - p.x,
            dy = q.y - p.y;
          const t = Math.max(
            0,
            Math.min(1, ((x - p.x) * dx + (y - p.y) * dy) / (dx * dx + dy * dy || 1)),
          );
          const distance = Math.hypot(x - p.x - t * dx, y - p.y - t * dy),
            depth = p.z + t * (q.z - p.z);
          if (distance < snapRadius(event, 'line') && depth >= -1 && depth <= 1)
            candidates.push({
              bodyId: mesh.id,
              index: edge.index,
              point: add(a, scale(sub(b, a), t)),
              distance,
              depth,
            });
        }
    }
    candidates.sort((a, b) =>
      Math.abs(a.distance - b.distance) < 0.25 ? a.depth - b.depth : a.distance - b.distance,
    );
    return candidates.find(({ point }) => {
      const p = new THREE.Vector3(...point),
        projected = p.clone().project(camera());
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(projected.x, projected.y), camera());
      const hit = intersectModel(ray, bodies, 'occlusion').find(
        (h) => h.object instanceof THREE.Mesh,
      );
      return !hit || hit.distance >= ray.ray.origin.distanceTo(p) - worldPerPixel(point) * 0.5;
    });
  };
  const highlightDetail = (hover?: { bodyId: string; index: number }) => {
    const selected = current().detailTarget;
    for (const [line, matches] of [
      [
        detailSelected,
        (id: string, index: number) => id === selected?.bodyId && selected.indices.includes(index),
      ],
      [detailHover, (id: string, index: number) => id === hover?.bodyId && hover.index === index],
    ] as const) {
      const positions = current().meshes.flatMap((m) =>
        (m.sourceDetailEdges ?? m.detailEdges ?? [])
          .filter((e) => matches(m.id, e.index))
          .flatMap((e) => e.lines),
      );
      line.geometry.dispose();
      line.geometry = new LineSegmentsGeometry();
      if (positions.length) line.geometry.setPositions(positions);
      line.visible = positions.length > 0;
    }
    canvas.dataset.detailHover = hover ? `${hover.bodyId}:${hover.index}` : '';
    render();
  };
  const showDetailSize = (size = current().detailSize) => {
    if (!detailSession?.started) return;
    const label = current().detailOperation === 'fillet' ? 'Säde' : 'Viiste';
    show({
      point: detailSession.edge.point,
      key: 'edge-detail',
      label: `${label} ${Number.isFinite(size) ? formatLength(size) + ' mm' : '—'}${current().detailSizeLocked ? ' · lukittu' : ''}`,
    });
    highlightDetail(detailSession.edge);
  };
  const updateDetail = (event: PointerEvent) => {
    const active = detailSession;
    if (!active || event.pointerId !== active.pointerId) return;
    const size = dragSize(active, event.clientX, event.clientY);
    if (size === undefined) return;
    const starting = !active.started;
    if (starting) {
      active.started = true;
      current().onDetailEdge(active.edge.bodyId, active.edge.index, true);
    }
    canvas.dataset.detailDragging = active.edge.bodyId;
    current().onGesture({ type: 'detail', size });
    showDetailSize(!starting && current().detailSizeLocked ? current().detailSize : size);
  };
  const edgeAt = (
    event: PointerEvent,
    accepts: (point: Vec3, bodyId: string) => boolean = () => true,
  ) => {
    setRay(event);
    const rect = canvas.getBoundingClientRect(),
      x = event.clientX - rect.left,
      y = event.clientY - rect.top;
    const candidates = referenceEdges(event)
      .map(({ mesh, edge, synthetic, curve, key }) => {
        const point = new THREE.Vector3();
        raycaster.ray.distanceSqToSegment(
          new THREE.Vector3(...edge.start),
          new THREE.Vector3(...edge.end),
          undefined,
          point,
        );
        if (edge.circle) point.set(...onCurve(point.toArray() as Vec3, edge));
        const projected = screen(point.toArray() as Vec3);
        return {
          edge,
          mesh,
          synthetic,
          curve,
          key,
          point: point.toArray() as Vec3,
          depth: projected.z,
          distance: Math.hypot(x - projected.x, y - projected.y),
        };
      })
      .filter((e) => e.distance < snapRadius(event, 'line') && e.depth >= -1 && e.depth <= 1)
      .sort((a, b) =>
        Math.abs(a.distance - b.distance) < 1 ? a.depth - b.depth : a.distance - b.distance,
      );
    const found = candidates.find(
      (candidate) => accepts(candidate.point, candidate.mesh.id) && visiblePoint(candidate.point),
    );
    if (!found) return;
    const p = found.point;
    const delta = sub(found.edge.end, found.edge.start),
      length = Math.hypot(...delta),
      t = Math.max(0, Math.min(1, dot(sub(p, found.edge.start), delta) / (length * length)));
    return {
      ...found,
      point: p,
      direction: unit(delta),
      length,
      label: found.synthetic ? 'Pintojen risteys' : found.curve ? 'Käyrä' : 'Reuna',
      anchor:
        found.synthetic || found.curve
          ? referenceAnchor(bodyById.get(found.mesh.id)!, p)
          : ({
              edge: { from: found.edge.from, to: found.edge.to, t },
            } as Anchor),
    };
  };
  const guideEndpointsAt = (event: PointerEvent): GuideEndpoint[] => {
    const props = current(),
      rect = container.getBoundingClientRect();
    const candidates = props.guides
      .filter((g) => g.mode === 'free')
      .flatMap((guide) => {
        const points = guidePoints(props.bodies, guide);
        return points
          ? ([0, 1] as const).flatMap((end) => {
              const point = points[end],
                p = screen(point);
              const distance = Math.hypot(
                p.x - (event.clientX - rect.left),
                p.y - (event.clientY - rect.top),
              );
              return p.z >= -1 &&
                p.z <= 1 &&
                distance <= snapRadius(event, 'point') &&
                (guide.xray || props.guideXray || visiblePoint(point))
                ? [{ guideId: guide.id, end, point, distance }]
                : [];
            })
          : [];
      })
      .sort((a, b) => a.distance - b.distance);
    const nearest = candidates[0];
    return nearest
      ? candidates
          .filter((c) => Math.hypot(...sub(c.point, nearest.point)) < 1e-6)
          .map(({ guideId, end }) => ({ guideId, end }))
      : [];
  };
  const guideAt = (
    event: PointerEvent,
    excludedBodies: string[] = [],
    accepts: (point: Vec3) => boolean = () => true,
  ) => {
    const props = current(),
      rect = container.getBoundingClientRect();
    const x = event.clientX - rect.left,
      y = event.clientY - rect.top;
    const distance = (point: Vec3) => {
      const p = screen(point);
      return p.z >= -1 && p.z <= 1 ? Math.hypot(p.x - x, p.y - y) : Infinity;
    };
    const visible = (point: Vec3, xray: boolean) => {
      if (xray || props.guideXray) return true;
      const p = new THREE.Vector3(...point),
        projected = p.clone().project(camera());
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(projected.x, projected.y), camera());
      const hit = intersectModel(ray, bodies, 'occlusion').find(
        (h) => h.object instanceof THREE.Mesh,
      );
      return !hit || hit.distance >= ray.ray.origin.distanceTo(p) - worldPerPixel(point) * 0.5;
    };
    type Candidate = {
      guide: (typeof props.guides)[number];
      point: Vec3;
      key: string;
      label: string;
      kind: 'start' | 'end' | 'mid' | 'line' | 'intersection';
      priority: number;
      intersection: boolean;
      anchor: Anchor;
      line?: [Vec3, Vec3];
    };
    const candidates: Candidate[] = [];
    const near = props.guides
      .filter(
        (g) =>
          g.id !== props.guidePreview?.id &&
          !excludedBodies.includes(anchorBodyId(g.anchor) ?? '') &&
          (!g.endAnchor || !excludedBodies.includes(anchorBodyId(g.endAnchor) ?? '')),
      )
      .flatMap((guide) => {
        const points = guidePoints(props.bodies, guide);
        if (!points || Math.hypot(...sub(points[1], points[0])) < 1e-8) return [];
        const source = { id: guide.id, points, mode: guide.mode };
        const point = closestOnSnapLine(
          linePoint(event, points[0], unit(sub(points[1], points[0]))),
          source,
        );
        if (distance(point) > snapRadius(event, 'point')) return [];
        const name = guide.mode === 'free' ? 'Mittaviiva' : 'Apuviiva';
        const append = (
          point: Vec3,
          kind: 'start' | 'end' | 'mid' | 'line',
          priority: number,
          label: string,
        ) => {
          if (
            accepts(point) &&
            distance(point) <=
              snapRadius(event, kind === 'line' ? 'line' : kind === 'mid' ? 'mid' : 'point') &&
            visible(point, !!guide.xray)
          )
            candidates.push({
              guide,
              point,
              kind,
              priority,
              key: `${guide.id}:${kind}`,
              label,
              intersection: false,
              anchor: { point },
              line: kind === 'line' ? points : undefined,
            });
        };
        append(points[0], 'start', -1, `${name} · alku`);
        append(points[1], 'end', -1, `${name} · pää`);
        append(scale(add(points[0], points[1]), 0.5), 'mid', 0.5, `${name} · keskipiste`);
        append(point, 'line', 1.5, name);
        return [{ guide, points, source }];
      });
    for (let i = 0; i < near.length; i++)
      for (let j = i + 1; j < near.length; j++) {
        const point = lineIntersection(near[i].points, near[j].points);
        if (
          point &&
          onSnapLine(point, near[i].source) &&
          onSnapLine(point, near[j].source) &&
          accepts(point) &&
          distance(point) <= snapRadius(event, 'point') &&
          visible(point, !!near[i].guide.xray && !!near[j].guide.xray)
        )
          candidates.push({
            guide: near[i].guide,
            point,
            key: `${near[i].guide.id}:${near[j].guide.id}:intersection`,
            label:
              near[i].guide.mode === 'free' || near[j].guide.mode === 'free'
                ? 'Mittaviivojen risteys'
                : 'Apuviivojen risteys',
            kind: 'intersection',
            priority: -2,
            intersection: true,
            anchor: { point },
          });
      }
    if (near.length) {
      for (const { mesh, edge, synthetic, curve, key } of referenceEdges(event, excludedBodies))
        for (const guide of near) {
          const crossing = guideEdgeIntersection(guide.source, edge);
          const projected =
            !crossing && shift && (props.tool === 'pen' || props.tool === 'measure')
              ? guideEdgeProjection(guide.source, edge, guidePlaneNormal(guide.guide))
              : undefined;
          const point = crossing ?? projected;
          if (
            !point ||
            !accepts(point) ||
            distance(point) > snapRadius(event, 'point') ||
            !visiblePoint(point)
          )
            continue;
          const delta = sub(edge.end, edge.start);
          candidates.push({
            guide: guide.guide,
            point,
            key: `${guide.guide.id}:${key}:intersection`,
            label: projected
              ? 'Reunan projektio · Shift-viite'
              : synthetic
                ? 'Mittaviivan ja pintojen risteys'
                : guide.guide.mode === 'free'
                  ? 'Mittaviivan ja reunan risteys'
                  : 'Apuviivan ja reunan risteys',
            kind: 'intersection',
            priority: -1,
            intersection: true,
            anchor:
              synthetic || curve
                ? referenceAnchor(bodyById.get(mesh.id)!, point)
                : {
                    edge: {
                      from: edge.from,
                      to: edge.to,
                      t: Math.max(
                        0,
                        Math.min(1, dot(sub(point, edge.start), delta) / dot(delta, delta)),
                      ),
                    },
                  },
          });
        }
    }
    return candidates
      .map((c) => ({ ...c, distance: distance(c.point) }))
      .sort(
        (a, b) =>
          snapScore(a.distance, a.priority) - snapScore(b.distance, b.priority) ||
          (Math.hypot(...sub(a.point, b.point)) < 1e-5
            ? Number(b.intersection) - Number(a.intersection)
            : distance(a.point) - distance(b.point)),
      )
      .at(0);
  };
  const pickReference = (
    event: PointerEvent,
    accepts: (point: Vec3) => boolean,
    surfaceOnly = false,
  ) => {
    const edge = edgeAt(event, accepts);
    // A larger acquisition radius must not pull an exactly aimed edge onto
    // the other side of a thin board. Prefer points on that edge in this case.
    const onAimedEdge = (point: Vec3) =>
      !edge ||
      edge.distance > 2 ||
      Math.hypot(...sub(point, projectOnLine(point, edge.edge.start, edge.direction))) < 1e-5;
    let point = nearest(event, false, accepts, surfaceOnly);
    if (point && point.priority >= 0 && point.distance > 6 && !onAimedEdge(point.point))
      point = nearest(event, false, (p) => accepts(p) && onAimedEdge(p), surfaceOnly);
    const guide = guideAt(event, [], accepts);
    if (
      guide &&
      (!point ||
        snapScore(guide.distance, guide.priority) < snapScore(point.distance, point.priority))
    ) {
      highlightEdge();
      return { guide };
    }
    if (
      point &&
      (!edge || snapScore(point.distance, point.priority) <= snapScore(edge.distance, 2))
    ) {
      highlightEdge();
      return { point };
    }
    highlightEdge(edge?.edge);
    return { edge };
  };
  // Both endpoints use the same screen-space candidates. Filter before choosing
  // the nearest point so an off-plane corner cannot mask an eligible midpoint.
  const measureTargetAt = (
    event: PointerEvent,
    accepts: (point: Vec3) => boolean,
  ):
    | (Snap & {
        anchor?: Anchor;
        sourceEdge?: ReturnType<typeof edgeAt>;
        sourceGuide?: ReturnType<typeof guideAt>;
      })
    | undefined => {
    const { point, edge, guide } = pickReference(event, accepts);
    if (point) {
      const vertex = current()
        .meshes.flatMap((m) => m.verticesCAD)
        .find((v) => v.point.every((n, i) => Math.abs(n - point.point[i]) < 1e-6));
      const edgeMatch = current()
        .meshes.flatMap((m) => m.edgesCAD)
        .find((e) => {
          const delta = sub(e.end, e.start),
            t = dot(sub(point.point, e.start), delta) / dot(delta, delta);
          return (
            t >= 0 &&
            t <= 1 &&
            Math.hypot(...sub(point.point, add(e.start, scale(delta, t)))) < 1e-6
          );
        });
      const body = current().bodies.find((b) => point.key.startsWith(`${b.id}:`));
      const anchor =
        vertex?.anchor ??
        (edgeMatch
          ? {
              edge: {
                from: edgeMatch.from,
                to: edgeMatch.to,
                t:
                  dot(sub(point.point, edgeMatch.start), sub(edgeMatch.end, edgeMatch.start)) /
                  dot(sub(edgeMatch.end, edgeMatch.start), sub(edgeMatch.end, edgeMatch.start)),
              },
            }
          : body
            ? referenceAnchor(body, point.point)
            : { point: point.point });
      const sourceEdge =
        point.priority > 0 && !point.key.endsWith(':center')
          ? edgeAt(
              event,
              (p) =>
                Math.hypot(...sub(p, point.point)) < worldPerPixel(p) * snapRadius(event, 'mid'),
            )
          : undefined;
      return {
        ...point,
        anchor,
        sourceEdge: sourceEdge ? { ...sourceEdge, point: point.point } : undefined,
      };
    }
    if (edge)
      return {
        point: edge.point,
        key: 'edge-target',
        label: edge.label,
        anchor: edge.anchor,
        sourceEdge: edge,
      };
    if (guide) return { ...guide, sourceGuide: guide };
  };
  // Drawing and reference picking share the same visible, screen-space targets.
  // A guide intersection wins over an arbitrary point on a nearby edge.
  const referenceAt = (
    event: PointerEvent,
    accepts: (point: Vec3) => boolean = () => true,
    surfaceOnly = false,
  ): Snap | undefined => {
    const { point, guide, edge } = pickReference(event, accepts, surfaceOnly);
    return (
      point ??
      guide ??
      (edge
        ? {
            point: edge.point,
            key: edge.key,
            label: edge.label,
            line: [edge.edge.start, edge.edge.end],
          }
        : undefined)
    );
  };
  let dimensionSession:
    | {
        dimension: PointDimension;
        stage: 'end' | 'place';
        editing?: boolean;
        grab?: Vec3;
        initialOffset?: Vec3;
      }
    | undefined;
  let dimensionPress:
    { x: number; y: number; stage: 'start' | 'end' | 'place'; id: number } | undefined;
  // Move uses one screen-space picker for hover, press and drop. Geometry always wins over grid.
  const moveSnapAt = (event: PointerEvent, source: boolean) => {
    const props = current(),
      rect = container.getBoundingClientRect();
    const x = event.clientX - rect.left,
      y = event.clientY - rect.top;
    const excluded = source ? [] : (drag?.movingIds ?? props.selectedIds);
    const selected = new Set(props.selectedIds);
    const eligible = nearby(event)
      .map((mesh) => bodyById.get(mesh.id)!)
      .filter(Boolean)
      .filter(
        (b) =>
          !excluded.includes(b.id) &&
          (!source || selectableBody(b.id) || selected.has(b.id)) &&
          (!source || !selected.size || selected.has(b.id)) &&
          (!source || (!b.locked && (!props.editingBodyId || b.id === props.editingBodyId))),
      );
    const visible = (point: Vec3, center = false, bodyId?: string) => {
      if (bodies.userData.acceptPoint && !bodies.userData.acceptPoint(new THREE.Vector3(...point)))
        return false;
      const p = new THREE.Vector3(...point),
        projected = p.clone().project(camera()),
        ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(projected.x, projected.y), camera());
      const obstruction = intersectModel(ray, bodies, 'occlusion').find(
        (h) =>
          h.object instanceof THREE.Mesh &&
          !excluded.includes(h.object.userData.id) &&
          !(center && h.object.userData.id === bodyId),
      );
      return (
        !obstruction ||
        obstruction.distance >= ray.ray.origin.distanceTo(p) - occlusionTolerance(point)
      );
    };
    const candidates: (Snap & {
      bodyId?: string;
      priority: number;
      distance: number;
      depth: number;
      surfacePriority?: number;
      edge?: { start: Vec3; end: Vec3 };
    })[] = [];
    const allEdges = referenceEdges(event, excluded);
    for (const body of eligible) {
      const bodyEdges = allEdges.filter((e) => e.mesh.id === body.id);
      for (const p of [
        ...modelSnapPoints([body], props.meshes),
        ...intersectionPoints(bodyEdges),
      ]) {
        const q = screen(p.point),
          distance = Math.hypot(q.x - x, q.y - y),
          center = p.key.endsWith(':center');
        const priority = snapPriority(p);
        if (
          distance < snapRadius(event, priority <= 0 ? 'point' : 'mid') &&
          Math.abs(q.z) <= 1 &&
          visible(p.point, center, body.id)
        )
          candidates.push({
            ...p,
            bodyId: body.id,
            surfacePriority: surfacePriorityById.get(body.id),
            priority,
            distance,
            depth: q.z,
          });
      }
      setRay(event);
      for (const { edge, synthetic, key } of bodyEdges) {
        const point = new THREE.Vector3();
        raycaster.ray.distanceSqToSegment(
          new THREE.Vector3(...edge.start),
          new THREE.Vector3(...edge.end),
          undefined,
          point,
        );
        const p = point.toArray() as Vec3,
          q = screen(p),
          distance = Math.hypot(q.x - x, q.y - y);
        if (distance < snapRadius(event, 'line') && Math.abs(q.z) <= 1 && visible(p))
          candidates.push({
            point: p,
            key,
            label: synthetic ? 'Pintojen risteys' : 'Reuna',
            bodyId: body.id,
            surfacePriority: surfacePriorityById.get(body.id),
            priority: 2,
            distance,
            depth: q.z,
            edge,
          });
      }
    }
    if (!source) {
      const guide = guideAt(event, excluded);
      if (guide) {
        const p = screen(guide.point),
          distance = Math.hypot(p.x - x, p.y - y);
        if (distance <= snapRadius(event, guide.kind === 'line' ? 'line' : 'point'))
          candidates.push({
            ...guide,
            priority: guide.priority,
            distance,
            depth: p.z,
          });
      }
    }
    const found = candidates.sort(
      (a, b) =>
        snapScore(a.distance, a.priority) - snapScore(b.distance, b.priority) ||
        (Math.hypot(...sub(a.point, b.point)) <= 1e-5
          ? (b.surfacePriority ?? 0) - (a.surfacePriority ?? 0)
          : 0) ||
        (Math.abs(a.distance - b.distance) < 0.75 ? a.depth - b.depth : a.distance - b.distance),
    )[0];
    highlightEdge(found?.edge);
    return found;
  };
  const dimensionPick = (event: PointerEvent) => {
    const target = measureTargetAt(event, () => true);
    if (target) {
      show(target);
      return {
        point: target.point,
        anchor: target.anchor ?? { point: target.point },
      };
    }
    show();
    highlightEdge();
    const face = faceAt(event, true),
      body = current().bodies.find((b) => b.id === face?.target.bodyId);
    const point = face?.target.point ?? planePoint(event, workPlane(), [0, 0, 0]);
    return point
      ? {
          point,
          anchor: body ? referenceAnchor(body, point) : ({ point } as Anchor),
        }
      : undefined;
  };
  const dimensionHit = (event: PointerEvent) => {
    const props = current();
    if (props.dimensionDisplay === 'hidden') return;
    const id = dimensionAt(container, event.clientX, event.clientY);
    return props.dimensions.find((d) => d.id === id && !d.hidden);
  };
  const updateDimension = (event: PointerEvent) => {
    if (!dimensionSession) {
      dimensionPick(event);
      return;
    }
    const d = dimensionSession.dimension;
    if (
      dimensionSession.editing &&
      dimensionPress &&
      Math.hypot(event.clientX - dimensionPress.x, event.clientY - dimensionPress.y) < 4
    )
      return;
    if (!dimensionSession.editing) d.axis = current().axis ?? 'distance';
    if (dimensionSession.stage === 'end') {
      const picked = dimensionPick(event);
      if (picked) {
        d.end = picked.anchor;
        d.fallback[1] = picked.point;
      }
    } else {
      const g = pointDimensionGeometry(current().bodies, d);
      const point = framePoint(event, sketchFrame(g.start, d.normal));
      if (point)
        d.offset =
          dimensionSession.grab && dimensionSession.initialOffset
            ? add(dimensionSession.initialOffset, sub(point, dimensionSession.grab))
            : sub(point, g.start);
      show();
      highlightEdge();
    }
    current().onDimensionPreview({ ...d, fallback: [...d.fallback] });
    canvas.dataset.dimensionStage = dimensionSession.stage;
  };
  const dimensionDown = (event: PointerEvent) => {
    const hit = current().tool === 'select' ? dimensionHit(event) : undefined;
    if (hit) {
      current().onSelectDimension?.(hit.id, event.shiftKey || event.ctrlKey || event.metaKey);
      if (!isPointDimension(hit) || event.shiftKey || event.ctrlKey || event.metaKey) {
        pointers.delete(event.pointerId);
        return;
      }
    }
    if (hit)
      dimensionSession = {
        dimension: structuredClone(hit),
        stage: 'place',
        editing: true,
        initialOffset: [...hit.offset],
        grab: framePoint(
          event,
          sketchFrame(pointDimensionGeometry(current().bodies, hit).start, hit.normal),
        ),
      };
    if (!dimensionSession) {
      const picked = dimensionPick(event);
      if (!picked) return;
      const normal = camera().getWorldDirection(new THREE.Vector3()).negate().toArray() as Vec3;
      dimensionSession = {
        dimension: {
          id: uid(),
          kind: 'points',
          start: picked.anchor,
          end: picked.anchor,
          fallback: [picked.point, picked.point],
          axis: current().axis ?? 'distance',
          offset: [0, 0, 0],
          normal,
        },
        stage: 'end',
      };
      dimensionPress = {
        x: event.clientX,
        y: event.clientY,
        id: event.pointerId,
        stage: 'start',
      };
    } else {
      if (dimensionSession.stage === 'end') {
        updateDimension(event);
        const g = pointDimensionGeometry(current().bodies, dimensionSession.dimension);
        if (g.value < 0.1) return;
        // Pick a plane containing the measurement direction and facing the camera.
        const direction = unit(sub(g.end, g.start)),
          view = camera().getWorldDirection(new THREE.Vector3()).toArray() as Vec3;
        const normal = sub(view, scale(direction, dot(view, direction)));
        const eligible = [0, 1, 2]
          .filter((i) => Math.abs(direction[i]) < 1e-6)
          .sort((a, b) => Math.abs(view[b]) - Math.abs(view[a]));
        dimensionSession.dimension.normal = eligible.length
          ? axisVector((['x', 'y', 'z'] as const)[eligible[0]])
          : Math.hypot(...normal) > 1e-6
            ? unit(normal)
            : axisVector((['x', 'y', 'z'] as const)[planeAxes[workPlane()][2]]);
        dimensionSession.stage = 'place';
        dimensionPress = {
          x: event.clientX,
          y: event.clientY,
          id: event.pointerId,
          stage: 'end',
        };
      } else
        dimensionPress = {
          x: event.clientX,
          y: event.clientY,
          id: event.pointerId,
          stage: 'place',
        };
    }
    canvas.setPointerCapture(event.pointerId);
    canvas.focus({ preventScroll: true });
    updateDimension(event);
  };
  const selectableGuideAt = (event: PointerEvent) => {
    setRay(event);
    raycaster.params.Line.threshold = worldPerPixel(current().bodies[0]?.origin ?? [0, 0, 0]) * 7;
    (raycaster.params as { Line2?: { threshold: number } }).Line2 = {
      threshold: 10,
    };
    const hit = raycaster.intersectObjects(guides.children).find((h) => h.object.userData.guideId);
    const obstruction = faceAt(event)?.hit;
    return hit &&
      (!obstruction ||
        hit.object.userData.xray ||
        hit.distance <= obstruction.distance + worldPerPixel(hit.point.toArray() as Vec3) * 0.5)
      ? hit
      : undefined;
  };
  const highlightGuide = (id?: string) => {
    canvas.dataset.eraseGuide = id ?? '';
    for (const line of guides.children) {
      if (!line.userData.guideId || !(line instanceof THREE.Mesh)) continue;
      const material = line.material as THREE.Material & {
        color: THREE.Color;
        linewidth: number;
      };
      material.userData.originalColor ??= material.color.getHex();
      material.userData.originalWidth ??= material.linewidth;
      const active = line.userData.guideId === id;
      material.color.set(active ? '#b66e35' : material.userData.originalColor);
      material.linewidth = active ? 3 : material.userData.originalWidth;
    }
    render();
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
      hoverMarker.material.size = 16;
    }
    marker.visible = !!snap;
    canvas.dataset.snapVisible = String(!!snap);
    if (!snap) canvas.dataset.snapPoint = '';
    canvas.dataset.snapKey = snap?.key ?? '';
    if (snap) {
      canvas.dataset.snapPoint = JSON.stringify(snap.point);
      marker.position.set(...snap.point);
      marker.material.size = snap.key === 'grid' || snap.key === 'free' ? 12 : 16;
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
      referenceMarker.material.size = 16;
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
    let point = nearest(event, false, (p, key) => {
      const bodyId = current().bodies.find((b) => key.startsWith(`${b.id}:`))?.id;
      return (
        !(bodyId === source.bodyId && key.endsWith(':center')) &&
        !!pointDepthSnap(source, p, bodyId)
      );
    });
    const guideCandidate = guideAt(event, [source.bodyId], (p) => !!pointDepthSnap(source, p));
    const guide =
      guideCandidate &&
      (!point ||
        snapScore(guideCandidate.distance, guideCandidate.priority) <
          snapScore(point.distance, point.priority))
        ? guideCandidate
        : undefined;
    if (guide) point = undefined;
    const edge =
      point || guide
        ? undefined
        : edgeAt(event, (p, bodyId) => !!pointDepthSnap(source, p, bodyId));
    const anchor: Snap | undefined =
      point ?? (edge ? { point: edge.point, key: edge.key, label: edge.label } : guide);
    const picked = anchor ? undefined : faceAt(event, true);
    const match = anchor
      ? pointDepthSnap(source, anchor.point)
      : picked?.face.planar &&
          Math.abs(dot(picked.target.normal, raycaster.ray.direction.toArray() as Vec3)) > 1e-5 &&
          visiblePoint(picked.target.point)
        ? faceDepthSnap(source, picked.target)
        : undefined;
    const kind = point
      ? point.key.endsWith(':center')
        ? 'center'
        : point.priority === 0
          ? 'vertex'
          : 'midpoint'
      : edge
        ? 'edge'
        : guide
          ? 'guide'
          : match && 'parallel' in match
            ? match.parallel
              ? 'plane'
              : 'point'
            : '';
    canvas.dataset.depthTarget = match
      ? (anchor?.key ?? `${picked!.target.bodyId}:${picked!.target.face}`)
      : '';
    canvas.dataset.depthKind = kind;
    hoveredReference = undefined;
    highlightEdge(edge?.edge);
    if (!match) {
      highlightFace(source);
      show();
      return;
    }
    highlightFace(picked?.target ?? source, !!picked);
    const targetPoint = anchor?.point ?? picked!.target.point;
    const label =
      anchor?.label ??
      (kind === 'plane' ? 'Tavoitepinta · sama taso' : 'Tavoitepiste · vino pinta');
    show({
      point: targetPoint,
      key: anchor?.key ?? 'depth-target',
      label: `${label} · siirtymä ${formatLength(match.distance)} mm`,
      line: [targetPoint, add(source.point, scale(unit(source.normal), match.distance))],
    });
    return match;
  };
  const clearDepthTarget = () => {
    canvas.dataset.depthTarget = '';
    canvas.dataset.depthKind = '';
    highlightEdge();
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
        props.onSnap('Shift · Osoita kulmaa, keskipistettä, reunaa tai pintaa tavoitteeksi.');
        return;
      }
      session.distance = snap.distance;
    } else {
      clearDepthTarget();
      highlightFace(session.target);
      show();
      const distance =
        session.baseDistance +
        (event.clientX - session.x) * session.dx +
        (event.clientY - session.y) * session.dy;
      const thickness = props.faceSpan?.depth ?? 0;
      session.distance =
        distance === session.baseDistance
          ? distance
          : gridLength(thickness + distance, props.gridStep, props.gridSnap) - thickness;
      props.onSnap(
        props.gridSnap ? `Kokonaismitta · ${props.gridStep} mm ruudukko` : 'Vapaa syvyys',
      );
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
        gridStep: props.gridStep,
        meshes: props.meshes,
        guides: props.guides,
        reference: reference(),
        inferenceOrigin: inference,
        excludeId: props.tool === 'move' && !props.copyMove ? props.selected : undefined,
        excludeIds: props.tool === 'move' && !props.copyMove ? props.selectedIds : undefined,
        projectGuides: props.tool === 'move',
        forceDirection: shift && !reference() && ['move', 'pen', 'rectangle'].includes(props.tool),
      },
    );
    show(lastSnap, plane);
    return lastSnap.point;
  };
  let displayState = current().modelDisplay;
  const sync = () => {
    canvas.style.cursor = ['pen', 'measure', 'rectangle', 'circle'].includes(current().tool)
      ? 'crosshair'
      : '';
    if (displayState !== current().modelDisplay) {
      displayState = current().modelDisplay;
      clearSelectionBox();
      highlightFace();
      highlightEdge();
      current().onMoveHover?.(undefined);
      current().onSelectionHover?.(undefined);
    }
    if (current().tool !== 'move' || !drag) showMoveAxis();
    if (current().tool !== 'detail') {
      detailHover.visible = false;
      detailSelected.visible = false;
    }
    if (externalReference !== current().reference) {
      externalReference = current().reference;
      if (!externalReference) heldReference = undefined;
      show(lastSnap);
    }
    if (epoch !== current().epoch || tool !== current().tool) {
      current().onSelectionHover?.(undefined);
      clearSelectionBox();
      epoch = current().epoch;
      tool = current().tool;
      drag = undefined;
      showMoveAxis();
      rotationDrag = undefined;
      offsetSession = undefined;
      detailSession = undefined;
      canvas.dataset.detailDragging = '';
      extrudeSession = undefined;
      shapeSession = undefined;
      canvas.dataset.depthTarget = '';
      canvas.dataset.depthKind = '';
      measureSession = undefined;
      measureShiftPending = false;
      dimensionSession = undefined;
      dimensionPress = undefined;
      canvas.dataset.dimensionStage = '';
      canvas.dataset.moveGrab = '';
      canvas.dataset.moveSnap = '';
      canvas.dataset.moveEnd = '';
      canvas.dataset.moveAxis = '';
      penPressPoint = undefined;
      lastSnap = undefined;
      heldReference = undefined;
      acquired = undefined;
      hoveredReference = undefined;
      shiftDirection = undefined;
      penShiftPending = false;
      drawingPlane = current().sketchFrame;
      drawingTarget = current().sketchTarget;
      lastPenPoint = undefined;
      previousPenCount = current().penPoints.length;
      current().onConstraint(undefined);
      highlightFace();
      highlightEdge();
      highlightBoundary();
      highlightGuide();
      pointers.clear();
      blocked = false;
      show();
      if (selectionPointerInside && lastEvent && tool === 'pen') updatePen(lastEvent);
      if (
        selectionPointerInside &&
        lastEvent &&
        tool === 'measure' &&
        current().measureMode === 'free'
      )
        sketchStartAt(lastEvent);
    }
    if (current().tool === 'offset' && current().faceTarget && !offsetSession)
      startOffset(current().faceTarget!);
    if (current().guidePreview && !measureSession)
      measureSession = {
        anchor: current().guidePreview!.anchor,
        plane: current().guidePreview!.plane,
        direction: current().guidePreview!.direction,
        edgeLength: current().guidePreview!.offset ? current().guidePreview!.length : undefined,
        editing: !!current().selectedGuideId,
      };
    if (current().measureStart && !measureSession) {
      const start = current().measureStart!;
      measureSession = { ...start, end: resolveAnchor(current().bodies, start.anchor) };
      measureShiftPending = shift && !current().axis;
    }
    if (previousPenCount !== current().penPoints.length) {
      if (previousPenCount > 0) penShiftPending = false;
      previousPenCount = current().penPoints.length;
      shiftDirection = undefined;
      lastPenPoint = current().penPoints.at(-1);
      if (drawingPlane && lastPenPoint) drawingPlane = { ...drawingPlane, origin: lastPenPoint };
      lastSnap = undefined;
      current().onConstraint(current().axis ? axisVector(current().axis!) : undefined);
    }
    if (previousAxis !== current().axis) {
      previousAxis = current().axis;
      shiftDirection = undefined;
      penShiftPending = false;
      lastSnap = undefined;
      current().onConstraint(
        current().tool === 'pen' && previousAxis ? axisVector(previousAxis) : undefined,
      );
      if (lastEvent && ['rectangle', 'circle'].includes(current().tool)) {
        if (shapeSession) {
          const normal = previousAxis
            ? axisVector(previousAxis)
            : (drawingTarget?.normal ?? ([0, 0, 1] as Vec3));
          const frame = sketchFrame(shapeSession.start, normal);
          drawingPlane = shapeSession.sketch = frame;
          const target =
            drawingTarget && Math.abs(Math.abs(dot(normal, drawingTarget.normal)) - 1) < 1e-5
              ? drawingTarget
              : undefined;
          current().onSketchPlane(frame, target);
        }
        move(lastEvent);
      }
      if (lastEvent) {
        if (current().tool === 'move' && drag) move(lastEvent);
        if (current().tool === 'pen') updatePen(lastEvent);
        else if (dimensionSession) updateDimension(lastEvent);
        else if (current().tool === 'measure' && measureSession) updateMeasure(lastEvent);
      }
    }
    if (current().tool === 'detail') {
      if (detailSession?.started) showDetailSize();
      else highlightDetail(lastEvent ? detailEdgeAt(lastEvent) : undefined);
    }
    if (previousConstraintReset !== current().constraintReset) {
      previousConstraintReset = current().constraintReset;
      shiftDirection = undefined;
      penShiftPending = false;
      measureShiftPending = false;
      lastSnap = undefined;
      current().onConstraint(undefined);
      if (lastEvent && current().tool === 'pen') updatePen(lastEvent);
      if (lastEvent && measureSession) updateMeasure(lastEvent);
    }
  };
  const updatePen = (event: PointerEvent): Vec3 | undefined => {
    const props = current(),
      start = props.penPoints.at(-1);
    if (!start) {
      const picked = sketchStartAt(event);
      if (!picked) return;
      highlightFace(picked.target, true);
      props.onPenHover(picked.point);
      lastPenPoint = picked.point;
      return picked.point;
    }
    const found = referenceAt(event, (point) => Math.hypot(...sub(point, start)) > 1e-6);
    if (props.penPoints.length === 1 && drawingTarget && !props.axis && !shiftDirection) {
      const targetId = drawingTarget.bodyId;
      const hit = faceAt(event);
      const through =
        found?.point ??
        (hit?.target.bodyId === drawingTarget.bodyId ? hit.target.point : undefined);
      const mesh = props.meshes.find((m) => m.id === targetId);
      if (through && mesh) {
        setRay(event);
        const face = contextualFace(
          mesh,
          start,
          raycaster.ray.direction.clone().negate().toArray() as Vec3,
          through,
        );
        if (face && face.ref !== drawingTarget.face) {
          drawingTarget = { bodyId: mesh.id, face: face.ref, normal: face.normal, point: start };
          drawingPlane = sketchFrame(start, face.normal);
          canvas.dataset.sketchPlane = JSON.stringify(face.normal);
          props.onSketchPlane(drawingPlane, drawingTarget);
          highlightFace(drawingTarget, true);
        }
      }
    }
    // A camera turn can put the original plane edge-on. Intersecting that
    // plane then freezes the pointer or sends it far away. Free drawing uses
    // a camera-facing plane through the last vertex until that plane is usable.
    let frame = drawingPlane;
    if (frame) {
      setRay(event);
      if (Math.abs(dot(raycaster.ray.direction.toArray() as Vec3, frame.normal)) < 0.05)
        frame = sketchFrame(
          start,
          axisVector((['x', 'y', 'z'] as const)[planeAxes[workPlane()][2]]),
        );
    }
    // Shift may be pressed before there is a direction to capture. In that case
    // acquire the first nonzero drawing direction, then keep it independent of
    // whichever off-axis reference the pointer visits afterwards.
    if (penShiftPending && !props.axis) {
      const raw = frame ? framePoint(event, frame) : planePoint(event, workPlane(), start);
      if (raw) {
        const point = frame
          ? frameSnap(raw, frame, start, event)
          : snap(raw, workPlane(), undefined, start);
        const delta = sub(point, start);
        if (Math.hypot(...delta) > 0.01) {
          shiftDirection = unit(delta);
          penShiftPending = false;
          props.onConstraint(shiftDirection);
        }
      }
    }
    const direction = props.axis ? axisVector(props.axis) : shiftDirection;
    if (start && direction) {
      const picked = found?.point;
      let point = picked
        ? projectOnLine(picked, start, direction)
        : linePoint(event, start, direction);
      if (!picked && props.gridSnap)
        point = add(
          start,
          scale(
            direction,
            Math.round(dot(sub(point, start), direction) / props.gridStep) * props.gridStep,
          ),
        );
      show({
        point,
        key: 'constraint',
        label: `${props.axis ? props.axis.toUpperCase() : 'Suunta lukittu'} · ${picked ? `${found!.label} · Pituus poimittu` : 'Poimi pituus pisteestä tai reunasta'}`,
        line: [start, point],
      });
      if (picked) {
        referenceMarker.visible = true;
        referenceMarker.position.set(...picked);
        referenceMarker.material.size = 16;
        render();
      }
      props.onPenHover(point);
      lastPenPoint = point;
      return point;
    }
    // Exact geometry anchors are not projected onto an old sketch plane.
    // Projection is only intentional while Shift or an explicit axis is held.
    if (found) {
      show(found);
      props.onPenHover(found.point);
      lastPenPoint = found.point;
      return found.point;
    }
    if (frame) {
      const raw = framePoint(event, frame);
      if (!raw) return;
      const point = frameSnap(raw, frame, start, event);
      props.onPenHover(point);
      lastPenPoint = point;
      return point;
    }
    const plane = workPlane();
    const raw = planePoint(event, plane, start ?? [0, 0, 0]);
    if (!raw) return;
    const point = snap(raw, plane, undefined, start);
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
    const isEdge = props.measureMode === 'guide' && measureSession.edgeLength !== undefined;
    if (props.freeRotate && existing) {
      const pivot = guidePoints(props.bodies, existing)?.[0];
      if (!pivot) return;
      const frame = (measureSession.rotationFrame ??= sketchFrame(
        pivot,
        guidePlaneNormal(existing),
      ));
      const raw = framePoint(event, frame);
      if (!raw) return;
      const uv = toUV(raw, frame);
      if (Math.hypot(...uv) < 0.01) return;
      const degrees = (Math.atan2(uv[1], uv[0]) * 180) / Math.PI;
      const angle = props.guideRotationStep
        ? Math.round(degrees / props.guideRotationStep) * props.guideRotationStep
        : degrees;
      const radians = (angle * Math.PI) / 180;
      const end = fromUV(
        [Math.cos(radians) * existing.length, Math.sin(radians) * existing.length],
        frame,
      );
      const direction = unit(sub(end, pivot));
      measureSession.end = end;
      show(
        {
          point: end,
          key: 'guide-rotation',
          label: `Kierto ${formatLength((angle + 360) % 360)}°${props.guideRotationStep ? ' · 22,5° askel' : ' · vapaa'} · Napsauta tai Enter`,
          line: [pivot, end],
        },
        plane,
      );
      props.onGesture({
        type: 'measure',
        anchor: measureSession.anchor,
        end,
        plane,
        freeAngle: true,
        direction,
        offset: existing.offset,
        edgeLength: existing.length,
      });
      return;
    }
    if (props.measureMode === 'free' && !props.freeRotate) {
      if (measureShiftPending && !axis) {
        const raw = measureSession.frame
          ? framePoint(event, measureSession.frame)
          : planePoint(event, plane, start);
        if (raw) {
          const normal = axisVector((['x', 'y', 'z'] as const)[planeAxes[plane][2]]);
          const first = frameSnap(
            raw,
            measureSession.frame ?? sketchFrame(start, normal),
            undefined,
            event,
          );
          const delta = sub(first, start);
          if (Math.hypot(...delta) > 0.01) {
            shiftDirection = unit(delta);
            measureShiftPending = false;
            props.onConstraint(shiftDirection);
          }
        }
      }
      const direction = axis ?? shiftDirection;
      if (direction) {
        // The reference may be anywhere in 3D. Only its coordinate along
        // the held direction is used; never attach the endpoint to the
        // off-axis source anchor or round its projected distance to the grid.
        const target = measureTargetAt(event, () => true);
        const projected = target
          ? projectOnLine(target.point, start, direction)
          : linePoint(event, start, direction);
        const distance = dot(sub(projected, start), direction);
        const end = target
          ? projected
          : add(start, scale(direction, gridLength(distance, props.gridStep, props.gridSnap)));
        measureSession.end = end;
        show(
          {
            point: end,
            key: 'measure-constraint',
            label: `${props.axis ? props.axis.toUpperCase() : 'Suunta lukittu'} · ${target ? `${target.label} · Pituus poimittu` : 'Poimi pituus pisteestä tai reunasta'}`,
            line: target ? [end, target.point] : [start, end],
          },
          plane,
        );
        if (target) {
          referenceMarker.visible = true;
          referenceMarker.position.set(...target.point);
          referenceMarker.material.size = 16;
          render();
        }
        props.onGesture({
          type: 'measure',
          anchor: measureSession.anchor,
          end,
          plane,
          freeAngle: true,
          direction: distance < 0 ? scale(direction, -1) : direction,
          endAnchor: target
            ? Math.hypot(...sub(end, target.point)) < 1e-6
              ? target.anchor
              : { point: end }
            : undefined,
        });
        return;
      }
    }
    if (isEdge && !props.freeRotate) {
      const direction = existing?.direction ?? measureSession.direction;
      if (!direction) return;
      if (
        !axis &&
        !measureSession.surfaceChosen &&
        drag &&
        Math.hypot(event.clientX - drag.screenX, event.clientY - drag.screenY) > 4
      ) {
        const hit = faceAt(event, true);
        if (
          hit?.face.planar &&
          Math.abs(dot(sub(start, hit.face.center), hit.face.normal)) < 1e-5 &&
          Math.abs(dot(direction, hit.face.normal)) < 1e-5
        ) {
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
      const normal =
        measureSession.frame?.normal ?? axisVector((['x', 'y', 'z'] as const)[planeAxes[plane][2]]);
      const target = measureTargetAt(event, (point) =>
        axis
          ? Math.hypot(...sub(point, projectOnLine(point, start, axis))) < 1e-5
          : Math.abs(dot(sub(point, start), normal)) < 1e-5,
      );
      if (target) raw = target.point;
      else if (!axis && measureSession.frame) raw = frameSnap(raw, measureSession.frame);
      let offset = axis ? sub(raw, start) : sub(raw, projectOnLine(raw, start, direction));
      if (axis && props.gridSnap && !target)
        offset = scale(axis, Math.round(dot(offset, axis) / props.gridStep) * props.gridStep);
      const end = add(start, offset);
      const offsetNormal = cross(direction, offset);
      if (Math.hypot(...offsetNormal) > 1e-8) plane = normalPlane(offsetNormal);
      show(
        {
          point: target?.point ?? end,
          key: target?.key ?? 'edge-offset',
          label:
            target?.label ??
            (axis
              ? `${props.axis!.toUpperCase()} · Siirtosuunta lukittu`
              : 'Reunan suuntainen apuviiva'),
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
    const target = measureTargetAt(
      event,
      (point) =>
        (props.measureMode === 'free' ||
          Math.abs(point[planeAxes[plane][2]] - start[planeAxes[plane][2]]) < 1e-5) &&
        (!axis || Math.hypot(...sub(point, projectOnLine(point, start, axis))) < 1e-5),
    );
    const raw =
      target?.point ??
      (axis && !isEdge
        ? linePoint(event, start, axis)
        : props.measureMode === 'free' && measureSession.frame
          ? framePoint(event, measureSession.frame)
          : planePoint(event, plane, base));
    if (!raw) return;
    const normal = axisVector((['x', 'y', 'z'] as const)[planeAxes[plane][2]]);
    const end =
      target?.point ??
      (axis
        ? add(
            start,
            scale(axis, gridLength(dot(sub(raw, start), axis), props.gridStep, props.gridSnap)),
          )
        : frameSnap(
            raw,
            props.measureMode === 'free' && measureSession.frame
              ? measureSession.frame
              : sketchFrame(start, normal),
            undefined,
            event,
          ));
    if (target) show(target, plane);
    else if (axis)
      show(
        {
          point: end,
          key: 'axis',
          label: `${props.axis!.toUpperCase()} · Siirtosuunta lukittu`,
        },
        plane,
      );
    const from = props.freeRotate ? base : start;
    measureSession.end = end;
    const direction =
      (!isEdge && axis) ||
      (props.measureMode === 'free' ? unit(sub(end, from)) : undefined) ||
      guideDirection(
        plane,
        angleBetween(
          from,
          end,
          plane,
          !!target || props.freeRotate || shift || props.measureMode === 'free',
        ),
      );
    props.onGesture({
      type: 'measure',
      anchor: measureSession.anchor,
      end,
      plane,
      freeAngle: shift || props.freeRotate,
      endAnchor: target?.anchor,
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
      hit = faceAt(event, true);
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
    current().onRotationAngle(rotationAngle(angle, shift));
  };
  let contextStart: { x: number; y: number } | undefined;
  const contextEvent = (event: MouseEvent) => event.preventDefault();
  const pickCandidatesAt = (event: PointerEvent) => {
    setRay(event);
    const seen = new Set<string>();
    return intersectModel(raycaster, bodies, 'selection').flatMap((hit) => {
      const id = hit.object.userData.id as string | undefined;
      const props = current();
      if (
        (!(hit.object instanceof THREE.Mesh) && !hit.object.userData.wireOnly) ||
        !id ||
        seen.has(id) ||
        (props.editingBodyId && id !== props.editingBodyId) ||
        (props.scopeIds && !props.scopeIds.includes(id))
      )
        return [];
      seen.add(id);
      const mesh = props.meshes.find((m) => m.id === id);
      const index = (hit.faceIndex ?? 0) * 3;
      return [
        {
          bodyId: id,
          face: mesh?.faces.find((f) => index >= f.start && index < f.start + f.count)?.ref,
        },
      ];
    });
  };
  let pickingOther = false;
  const down = (event: PointerEvent) => {
    pickingOther = false;
    if (event.button === 2) contextStart = { x: event.clientX, y: event.clientY };
    lastEvent = event;
    sync();
    if (event.button !== 0) {
      emptySelectionClicks = 0;
      return;
    }
    pointers.add(event.pointerId);
    if (pointers.size > 1) {
      clearSelectionBox();
      cancelDetailDrag();
      if (dimensionSession) {
        dimensionSession = undefined;
        dimensionPress = undefined;
        current().onDimensionPreview(undefined);
      }
      emptySelectionClicks = 0;
      drag = undefined;
      extrudeSession = undefined;
      shapeSession = undefined;
      rotationDrag = undefined;
      blocked = true;
      show();
      return;
    }
    const props = current();
    if (props.busy || props.modalOpen) return;
    if (props.pickOthers) {
      // Opening on pointerdown must suppress the canvas default focus, which
      // otherwise steals keyboard focus back from the newly mounted picker.
      event.preventDefault();
      pickingOther = true;
      props.onPickCandidates?.({
        x: event.clientX,
        y: event.clientY,
        candidates: pickCandidatesAt(event),
      });
      pointers.delete(event.pointerId);
      return;
    }
    if (props.tool === 'navigate') return;
    // Idle tools share selection; active drawing, reference acquisition and
    // face gestures keep their own modifiers and empty-space semantics.
    const selectionTool =
      ['move', 'rotate', 'offset', 'detail', 'erase', 'paint', 'boolean'].includes(props.tool) ||
      (props.tool === 'measure' && props.measureMode === 'guide');
    if (
      selectionTool &&
      !drag &&
      !offsetSession &&
      !measureSession &&
      !dimensionSession &&
      !props.pickReference &&
      !props.rotation?.picking
    ) {
      const hit = faceAt(event),
        wire = wireAt(event);
      const empty =
        !hit &&
        !wire &&
        !selectableGuideAt(event) &&
        !(props.tool === 'move' && moveSnapAt(event, true)) &&
        !(props.tool === 'rotate' && rotationHandleAt(event)) &&
        !(props.tool === 'detail' && detailEdgeAt(event)) &&
        !(props.tool === 'measure' && (vertexAt(event) || edgeAt(event) || guideAt(event)));
      if ((empty || event.shiftKey) && !(props.tool === 'rotate' && rotationHandleAt(event))) {
        drag = {
          start: [0, 0, 0],
          origin: [0, 0, 0],
          screenX: event.clientX,
          screenY: event.clientY,
          height: 0,
          plane: 'XY',
          second: false,
          selection: true,
          selectionBodyId: wire?.object.userData.id ?? hit?.target.bodyId,
          extendSelection: event.shiftKey,
        };
        selectionBounds = undefined;
        guideSelectionBounds = undefined;
        canvas.setPointerCapture(event.pointerId);
        canvas.focus({ preventScroll: true });
        return;
      }
    }
    if (props.tool === 'paint') {
      const picked = faceAt(event);
      if (picked && !editBlocked(event, picked.target.bodyId)) props.onPaint(picked.target.bodyId);
      return;
    }
    if (
      (props.tool === 'measure' && props.measureMode === 'dimension') ||
      (props.tool === 'select' && (dimensionSession || dimensionHit(event)))
    ) {
      dimensionDown(event);
      return;
    }
    if (props.tool === 'detail') {
      const edge = detailEdgeAt(event);
      highlightDetail(edge);
      detailSession = edge
        ? {
            edge,
            pointerId: event.pointerId,
            started: false,
            x: event.clientX,
            y: event.clientY,
            initial: Number.isFinite(props.detailSize) ? props.detailSize : 2,
            millimetersPerPixel: worldPerPixel(edge.point),
          }
        : undefined;
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
    if (props.tool === 'erase') {
      const guide = selectableGuideAt(event);
      const wire = wireAt(event),
        face = faceAt(event);
      if (
        !guide &&
        (wire || face) &&
        editBlocked(event, wire?.object.userData.id ?? face!.target.bodyId)
      )
        return;
      const target = !guide ? boundaryAt(event) : undefined;
      highlightBoundary(target);
      highlightGuide(guide?.object.userData.guideId);
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
      const p = referenceAt(event);
      if (p) {
        props.onReference(p);
        props.onReferencePicked();
        if (props.tool === 'pen' && props.penPoints.length && lastPenPoint) {
          const delta = sub(lastPenPoint, props.penPoints.at(-1)!);
          if (!props.axis && Math.hypot(...delta) > 0.01) {
            shiftDirection = unit(delta);
            props.onConstraint(shiftDirection);
          }
          updatePen(event);
        } else if (props.tool === 'measure' && props.measureMode === 'free' && measureSession) {
          const start = resolveAnchor(props.bodies, measureSession.anchor);
          const delta = start && measureSession.end ? sub(measureSession.end, start) : undefined;
          if (!props.axis && delta && Math.hypot(...delta) > 0.01) {
            shiftDirection = unit(delta);
            props.onConstraint(shiftDirection);
          }
          updateMeasure(event);
        } else show({ ...p });
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
        const hit = editableFaceAt(event, true);
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
        const picked = editableFaceAt(event, true);
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
        else props.onSnap('Osoita kulmaa, keskipistettä, reunaa tai pintaa tavoitteeksi.');
        return;
      }
      const continuing = !!extrudeSession || (props.extrusionLocked && !!props.faceTarget);
      if (!extrudeSession && continuing)
        startExtrusion(props.faceTarget!, event, props.faceDistance);
      if (!extrudeSession) {
        const picked = editableFaceAt(event, true);
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
      drag = {
        ...shapeSession,
        screenX: event.clientX,
        screenY: event.clientY,
        second: true,
      };
      canvas.setPointerCapture(event.pointerId);
      canvas.focus({ preventScroll: true });
      return;
    }
    if (
      props.tool === 'rectangle' ||
      props.tool === 'circle' ||
      (props.tool === 'pen' && !props.penPoints.length)
    ) {
      const picked = sketchStartAt(event);
      if (picked) {
        drawingTarget = picked.target;
        drawingPlane = picked.frame;
        const start = picked.point,
          frame = { ...drawingPlane, origin: start };
        props.onSketchPlane(frame, drawingTarget);
        if (props.tool === 'pen') penPressPoint = start;
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
    const moveHit = props.tool === 'move' ? faceAt(event) : undefined;
    const moveSnap = props.tool === 'move' ? moveSnapAt(event, true) : undefined;
    const moveTarget = moveSnap?.bodyId ?? moveHit?.target.bodyId;
    if (
      props.tool === 'move' &&
      props.selectedIds.length &&
      (!moveTarget || !props.selectedIds.includes(moveTarget))
    ) {
      props.onSnap('Valinta säilyy. Tartu valittuun osaan tai lisää osa Shift-klikkauksella.');
      return;
    }
    if (
      props.tool === 'move' &&
      props.editingBodyId &&
      (moveTarget ?? props.selected) !== props.editingBodyId
    ) {
      if (moveTarget) editBlocked(event, moveTarget);
      return;
    }
    if (
      props.tool === 'move' &&
      props.bodies.find((b) => b.id === (moveTarget ?? props.selected))?.locked
    ) {
      props.onSnap('Kappale on kiinnitetty. Vapauta se G-näppäimellä.');
      return;
    }
    const moveIds = moveTarget ? props.onMoveTarget(moveTarget) : undefined;
    if (props.tool === 'move') props.onMoveHover?.(undefined);
    if (props.tool !== 'select') props.onStart();
    const selected = props.bodies.find((b) => b.id === (moveTarget ?? props.selected)),
      origin = selected?.origin ?? ([0, 0, 0] as Vec3);
    let plane = workPlane(),
      point = planePoint(
        event,
        plane,
        ['rectangle', 'pen'].includes(props.tool) ? [0, 0, 0] : origin,
      );
    if (props.tool === 'move' && selected) {
      const grab = moveSnap?.bodyId === selected.id ? moveSnap.point : moveHit?.target.point;
      if (!grab) {
        props.onSnap('Poimi siirrettävän osan kulma, reuna tai pinta.');
        return;
      }
      show(moveSnap ? { ...moveSnap, label: `Tartuntapiste · ${moveSnap.label}` } : undefined);
      canvas.dataset.moveGrab = JSON.stringify(grab);
      if (grab) point = grab;
      props.onCopyMove(event.ctrlKey || event.altKey || props.copyMove);
    }
    const second = !!measureSession;
    if (props.tool === 'measure') {
      if (!measureSession) {
        shiftDirection = undefined;
        measureShiftPending = props.measureMode === 'free' && event.shiftKey && !props.axis;
        const picked = measureTargetAt(event, () => true);
        const freeStart = props.measureMode === 'free' ? sketchStartAt(event) : undefined;
        const edge = picked?.sourceEdge;
        const guide = picked?.sourceGuide;
        if (props.measureMode === 'guide' && !picked) {
          props.onSnap('Valitse kappaleen piste, reuna, apuviiva tai niiden risteys.');
          return;
        }
        if (!picked && !(freeStart?.point ?? point)) return;
        if (props.measureMode === 'free' && !picked && !freeStart) return;
        const adjacent = edge?.mesh.faces.filter(
          (f) =>
            f.planar &&
            Math.abs(dot(sub(edge.edge.start, f.center), f.normal)) < 1e-5 &&
            Math.abs(dot(sub(edge.edge.end, f.center), f.normal)) < 1e-5,
        );
        const hit = faceAt(event, true);
        const viewDirection = camera().getWorldDirection(new THREE.Vector3()).toArray() as Vec3;
        const facing = (face: BodyMesh['faces'][number]) =>
          Math.abs(dot(face.normal, viewDirection));
        const hitFace = adjacent?.find((f) => f === hit?.face);
        // A ray on a shared edge can numerically hit the edge-on side face.
        // Use its visible neighbor rather than a plane the pointer ray cannot intersect.
        const face =
          hitFace && facing(hitFace) > 0.05
            ? hitFace
            : adjacent?.slice().sort((a, b) => facing(b) - facing(a))[0];
        if (edge)
          plane = face ? normalPlane(face.normal) : planeForDirection(edge.direction, plane);
        if (guide) plane = normalPlane(guidePlaneNormal(guide.guide));
        if (freeStart) plane = normalPlane(freeStart.frame.normal);
        const parallelGuide =
          props.measureMode === 'guide' && guide && (guide.kind === 'line' || guide.kind === 'mid');
        measureSession = {
          anchor: picked?.anchor ?? {
            point: picked?.point ?? freeStart?.point ?? snap(point!, plane),
          },
          plane,
          direction: edge?.direction ?? (parallelGuide ? guideVector(guide.guide) : undefined),
          edgeLength:
            props.measureMode === 'guide'
              ? (edge?.length ?? (parallelGuide ? guide.guide.length : undefined))
              : undefined,
          frame: freeStart
            ? { ...freeStart.frame, origin: picked?.point ?? freeStart.point }
            : edge && face
              ? sketchFrame(edge.point, face.normal)
              : parallelGuide
                ? sketchFrame(guide.point, guidePlaneNormal(guide.guide))
                : undefined,
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
      movingIds:
        props.tool === 'move' && selected
          ? props.selectedIds.includes(selected.id)
            ? [...props.selectedIds]
            : (moveIds ?? [selected.id])
          : undefined,
      extendSelection:
        props.tool === 'select' && (event.shiftKey || event.ctrlKey || event.metaKey),
    };
    if (props.tool === 'select') {
      selectionBounds = undefined;
      guideSelectionBounds = undefined;
    }
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
  const hoverSelection = (event: PointerEvent, whole: boolean) => {
    const props = current();
    if (whole) {
      // Match click priority: a guide in front of the solid belongs to the guide selection.
      const id = selectableGuideAt(event)
        ? undefined
        : (wireAt(event)?.object.userData.id ?? faceAt(event)?.target.bodyId);
      highlightFace();
      highlightEdge();
      show();
      props.onSelectionHover?.(id);
      // Keep E/O's direct face target even though Select displays the whole part.
      const face = id ? editableFaceAt(event)?.target : undefined;
      props.onFaceHover(face?.bodyId === id ? face : undefined);
      return;
    }
    props.onSelectionHover?.(undefined);
    const wire = props.tool === 'select' ? wireAt(event) : undefined;
    const edge = wire ? edgeAt(event, (_point, id) => id === wire.object.userData.id) : undefined;
    highlightEdge(edge?.edge);
    if (wire) {
      highlightFace();
      show({
        point: wire.point.toArray() as Vec3,
        key: wire.object.userData.id,
        label: 'Piirrosviiva',
      });
    } else {
      highlightFace(editableFaceAt(event)?.target);
      show();
    }
  };
  let navigating = false;
  const move = (event: PointerEvent) => {
    selectionPointerInside = true;
    lastEvent = event;
    // Camera drags do not acquire modeling targets. In particular, Move's
    // edge/intersection picking and whole-assembly hover updates can otherwise
    // rebuild textured materials for every point crossed while orbiting.
    if (
      event.buttons & 6 ||
      pointers.size > 1 ||
      (current().tool === 'navigate' && event.buttons)
    ) {
      if (!navigating) {
        navigating = true;
        hoveredReference = undefined;
        current().onMoveHover?.(undefined);
        current().onSelectionHover?.(undefined);
        highlightFace();
        highlightEdge();
        show();
      }
      return;
    }
    navigating = false;
    sync();
    if (drag && Math.hypot(event.clientX - drag.screenX, event.clientY - drag.screenY) > 4)
      drag.moved = true;
    const props = current();
    if (props.modalOpen) return;
    if (blocked || props.busy) return;
    if (drag?.selection) {
      if (drag.moved) boxSelection(event);
      highlightFace();
      show();
      return;
    }
    if (dimensionSession || (props.tool === 'measure' && props.measureMode === 'dimension')) {
      updateDimension(event);
      return;
    }
    const hoveredDimension = props.tool === 'select' ? dimensionHit(event)?.id : undefined;
    canvas.dataset.dimensionHover = hoveredDimension ?? '';
    container
      .querySelectorAll<SVGGElement>('.model-dimensions [data-dimension]')
      .forEach((g) => g.classList.toggle('is-hovered', g.dataset.dimension === hoveredDimension));
    if (hoveredDimension && !drag) {
      highlightFace();
      show();
      props.onSnap('Dimensio · napsauta valintaan, tuplaklikkaa tekstin muokkaukseen.');
      return;
    }

    if (props.tool === 'detail') {
      if (detailSession && drag) {
        updateDetail(event);
        return;
      }
      const edge = detailEdgeAt(event);
      highlightDetail(edge);
      props.onSnap(
        edge ? 'Reuna · vedä kokoa tai napsauta valintaan.' : 'Valitse kappaleen reuna.',
      );
      return;
    }
    if (props.tool === 'erase') {
      const guide = selectableGuideAt(event);
      const target = !guide ? boundaryAt(event) : undefined;
      highlightBoundary(target);
      highlightGuide(guide?.object.userData.guideId);
      props.onSnap(
        guide
          ? 'Poista apuviiva · napsauta korostettua viivaa.'
          : target
            ? 'Poista rajaus · korostetut tasopinnat yhdistyvät.'
            : wireAt(event)
              ? 'Poista piirrosviiva · napsauta viivaa.'
              : 'Osoita jakoviivaa, piirrosviivaa tai apuviivaa.',
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
            ? {
                point: handle.point,
                key: 'rotation-handle',
                label: `Kierrä · ${handle.name}`,
              }
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
    if (props.tool === 'select' && drag?.moved) {
      props.onSelectionHover?.(undefined);
      boxSelection(event);
      highlightFace();
      show();
      return;
    }
    if (props.tool === 'paint') {
      highlightFace(faceAt(event)?.target, true);
      show();
      return;
    }
    if (props.tool === 'select' || props.tool === 'offset') {
      hoverSelection(event, props.tool === 'select' && event.shiftKey);
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
          show({
            point: face.target.point,
            key: 'face',
            label: 'Vedä pintaa · E',
          });
        else show();
      }
      return;
    }
    if ((props.tool === 'rectangle' || props.tool === 'circle') && shapeSession?.sketch) {
      const sketch = shapeSession.sketch,
        start = shapeSession.start;
      const raw = framePoint(event, sketch);
      if (!raw) return;
      const end = frameSnap(raw, sketch, props.tool === 'rectangle' ? start : undefined, event),
        relative = { ...sketch, origin: start },
        delta = toUV(end, relative);
      let width =
          props.tool === 'circle'
            ? 2 * (props.radialShape === 'ellipse' ? Math.abs(delta[0]) : Math.hypot(...delta))
            : Math.abs(delta[0]),
        depth = props.tool === 'circle' ? 2 * Math.abs(delta[1]) : Math.abs(delta[1]);
      if (props.tool === 'circle' && props.gridSnap && canvas.dataset.snapKey === 'grid') {
        width = gridLength(width, props.gridStep);
        depth = gridLength(depth, props.gridStep);
      }

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
    if (['rectangle', 'circle'].includes(props.tool) && !drag) {
      // A reference may be inside a body; the drawing anchor must still stay on its surface.
      // Preserve Shift acquisition without turning that reference into the actual start point.
      hoveredReference = referenceAt(event);
      if (hoveredReference) {
        acquired = hoveredReference;
        acquiredAt = performance.now();
      }
      const picked = sketchStartAt(event);
      highlightFace(picked?.target, true);
      return;
    }
    if (props.tool === 'move' && !drag) {
      hoveredReference = undefined;
      const target = moveSnapAt(event, true);
      const hit = faceAt(event);
      const id = target?.bodyId ?? hit?.target.bodyId;
      const eligible =
        id &&
        (!props.selectedIds.length || props.selectedIds.includes(id)) &&
        !bodyById.get(id)?.locked;
      const count = props.onMoveHover?.(eligible ? id : undefined) ?? props.selectedIds.length;
      const label =
        props.selectedIds.length > 1
          ? `Siirrä valintaa · ${props.selectedIds.length} kappaletta`
          : count > 1
            ? `Siirrä kokoonpanoa · ${count} kappaletta`
            : 'Siirrä osoitettua osaa';
      show(
        eligible
          ? target
            ? { ...target, label: `${label} · ${target.label}` }
            : hit
              ? { point: hit.target.point, key: 'move-face', label }
              : undefined
          : undefined,
      );
      if (id && !eligible) props.onSnap('Valinta säilyy · Lisää osa Shift-klikkauksella.');
      canvas.dataset.moveSnap = target ? target.key : '';
      return;
    }
    if (props.tool === 'measure' && !measureSession && !props.pickReference) {
      const target = measureTargetAt(event, () => true);
      if (!target && props.measureMode === 'free') {
        const picked = sketchStartAt(event);
        highlightFace(picked?.target, true);
        return;
      }
      show(
        target?.key === 'edge-target'
          ? { ...target, label: 'Reuna · vedä rinnakkainen apuviiva' }
          : target,
      );
      return;
    }
    const hovered = referenceAt(event);
    hoveredReference = hovered;
    if (hovered) {
      acquired = hovered;
      acquiredAt = performance.now();
      if (!drag && !measureSession) show(hovered);
    } else if (!drag && !measureSession) show();
    if (props.pickReference) return;
    if (props.tool === 'measure' && measureSession) {
      if (!measureSession.editing || drag || props.freeRotate || props.guidePointEditing)
        updateMeasure(event);
      return;
    }
    if (props.tool === 'pen') {
      updatePen(event);
      return;
    }
    if (!drag || pointers.size > 1) return;
    if (props.tool === 'move') {
      const start = drag.start;
      if (!props.axis && props.moveMode !== 'free' && !drag.moveAxis) {
        const p = screen(start),
          length = worldPerPixel(start) * 100;
        const axes = (['x', 'y', 'z'] as const).map((axis) => {
          const q = screen(add(start, scale(axisVector(axis), length)));
          return [q.x - p.x, q.y - p.y] as [number, number];
        });
        drag.moveAxis = moveAxisFromScreen(
          [event.clientX - drag.screenX, event.clientY - drag.screenY],
          axes,
        );
      }
      const activeAxis = props.axis ?? (props.moveMode !== 'free' ? drag.moveAxis : undefined);
      const direction = activeAxis ? axisVector(activeAxis) : shiftDirection;
      if (!direction && props.moveMode !== 'free') return;
      canvas.dataset.moveAxis = activeAxis ?? 'free';
      const raw = direction
        ? linePoint(event, start, direction)
        : planePoint(event, drag.plane, start);
      if (!raw) return;
      const target = moveSnapAt(event, false);
      let end: Vec3;
      let indication: Snap;
      if (target) {
        end = direction ? projectOnLine(target.point, start, direction) : target.point;
        indication = {
          ...target,
          point: end,
          label: direction
            ? `${activeAxis?.toUpperCase() ?? 'Shift'} · Akselin mitta · ${target.label}`
            : `Tartunta · ${target.label}`,
          line: direction ? [target.point, end] : undefined,
        };
      } else {
        const delta = sub(raw, start);
        end = props.gridSnap
          ? add(start, delta.map((n) => Math.round(n / props.gridStep) * props.gridStep) as Vec3)
          : raw;
        indication = {
          point: end,
          key: props.gridSnap ? 'move-grid' : 'move-free',
          label: `${activeAxis?.toUpperCase() ?? 'Vapaa'} · ${props.gridSnap ? `Siirtymä · ${props.gridStep} mm ruudukko` : 'Siirtymä'}`,
          line: direction ? [start, end] : undefined,
        };
      }
      hoveredReference = undefined;
      show(indication, drag.plane);
      canvas.dataset.moveSnap = indication.key;
      canvas.dataset.moveEnd = JSON.stringify(end);
      showMoveAxis(activeAxis, start, end);
      props.onGesture({
        type: 'move',
        axis: activeAxis,
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
    if (pickingOther || current().modalOpen) {
      pickingOther = false;
      pointers.delete(event.pointerId);
      drag = undefined;
      rotationDrag = undefined;
      dimensionPress = undefined;
      detailSession = undefined;
      clearSelectionBox();
      if (!pointers.size) blocked = false;
      return;
    }
    if (event.button === 2) {
      if (
        contextStart &&
        Math.hypot(event.clientX - contextStart.x, event.clientY - contextStart.y) < 5 &&
        !current().busy
      ) {
        const targets = guideEndpointsAt(event);
        const dimension = current().tool === 'select' ? dimensionHit(event) : undefined;
        const guide = selectableGuideAt(event);
        const picked = faceAt(event);
        if (targets.length && !dimension)
          current().onGuidePointMenu({ x: event.clientX, y: event.clientY, targets });
        else
          current().onContextMenu({
            x: event.clientX,
            y: event.clientY,
            bodyId: picked?.target.bodyId,
            dimensionId: dimension?.id,
            guideId: guide?.object.userData.guideId,
            candidates: pickCandidatesAt(event),
          });
      }
      contextStart = undefined;
    }
    if (event.button !== 0) return;
    showMoveAxis();
    const props = current(),
      active = drag;
    if (dimensionPress && event.pointerId === dimensionPress.id) {
      const pressed = dimensionPress;
      dimensionPress = undefined;
      pointers.delete(event.pointerId);
      if (
        dimensionSession?.editing &&
        Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) < 4
      ) {
        dimensionSession = undefined;
        props.onDimensionPreview(undefined);
        return;
      }
      if (
        dimensionSession?.stage === 'place' &&
        (pressed.stage === 'place' ||
          (pressed.stage === 'end' &&
            Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) > 4))
      ) {
        updateDimension(event);
        const d = dimensionSession.dimension;
        dimensionSession = undefined;
        if (pointDimensionGeometry(props.bodies, d).value >= 0.1) props.onDimensionCommit(d);
      }
      return;
    }
    const previousEmptyClicks = emptySelectionClicks;
    emptySelectionClicks = 0;
    if (active && !blocked && !props.busy) {
      const moved =
        active.moved ||
        Math.hypot(event.clientX - active.screenX, event.clientY - active.screenY) > 4;
      if (active.selection) {
        if (moved) {
          const selected = boxSelection(event);
          props.onSelectMany(
            selected.ids,
            !!active.extendSelection || event.shiftKey,
            selected.guideIds,
            selected.dimensionIds,
          );
        } else if (active.extendSelection && active.selectionBodyId)
          props.onSelect(active.selectionBodyId, undefined, true);
        // An empty click in a tool is not a request to discard a prepared selection.
      } else if (props.tool === 'detail') {
        if (event.button !== 0 || (detailSession && event.pointerId !== detailSession.pointerId))
          return;
        if (detailSession?.started) {
          // Keep the last pointer value or typed dimension, just like Offset.
          current().onAccept();
        } else if (!moved) {
          const edge = detailEdgeAt(event);
          if (edge) props.onDetailEdge(edge.bodyId, edge.index);
          else {
            const hit = faceAt(event);
            if (hit && props.bodies.find((b) => b.id === hit.target.bodyId)?.edgeTreatment)
              props.onDetailEdge(hit.target.bodyId, -1);
          }
        }
        detailSession = undefined;
        canvas.dataset.detailDragging = '';
        show();
      } else if (props.tool === 'erase' && !moved) {
        const guide = selectableGuideAt(event);
        if (guide) props.onRemoveGuide(guide.object.userData.guideId);
        else if (wireAt(event)) props.onRemoveWire(wireAt(event)!.object.userData.id);
        else {
          const target = boundaryAt(event);
          if (target) props.onRemoveBoundary(target);
        }
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
      } else if (props.tool === 'select' && moved) {
        const { ids, guideIds, dimensionIds } = boxSelection(event);
        clearSelectionBox();
        props.onSelectMany(
          ids,
          !!active.extendSelection || event.shiftKey || event.ctrlKey || event.metaKey,
          guideIds,
          dimensionIds,
        );
      } else if (props.tool === 'select' && !moved) {
        // Remember modifiers from press time too: releasing Shift just before the
        // mouse button must not replace the selection the user was extending.
        const extend = !!active.extendSelection || event.shiftKey || event.ctrlKey || event.metaKey;
        const guideHit = selectableGuideAt(event);
        if (guideHit) {
          props.onSelectGuide(guideHit.object.userData.guideId, extend);
          pointers.delete(event.pointerId);
          drag = undefined;
          return;
        }
        const wire = wireAt(event);
        if (wire) {
          if (!editBlocked(event, wire.object.userData.id))
            props.onSelect(wire.object.userData.id, undefined, extend);
          pointers.delete(event.pointerId);
          drag = undefined;
          return;
        }
        const hit = faceAt(event)?.hit;
        if (hit) {
          const faces = hit.object.userData.faces as BodyMesh['faces'],
            index = (hit.faceIndex ?? 0) * 3;
          if (!editBlocked(event, hit.object.userData.id))
            props.onSelect(
              hit.object.userData.id,
              faces.find((f) => index >= f.start && index < f.start + f.count)?.ref,
              extend,
            );
        } else {
          if (!extend && !event.altKey) emptySelectionClicks = Math.min(2, previousEmptyClicks + 1);
          props.onSelect(undefined, undefined, extend);
        }
      } else if (props.tool === 'pen') {
        const point = !props.penPoints.length && penPressPoint ? penPressPoint : updatePen(event);
        penPressPoint = undefined;
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
        props.onAccept(
          props.measureMode === 'free' && !measureSession?.editing && !props.guidePointEditing,
        );
        measureSession = undefined;
      } else if (moved && ['rectangle', 'circle', 'move'].includes(props.tool)) {
        move(event);
        props.onAccept();
      }
    }
    if (detailSession) {
      cancelDetailDrag();
      show();
    }
    clearSelectionBox();
    pointers.delete(event.pointerId);
    drag = undefined;
    rotationDrag = undefined;
    if (!pointers.size) blocked = false;
  };
  const cancel = (event: PointerEvent) => {
    clearSelectionBox();
    cancelDetailDrag();
    if (dimensionSession) {
      dimensionSession = undefined;
      dimensionPress = undefined;
      current().onDimensionPreview(undefined);
    }
    show();
    emptySelectionClicks = 0;
    pointers.delete(event.pointerId);
    drag = undefined;
    extrudeSession = undefined;
    shapeSession = undefined;
    canvas.dataset.depthTarget = '';
    canvas.dataset.depthKind = '';
    rotationDrag = undefined;
    if (!pointers.size) blocked = false;
  };
  let controlCopyBefore: boolean | undefined;
  const keydown = (event: KeyboardEvent) => {
    if (controlCopyBefore !== undefined && event.ctrlKey && event.key !== 'Control') {
      current().onCopyMove(controlCopyBefore);
      controlCopyBefore = undefined;
    }
    if (
      current().modalOpen ||
      (event.target as HTMLElement).closest(
        'input,textarea,select,[contenteditable],[role=menu],[role=dialog]',
      )
    )
      return;
    if ((event.key === 'Control' || event.key === 'Alt') && current().tool === 'move') {
      event.preventDefault();
      if (!event.repeat) {
        if (event.key === 'Control') controlCopyBefore = current().copyMove;
        current().onCopyMove(!current().copyMove);
      }
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
    if (
      ['x', 'y', 'z'].includes(key) &&
      ['pen', 'measure', 'move', 'rectangle', 'circle'].includes(props.tool)
    ) {
      event.preventDefault();
      props.onAxis(props.axis === key ? undefined : (key as Axis));
      return;
    }
    if (event.key === 'Shift' && !event.repeat) {
      shift = true;
      if (
        props.tool === 'select' &&
        selectionPointerInside &&
        lastEvent &&
        !drag?.moved &&
        !props.busy
      ) {
        hoverSelection(lastEvent, true);
      }
      // In Select, Shift belongs exclusively to object multiselection.
      if (
        props.tool === 'select' ||
        drag?.selection ||
        (['move', 'rotate', 'offset', 'detail', 'erase', 'paint', 'boolean'].includes(props.tool) &&
          !drag &&
          !offsetSession &&
          !props.rotation?.picking)
      )
        return;
      if (props.tool === 'rotate') {
        if (rotationDrag && lastEvent) updateRotation(lastEvent);
        return;
      }
      if (props.tool === 'move') {
        if (drag && lastEvent) {
          const p = planePoint(lastEvent, drag.plane, drag.start);
          if (p) {
            const d = sub(p, drag.start);
            const i = d.map(Math.abs).indexOf(Math.max(...d.map(Math.abs)));
            shiftDirection = axisVector((['x', 'y', 'z'] as const)[i]);
          }
        }
        return;
      }
      if (props.tool === 'extrude') {
        if (!props.busy && !props.pickDepth && lastEvent) {
          // E can already select the hovered face. Shift must also work before
          // an additional source click, just like typing a depth in that state.
          if (!extrudeSession && props.faceTarget) {
            startExtrusion(props.faceTarget, lastEvent, props.faceDistance);
            props.onStart();
          }
          updateExtrusion(lastEvent);
        }
        return;
      }
      if (props.tool === 'measure' && props.measureMode === 'free' && !props.freeRotate) {
        const start = measureSession && resolveAnchor(props.bodies, measureSession.anchor);
        const end = measureSession?.end;
        measureShiftPending = !props.axis;
        if (!props.axis && start && end && Math.hypot(...sub(end, start)) > 0.01) {
          shiftDirection = unit(sub(end, start));
          measureShiftPending = false;
          props.onConstraint(shiftDirection);
        }
        if (lastEvent && measureSession) updateMeasure(lastEvent);
        return;
      }
      if (props.tool === 'pen') {
        penShiftPending = !props.axis;
        if (props.penPoints.length && lastPenPoint && !props.axis) {
          const delta = sub(lastPenPoint, props.penPoints.at(-1)!);
          if (Math.hypot(...delta) > 0.01) {
            shiftDirection = unit(delta);
            penShiftPending = false;
            props.onConstraint(shiftDirection);
          }
        }
        if (props.penPoints.length && lastEvent) updatePen(lastEvent);
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
    if (event.key === 'Shift') current().onSelectionHover?.(undefined);
    if (event.key === 'Control') controlCopyBefore = undefined;
    if (current().modalOpen) {
      if (event.key === 'Shift') {
        shift = false;
        measureShiftPending = false;
        if (current().tool === 'measure' && current().measureMode === 'free') {
          shiftDirection = undefined;
          current().onConstraint(current().axis ? axisVector(current().axis!) : undefined);
        }
      }
      return;
    }
    if (event.key === 'Shift') {
      shift = false;
      if (
        current().tool === 'select' &&
        selectionPointerInside &&
        lastEvent &&
        !drag?.moved &&
        !current().busy
      ) {
        hoverSelection(lastEvent, false);
      }
      penShiftPending = false;
      measureShiftPending = false;
      if (current().tool === 'rotate' && rotationDrag && lastEvent) updateRotation(lastEvent);
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
      if (current().tool === 'pen' && lastEvent) updatePen(lastEvent);
      if (
        current().tool === 'measure' &&
        current().measureMode === 'free' &&
        measureSession &&
        lastEvent
      )
        updateMeasure(lastEvent);
    }
  };
  const blur = () => {
    selectionPointerInside = false;
    current().onSelectionHover?.(undefined);
    clearSelectionBox();
    cancelDetailDrag();
    if (dimensionSession) {
      dimensionSession = undefined;
      dimensionPress = undefined;
      current().onDimensionPreview(undefined);
    }
    emptySelectionClicks = 0;
    shift = false;
    penShiftPending = false;
    measureShiftPending = false;
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
    delete canvas.dataset.dimensionHover;
    container
      .querySelectorAll('.model-dimensions .is-hovered')
      .forEach((el) => el.classList.remove('is-hovered'));
    selectionPointerInside = false;
    current().onSelectionHover?.(undefined);
    if (!drag) current().onMoveHover?.(undefined);
    if (current().tool === 'detail') {
      if (!detailSession?.started) highlightDetail();
      return;
    }
    if (!drag && !measureSession) {
      highlightGuide();
      highlightBoundary();
      highlightEdge();
      highlightFace();
      show();
    }
  };
  const doubleClick = (event: MouseEvent) => {
    if (
      !['select', 'measure'].includes(current().tool) ||
      current().busy ||
      current().modalOpen ||
      event.button !== 0 ||
      event.shiftKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    )
      return;
    const dimension = current().tool === 'select' ? dimensionHit(event as PointerEvent) : undefined;
    if (dimension) {
      current().onSelectDimension?.(dimension.id, false, true);
      return;
    }
    const targets = guideEndpointsAt(event as PointerEvent);
    if (targets.length) {
      if (targets.length === 1) current().onEditGuidePoint(targets[0]);
      else current().onGuidePointMenu({ x: event.clientX, y: event.clientY, targets });
      return;
    }
    if (current().tool !== 'select') return;
    const target = editableFaceAt(event as PointerEvent);
    if (target) current().onEditBody(target.target.bodyId);
    else if ((current().editingBodyId || current().scopeIds) && emptySelectionClicks === 2)
      current().onCloseBodyEdit();
    emptySelectionClicks = 0;
  };
  canvas.addEventListener('contextmenu', contextEvent);
  canvas.addEventListener('dblclick', doubleClick);
  canvas.addEventListener('pointerleave', leave);
  const activePointers = new Set<number>();
  const trackDown = (event: PointerEvent) => {
    activePointers.add(event.pointerId);
    canvas.dataset.pointerActive = 'true';
  };
  const trackUp = (event: PointerEvent) => {
    activePointers.delete(event.pointerId);
    if (!activePointers.size) delete canvas.dataset.pointerActive;
  };
  const trackBlur = () => {
    activePointers.clear();
    delete canvas.dataset.pointerActive;
  };
  canvas.addEventListener('pointerdown', trackDown, true);
  window.addEventListener('pointerup', trackUp, true);
  window.addEventListener('pointercancel', trackUp, true);
  window.addEventListener('blur', trackBlur);
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
      canvas.removeEventListener('contextmenu', contextEvent);
      canvas.removeEventListener('dblclick', doubleClick);
      canvas.removeEventListener('pointerleave', leave);
      canvas.removeEventListener('pointerdown', trackDown, true);
      window.removeEventListener('pointerup', trackUp, true);
      window.removeEventListener('pointercancel', trackUp, true);
      window.removeEventListener('blur', trackBlur);
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', keydown, true);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', blur);
      moveAxisLabel.remove();
      hint.remove();
      selectionBox.remove();
      scene.remove(overlay);
      overlay.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line || o instanceof THREE.Points) {
          o.geometry.dispose();
          if (o instanceof THREE.Points) (o.material as THREE.PointsMaterial).map?.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
    },
  };
}
