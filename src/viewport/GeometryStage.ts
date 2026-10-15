import * as THREE from 'three';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import {
  edgeLoop,
  geometryEdges,
  patchPoints,
  transformGeometryPoints,
  type EditableGeometry,
  type GeometryOperation,
  type GeometrySelection,
} from '../model/geometryEditing';
import type { Vec3 } from '../model/project';

export interface GeometryStageProps {
  bodyId: string;
  cancelToken: number;
  geometry: EditableGeometry;
  points: Vec3[];
  selected: number[];
  mode: GeometrySelection;
  operation: GeometryOperation;
  pivot: Vec3;
  frame: [number, number, number, number];
  axes: [boolean, boolean, boolean];
  xray: boolean;
  allEdges: boolean;
  picking?: 'pivot' | 'reference';
  snap: number;
  uniformScale: boolean;
  disabled: boolean;
  onSelect: (ids: number[], extend: boolean) => void;
  onPick: (point: Vec3) => void;
  onTransform: (points: Vec3[], complete: boolean) => void;
  onError: (message: string) => void;
}
export function installGeometryStage({
  container: el,
  canvas,
  scene: world,
  camera: getCamera,
  controls: getControls,
  current,
  render: invalidate,
  referenceAt,
}: {
  container: HTMLElement;
  canvas: HTMLCanvasElement;
  scene: THREE.Scene;
  camera: () => THREE.PerspectiveCamera | THREE.OrthographicCamera;
  controls: () => OrbitControls;
  current: () => GeometryStageProps;
  render: () => void;
  referenceAt: (event: PointerEvent | MouseEvent) => Vec3 | undefined;
}) {
  const scene = new THREE.Group();
  scene.name = 'geometry-editing-overlays';
  world.add(scene);
  const g = current().geometry,
    geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      g.vertexMap.flatMap((i) => current().points[i]),
      3,
    ),
  );
  geometry.setIndex(g.sourceTriangles);
  geometry.computeVertexNormals();
  const surface = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: '#c2d3d8',
      roughness: 0.85,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    }),
  );
  geometry.boundsTree = new MeshBVH(geometry, { indirect: true });
  surface.raycast = acceleratedRaycast;
  scene.add(surface);
  const lines = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: '#426b7a' }),
  );
  const activeLines = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: '#ed7c23', depthTest: false }),
  );
  activeLines.renderOrder = 5;
  scene.add(lines, activeLines);
  const icon = document.createElement('canvas');
  icon.width = icon.height = 32;
  const ctx = icon.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(16, 16, 15, 0, Math.PI * 2);
  ctx.fill();
  const map = new THREE.CanvasTexture(icon);
  const markers = new THREE.Points(
    new THREE.BufferGeometry(),
    new THREE.PointsMaterial({
      map,
      alphaTest: 0.5,
      size: 8,
      sizeAttenuation: false,
      vertexColors: true,
      depthWrite: false,
    }),
  );
  scene.add(markers);
  const pickedFaces = new THREE.Mesh(
    new THREE.BufferGeometry(),
    new THREE.MeshBasicMaterial({
      color: '#f39842',
      transparent: true,
      opacity: 0.38,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );
  scene.add(pickedFaces);
  const hoverPoint = new THREE.Points(
    new THREE.BufferGeometry(),
    new THREE.PointsMaterial({
      map,
      alphaTest: 0.5,
      size: 13,
      sizeAttenuation: false,
      color: '#ff9b36',
      depthTest: false,
    }),
  );
  const hoverEdge = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: '#ff8b26', depthTest: false }),
  );
  const hoverFace = new THREE.Mesh(
    new THREE.BufferGeometry(),
    new THREE.MeshBasicMaterial({
      color: '#ffb25e',
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    }),
  );
  hoverPoint.renderOrder = hoverEdge.renderOrder = 8;
  scene.add(hoverPoint, hoverEdge, hoverFace);
  const pivotMarker = new THREE.Mesh(
    new THREE.SphereGeometry(1, 12, 8),
    new THREE.MeshBasicMaterial({ color: '#b851ba', depthTest: false }),
  );
  pivotMarker.renderOrder = 9;
  scene.add(pivotMarker);
  const handle = new THREE.Object3D();
  scene.add(handle);
  const transform = new TransformControls(getCamera(), canvas);
  transform.size = 0.8;
  scene.add(transform.getHelper());
  const ray = new THREE.Raycaster(),
    ndc = new THREE.Vector2();
  ray.firstHitOnly = true;
  let lastCancel = current().cancelToken;
  let edges = geometryEdges(g),
    disposed = false,
    dragged = false;
  let dragReference: Vec3 | undefined;
  let shiftHeld = false;
  let dragBase: Vec3[] | undefined,
    dragIds: number[] = [],
    dragInverse = new THREE.Matrix4();
  let start:
    | {
        x: number;
        y: number;
        shift: boolean;
        grab?: {
          anchor: Vec3;
          ids: number[];
          base: Vec3[];
          plane: THREE.Plane;
          origin: THREE.Vector3;
          active: boolean;
          axis?: number;
          next?: Vec3[];
        };
      }
    | undefined;
  const touches = new Set<number>();
  const box = document.createElement('div');
  box.className = 'geometry-box-selection';
  box.hidden = true;
  el.append(box);
  const project = (p: Vec3) => new THREE.Vector3(...p).project(getCamera());
  const pointer = (event: PointerEvent | MouseEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: event.clientX - r.left, y: event.clientY - r.top };
  };
  const rayAt = (x: number, y: number) => {
    ndc.set((x / canvas.clientWidth) * 2 - 1, 1 - (y / canvas.clientHeight) * 2);
    ray.setFromCamera(ndc, getCamera());
  };
  const visible = (point: Vec3) => {
    if (current().xray) return true;
    const p = project(point);
    rayAt(((p.x + 1) * canvas.clientWidth) / 2, ((1 - p.y) * canvas.clientHeight) / 2);
    const hit = ray.intersectObject(surface, false)[0];
    return (
      !hit ||
      hit.distance +
        Math.max(0.002, getCamera().position.distanceTo(getControls().target) * 0.00002) >=
        ray.ray.origin.distanceTo(new THREE.Vector3(...point))
    );
  };
  const pointAt = (x: number, y: number) => {
    let best = -1,
      score = Infinity;
    current().points.forEach((p, i) => {
      const q = project(p);
      if (q.z < -1 || q.z > 1) return;
      const distance = Math.hypot(
        ((q.x + 1) * canvas.clientWidth) / 2 - x,
        ((1 - q.y) * canvas.clientHeight) / 2 - y,
      );
      const s = distance + q.z * 0.01;
      if (distance <= 13 && s < score && visible(p)) {
        score = s;
        best = i;
      }
    });
    return best;
  };
  const edgeAt = (x: number, y: number) => {
    let best = -1,
      score = Infinity;
    edges.forEach((edge, i) => {
      const a = project(current().points[edge.a]),
        b = project(current().points[edge.b]);
      if (a.z > 1 || b.z > 1) return;
      const ax = ((a.x + 1) * canvas.clientWidth) / 2,
        ay = ((1 - a.y) * canvas.clientHeight) / 2,
        bx = ((b.x + 1) * canvas.clientWidth) / 2,
        by = ((1 - b.y) * canvas.clientHeight) / 2;
      const t = THREE.MathUtils.clamp(
        ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) /
          Math.max(1e-12, (bx - ax) ** 2 + (by - ay) ** 2),
        0,
        1,
      );
      const distance = Math.hypot(x - ax - (bx - ax) * t, y - ay - (by - ay) * t);
      const point = new THREE.Vector3(...current().points[edge.a])
        .lerp(new THREE.Vector3(...current().points[edge.b]), t)
        .toArray();
      if (distance < 11 && distance < score && visible(point)) {
        best = i;
        score = distance;
      }
    });
    return best;
  };
  const hitSelection = (x: number, y: number): { ids: number[]; anchor: Vec3 } | undefined => {
    const p = current();
    if (p.mode === 'points') {
      const i = pointAt(x, y);
      return i < 0 ? undefined : { ids: [i], anchor: p.points[i] };
    }
    if (p.mode === 'edges') {
      const i = edgeAt(x, y);
      if (i < 0) return;
      const edge = edges[i],
        a = new THREE.Vector3(...p.points[edge.a]),
        b = new THREE.Vector3(...p.points[edge.b]);
      rayAt(x, y);
      const anchor = new THREE.Vector3();
      ray.ray.distanceSqToSegment(a, b, undefined, anchor);
      return { ids: [edge.a, edge.b], anchor: anchor.toArray() };
    }
    rayAt(x, y);
    const hit = ray.intersectObject(surface, false)[0];
    return hit?.faceIndex == null
      ? undefined
      : { ids: patchPoints(g, hit.faceIndex), anchor: hit.point.toArray() };
  };
  const selectAt = (
    x: number,
    y: number,
    extend: boolean,
    loop = false,
    event?: PointerEvent | MouseEvent,
  ) => {
    const p = current();
    if (p.picking) {
      const point = pointAt(x, y);
      const reference = event && referenceAt(event);
      if (point >= 0) p.onPick(p.points[point]);
      else if (reference) p.onPick(reference);
      return;
    }
    if (p.mode === 'points') {
      const point = pointAt(x, y);
      p.onSelect(point >= 0 ? [point] : [], extend);
    } else if (p.mode === 'edges') {
      const edge = edgeAt(x, y);
      p.onSelect(
        edge >= 0 ? (loop ? edgeLoop(edges, edge, p.points) : [edges[edge].a, edges[edge].b]) : [],
        extend,
      );
    } else {
      rayAt(x, y);
      const hit = ray.intersectObject(surface, false)[0];
      p.onSelect(
        hit?.faceIndex !== undefined && hit.faceIndex !== null ? patchPoints(g, hit.faceIndex) : [],
        extend,
      );
    }
  };
  const clearHover = () => {
    hoverPoint.visible = hoverEdge.visible = hoverFace.visible = false;
    canvas.style.cursor = current().picking ? 'crosshair' : 'default';
    invalidate();
  };
  const hoverAt = (x: number, y: number, event: PointerEvent) => {
    clearHover();
    const p = current();
    if (p.disabled || transform.axis) return;
    let vertices: Vec3[] = [],
      object: THREE.Points | THREE.LineSegments | THREE.Mesh;
    if (p.mode === 'points' || p.picking) {
      const i = pointAt(x, y);
      if (i >= 0) vertices = [p.points[i]];
      else if (p.picking) {
        const reference = referenceAt(event);
        if (reference) vertices = [reference];
      }
      object = hoverPoint;
    } else if (p.mode === 'edges') {
      const i = edgeAt(x, y);
      if (i >= 0) vertices = [p.points[edges[i].a], p.points[edges[i].b]];
      object = hoverEdge;
    } else {
      rayAt(x, y);
      const hit = ray.intersectObject(surface, false)[0];
      if (hit?.faceIndex != null) {
        const patch = g.patches[hit.faceIndex];
        vertices = g.triangles.flatMap((v, i) =>
          g.patches[Math.floor(i / 3)] === patch ? [p.points[v]] : [],
        );
      }
      object = hoverFace;
    }
    if (vertices.length) {
      object.geometry.dispose();
      object.geometry = new THREE.BufferGeometry().setFromPoints(
        vertices.map((v) => new THREE.Vector3(...v)),
      );
      object.visible = true;
      canvas.style.cursor = 'crosshair';
    }
  };
  const pointerDown = (event: PointerEvent) => {
    if (event.pointerType === 'touch') {
      touches.add(event.pointerId);
      if (touches.size > 1) {
        if (start?.grab?.active) current().onTransform(start.grab.base, false);
        getControls().enabled = true;
        start = undefined;
        box.hidden = true;
        clearHover();
        return;
      }
    }
    if (event.button !== 0 || current().disabled) return;
    clearHover();
    canvas.focus({ preventScroll: true });
    dragged = transform.dragging;
    const p = pointer(event);
    start = { ...p, shift: event.shiftKey };
    if (!dragged && !current().picking && !event.shiftKey && current().operation === 'move') {
      const hit = hitSelection(p.x, p.y);
      if (hit) {
        rayAt(p.x, p.y);
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
          getCamera().getWorldDirection(new THREE.Vector3()),
          new THREE.Vector3(...hit.anchor),
        );
        const origin = ray.ray.intersectPlane(plane, new THREE.Vector3());
        if (origin)
          start.grab = {
            ...hit,
            ids: hit.ids.every((i) => current().selected.includes(i))
              ? [...current().selected]
              : hit.ids,
            base: current().points,
            plane,
            origin,
            active: false,
          };
      }
    }
    if (!dragged) canvas.setPointerCapture(event.pointerId);
  };
  const pointerMove = (event: PointerEvent) => {
    shiftHeld = event.shiftKey;
    transform.setRotationSnap(shiftHeld ? null : Math.PI / 36);
    if (transform.dragging && dragBase && current().operation === 'move') {
      dragReference = event.shiftKey ? referenceAt(event) : undefined;
      if (dragReference)
        current().onTransform(transformGeometryPoints(dragBase, dragIds, dragMatrix()), false);
    }
    if (!start && !event.buttons) {
      const p = pointer(event);
      hoverAt(p.x, p.y, event);
      return;
    }
    if (!start || transform.dragging || dragged || current().picking) return;
    const p = pointer(event),
      distance = Math.hypot(p.x - start.x, p.y - start.y);
    if (distance < 5) return;
    if (start.grab) {
      const grab = start.grab;
      if (!grab.active) {
        current().onSelect(grab.ids, false);
        grab.active = true;
        getControls().enabled = false;
      }
      rayAt(p.x, p.y);
      const point = ray.ray.intersectPlane(grab.plane, new THREE.Vector3());
      if (!point) return;
      const q = new THREE.Quaternion(...current().frame);
      const reference = event.shiftKey ? referenceAt(event) : undefined;
      const delta = (
        reference
          ? new THREE.Vector3(...reference).sub(new THREE.Vector3(...grab.anchor))
          : point.sub(grab.origin)
      ).applyQuaternion(q.clone().invert());
      const enabled = current().axes.flatMap((on, i) => (on ? [i] : []));
      if (enabled.length === 1) grab.axis = enabled[0];
      else if (grab.axis === undefined || !enabled.includes(grab.axis))
        grab.axis = enabled.sort(
          (a, b) => Math.abs(delta.getComponent(b)) - Math.abs(delta.getComponent(a)),
        )[0];
      for (let i = 0; i < 3; i++) {
        let value = i === grab.axis ? delta.getComponent(i) : 0;
        if (!reference && current().snap)
          value = Math.round(value / current().snap) * current().snap;
        delta.setComponent(i, value);
      }
      delta.applyQuaternion(q);
      grab.next = transformGeometryPoints(
        grab.base,
        grab.ids,
        new THREE.Matrix4().makeTranslation(...delta.toArray()),
      );
      current().onTransform(grab.next, false);
      return;
    }
    box.hidden = false;
    Object.assign(box.style, {
      left: `${Math.min(start.x, p.x)}px`,
      top: `${Math.min(start.y, p.y)}px`,
      width: `${Math.abs(p.x - start.x)}px`,
      height: `${Math.abs(p.y - start.y)}px`,
    });
  };
  const pointerUp = (event: PointerEvent) => {
    touches.delete(event.pointerId);
    if (event.button !== 0 || !start) return;
    const from = start;
    start = undefined;
    if (from.grab?.active) {
      getControls().enabled = true;
      if (from.grab.next) current().onTransform(from.grab.next, true);
      return;
    }
    if (dragged) {
      dragged = false;
      box.hidden = true;
      return;
    }
    const p = pointer(event);
    if (!box.hidden) {
      box.hidden = true;
      const ids: number[] = [];
      current().points.forEach((point, i) => {
        const v = project(point),
          x = ((v.x + 1) * canvas.clientWidth) / 2,
          y = ((1 - v.y) * canvas.clientHeight) / 2;
        if (
          v.z >= -1 &&
          v.z <= 1 &&
          x >= Math.min(from.x, p.x) &&
          x <= Math.max(from.x, p.x) &&
          y >= Math.min(from.y, p.y) &&
          y <= Math.max(from.y, p.y) &&
          visible(point)
        )
          ids.push(i);
      });
      current().onSelect(ids, from.shift);
    } else selectAt(p.x, p.y, from.shift, false, event);
  };
  const doubleClick = (event: MouseEvent) => {
    if (transform.dragging || current().disabled) return;
    const p = pointer(event);
    selectAt(p.x, p.y, event.shiftKey, true, event);
  };
  const context = (e: Event) => e.preventDefault();
  const update = () => {
    if (disposed) return;
    transform.camera = getCamera();
    if (lastCancel !== current().cancelToken) {
      lastCancel = current().cancelToken;
      dragBase = undefined;
      dragReference = undefined;
      start = undefined;
      box.hidden = true;
      transform.reset();
      transform.dragging = false;
      getControls().enabled = true;
    }
    clearHover();
    const p = current(),
      selected = new Set(p.selected);
    const position = geometry.getAttribute('position') as THREE.BufferAttribute;
    g.vertexMap.forEach((index, i) => position.setXYZ(i, ...p.points[index]));
    position.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    geometry.boundsTree?.refit();
    edges = geometryEdges({ ...g, points: p.points }, p.allEdges);
    lines.geometry.dispose();
    lines.geometry = new THREE.BufferGeometry().setFromPoints(
      edges.flatMap((e) => [
        new THREE.Vector3(...p.points[e.a]),
        new THREE.Vector3(...p.points[e.b]),
      ]),
    );
    const chosenEdges = edges.filter((e) => selected.has(e.a) && selected.has(e.b));
    activeLines.geometry.dispose();
    activeLines.geometry = new THREE.BufferGeometry().setFromPoints(
      chosenEdges.flatMap((e) => [
        new THREE.Vector3(...p.points[e.a]),
        new THREE.Vector3(...p.points[e.b]),
      ]),
    );
    markers.geometry.dispose();
    markers.geometry = new THREE.BufferGeometry().setFromPoints(
      p.points.map((point) => new THREE.Vector3(...point)),
    );
    markers.geometry.setAttribute(
      'color',
      new THREE.Float32BufferAttribute(
        p.points.flatMap((_, i) =>
          new THREE.Color(selected.has(i) ? '#ef7b20' : '#2d655a').toArray(),
        ),
        3,
      ),
    );
    markers.material.depthTest = !p.xray;
    markers.visible = p.mode === 'points' || !!p.picking;
    const selectedTriangles = g.triangles.filter((_, i) => {
      const start = Math.floor(i / 3) * 3;
      return g.triangles.slice(start, start + 3).every((v) => selected.has(v));
    });
    pickedFaces.geometry.dispose();
    pickedFaces.geometry = new THREE.BufferGeometry().setFromPoints(
      p.points.map((point) => new THREE.Vector3(...point)),
    );
    pickedFaces.geometry.setIndex(selectedTriangles);
    if (dragReference && transform.dragging) {
      hoverPoint.geometry.dispose();
      hoverPoint.geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(...dragReference),
      ]);
      hoverPoint.visible = true;
    }
    pivotMarker.position.set(...p.pivot);
    pivotMarker.scale.setScalar(
      Math.max(0.005, getCamera().position.distanceTo(getControls().target) * 0.003),
    );
    pivotMarker.visible = !!p.selected.length;
    transform.enabled = !p.disabled && !p.picking;
    transform.showX = p.axes[0];
    transform.showY = p.axes[1];
    transform.showZ = p.axes[2];
    transform.showXY = false;
    transform.showXZ = false;
    transform.showYZ = false;
    transform.showE = false;
    transform.showXYZE = false;
    transform.setMode(
      ({ move: 'translate', rotate: 'rotate', scale: 'scale' } as const)[p.operation],
    );
    transform.setSpace('local');
    transform.setTranslationSnap(null);
    transform.setRotationSnap(shiftHeld ? null : Math.PI / 36);
    if (!transform.dragging) {
      handle.position.set(...p.pivot);
      handle.quaternion.set(...p.frame);
      handle.scale.set(1, 1, 1);
      handle.updateMatrixWorld();
      if (p.selected.length && !p.picking) transform.attach(handle);
      else transform.detach();
    }
    invalidate();
  };
  transform.addEventListener('mouseDown', () => {
    dragged = true;
    dragReference = undefined;
    dragBase = current().points;
    dragIds = [...current().selected];
    handle.updateMatrixWorld();
    dragInverse.copy(handle.matrixWorld).invert();
    getControls().enabled = false;
  });
  const dragMatrix = () => {
    const p = current();
    if (dragReference && p.operation === 'move') {
      const q = new THREE.Quaternion(...p.frame);
      const delta = new THREE.Vector3(...dragReference)
        .sub(new THREE.Vector3(...p.pivot))
        .applyQuaternion(q.clone().invert());
      const axis = ['X', 'Y', 'Z'].indexOf(transform.axis ?? '');
      for (let i = 0; i < 3; i++)
        if (!p.axes[i] || (axis >= 0 && axis !== i)) delta.setComponent(i, 0);
      return new THREE.Matrix4().makeTranslation(...delta.applyQuaternion(q).toArray());
    }
    // Quantize displacement, never the absolute anchor position.
    if (p.operation === 'move' && p.snap) {
      const q = new THREE.Quaternion(...p.frame);
      const delta = handle.position
        .clone()
        .sub(new THREE.Vector3(...p.pivot))
        .applyQuaternion(q.clone().invert());
      delta.set(
        ...(delta
          .toArray()
          .map((n, i) => (p.axes[i] ? Math.round(n / p.snap) * p.snap : 0)) as Vec3),
      );
      return new THREE.Matrix4().makeTranslation(...delta.applyQuaternion(q).toArray());
    }
    if (p.operation === 'scale' && p.uniformScale) {
      const index = ['X', 'Y', 'Z'].indexOf(transform.axis ?? '');
      const factor = handle.scale.getComponent(index < 0 ? 0 : index);
      const q = new THREE.Quaternion(...p.frame);
      const frame = new THREE.Matrix4().makeRotationFromQuaternion(q);
      return new THREE.Matrix4()
        .makeTranslation(...p.pivot)
        .multiply(frame)
        .multiply(new THREE.Matrix4().makeScale(...(p.axes.map((v) => (v ? factor : 1)) as Vec3)))
        .multiply(frame.clone().invert())
        .multiply(new THREE.Matrix4().makeTranslation(...(p.pivot.map((n) => -n) as Vec3)));
    }
    handle.updateMatrixWorld();
    return handle.matrixWorld.clone().multiply(dragInverse);
  };
  transform.addEventListener('objectChange', () => {
    if (!dragBase) return;
    current().onTransform(transformGeometryPoints(dragBase, dragIds, dragMatrix()), false);
    invalidate();
  });
  transform.addEventListener('mouseUp', () => {
    if (!dragBase) return;
    handle.updateMatrixWorld();
    const next = transformGeometryPoints(dragBase, dragIds, dragMatrix());
    dragBase = undefined;
    current().onTransform(next, true);
    getControls().enabled = true;
    invalidate();
  });
  transform.addEventListener('change', () => {
    canvas.dataset.handleAxis = transform.axis ?? '';
    invalidate();
  });
  canvas.addEventListener('pointerdown', pointerDown);
  canvas.addEventListener('pointermove', pointerMove);
  canvas.addEventListener('pointerup', pointerUp);
  canvas.addEventListener('pointerleave', clearHover);
  const cancel = (event: PointerEvent) => {
    touches.delete(event.pointerId);
    if (start?.grab?.active) {
      current().onTransform(start.grab.base, false);
      getControls().enabled = true;
    }
    start = undefined;
    box.hidden = true;
    clearHover();
  };
  canvas.addEventListener('pointercancel', cancel);
  canvas.addEventListener('dblclick', doubleClick);
  canvas.addEventListener('contextmenu', context);
  update();
  return {
    update,
    cameraChanged() {
      transform.camera = getCamera();
    },
    dispose() {
      disposed = true;
      getControls().enabled = true;
      transform.detach();
      transform.dispose();
      canvas.removeEventListener('pointerdown', pointerDown);
      canvas.removeEventListener('pointermove', pointerMove);
      canvas.removeEventListener('pointerup', pointerUp);
      canvas.removeEventListener('pointerleave', clearHover);
      canvas.removeEventListener('pointercancel', cancel);
      canvas.removeEventListener('dblclick', doubleClick);
      canvas.removeEventListener('contextmenu', context);
      scene.traverse((object) => {
        const draw = object as THREE.Mesh;
        draw.geometry?.dispose();
        if (draw.material)
          (Array.isArray(draw.material) ? draw.material : [draw.material]).forEach((m) =>
            m.dispose(),
          );
      });
      world.remove(scene);
      map.dispose();
      box.remove();
      delete canvas.dataset.handleAxis;
      canvas.style.cursor = '';
    },
  };
}
