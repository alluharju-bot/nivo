import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
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
  view: { id: number; kind: 'fit' | 'top' | 'front' | 'right' | 'iso' };
  disabled: boolean;
  onSelect: (ids: number[], extend: boolean) => void;
  onPick: (point: Vec3) => void;
  onTransform: (points: Vec3[], complete: boolean) => void;
  onError: (message: string) => void;
}
export function GeometryStage(props: GeometryStageProps) {
  const host = useRef<HTMLDivElement>(null),
    latest = useRef(props),
    refresh = useRef<() => void>(() => {});
  latest.current = props;
  useEffect(() => {
    const el = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      latest.current.onError(
        'Tarkan muokkauksen 3D-näkymää ei voitu avata. Alkuperäinen osa säilyi.',
      );
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setClearColor('#f1f3ef');
    const canvas = renderer.domElement;
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', 'Geometrian muokkausnäkymä');
    el.append(canvas);
    const scene = new THREE.Scene(),
      camera = new THREE.PerspectiveCamera(40, 1, 0.01, 1000000);
    camera.up.set(0, 0, 1);
    const orbit = new OrbitControls(camera, canvas);
    orbit.enableDamping = false;
    orbit.mouseButtons = { LEFT: undefined, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
    orbit.touches = { ONE: undefined, TWO: THREE.TOUCH.DOLLY_ROTATE };
    orbit.minPolarAngle = 1e-6;
    orbit.maxPolarAngle = Math.PI - 1e-6;
    const ambient = new THREE.HemisphereLight('#ffffff', '#a6b0a8', 2.2),
      light = new THREE.DirectionalLight('#ffffff', 2.5);
    light.position.set(200, -300, 600);
    scene.add(ambient, light);
    const g = props.geometry,
      geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        g.vertexMap.flatMap((i) => props.points[i]),
        3,
      ),
    );
    geometry.setIndex(g.sourceTriangles);
    geometry.computeVertexNormals();
    const surface = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color: '#b5c9c2',
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
      new THREE.LineBasicMaterial({ color: '#56776b' }),
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
    const transform = new TransformControls(camera, canvas);
    transform.size = 0.8;
    scene.add(transform.getHelper());
    const ray = new THREE.Raycaster(),
      ndc = new THREE.Vector2();
    ray.firstHitOnly = true;
    let edges = geometryEdges(g),
      raf = 0,
      disposed = false,
      lastView = -1,
      dragged = false;
    let dragBase: Vec3[] | undefined,
      dragIds: number[] = [],
      dragInverse = new THREE.Matrix4();
    let start: { x: number; y: number; shift: boolean } | undefined;
    const touches = new Set<number>();
    const box = document.createElement('div');
    box.className = 'geometry-box-selection';
    box.hidden = true;
    el.append(box);
    const render = () => {
      raf = 0;
      if (!disposed) renderer.render(scene, camera);
    };
    const invalidate = () => {
      if (!raf && !disposed) raf = requestAnimationFrame(render);
    };
    const project = (p: Vec3) => new THREE.Vector3(...p).project(camera);
    const pointer = (event: PointerEvent | MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: event.clientX - r.left, y: event.clientY - r.top };
    };
    const rayAt = (x: number, y: number) => {
      ndc.set((x / canvas.clientWidth) * 2 - 1, 1 - (y / canvas.clientHeight) * 2);
      ray.setFromCamera(ndc, camera);
    };
    const visible = (point: Vec3) => {
      if (latest.current.xray) return true;
      const p = project(point);
      rayAt(((p.x + 1) * canvas.clientWidth) / 2, ((1 - p.y) * canvas.clientHeight) / 2);
      const hit = ray.intersectObject(surface, false)[0];
      return (
        !hit ||
        hit.distance + Math.max(0.002, camera.position.distanceTo(orbit.target) * 0.00002) >=
          camera.position.distanceTo(new THREE.Vector3(...point))
      );
    };
    const pointAt = (x: number, y: number) => {
      let best = -1,
        score = Infinity;
      latest.current.points.forEach((p, i) => {
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
        const a = project(latest.current.points[edge.a]),
          b = project(latest.current.points[edge.b]);
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
        const point = new THREE.Vector3(...latest.current.points[edge.a])
          .lerp(new THREE.Vector3(...latest.current.points[edge.b]), t)
          .toArray();
        if (distance < 11 && distance < score && visible(point)) {
          best = i;
          score = distance;
        }
      });
      return best;
    };
    const selectAt = (x: number, y: number, extend: boolean, loop = false) => {
      const p = latest.current;
      if (p.picking) {
        const point = pointAt(x, y);
        if (point >= 0) p.onPick(p.points[point]);
        return;
      }
      if (p.mode === 'points') {
        const point = pointAt(x, y);
        p.onSelect(point >= 0 ? [point] : [], extend);
      } else if (p.mode === 'edges') {
        const edge = edgeAt(x, y);
        p.onSelect(
          edge >= 0
            ? loop
              ? edgeLoop(edges, edge, p.points)
              : [edges[edge].a, edges[edge].b]
            : [],
          extend,
        );
      } else {
        rayAt(x, y);
        const hit = ray.intersectObject(surface, false)[0];
        p.onSelect(
          hit?.faceIndex !== undefined && hit.faceIndex !== null
            ? patchPoints(g, hit.faceIndex)
            : [],
          extend,
        );
      }
    };
    const clearHover = () => {
      hoverPoint.visible = hoverEdge.visible = hoverFace.visible = false;
      canvas.style.cursor = latest.current.picking ? 'crosshair' : 'default';
      invalidate();
    };
    const hoverAt = (x: number, y: number) => {
      clearHover();
      const p = latest.current;
      if (p.disabled || transform.axis) return;
      let vertices: Vec3[] = [],
        object: THREE.Points | THREE.LineSegments | THREE.Mesh;
      if (p.mode === 'points' || p.picking) {
        const i = pointAt(x, y);
        if (i >= 0) vertices = [p.points[i]];
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
          start = undefined;
          box.hidden = true;
          clearHover();
          return;
        }
      }
      if (event.button !== 0 || latest.current.disabled) return;
      clearHover();
      canvas.focus({ preventScroll: true });
      dragged = transform.dragging;
      const p = pointer(event);
      start = { ...p, shift: event.shiftKey };
      if (!dragged) canvas.setPointerCapture(event.pointerId);
    };
    const pointerMove = (event: PointerEvent) => {
      if (!start && !event.buttons) {
        const p = pointer(event);
        hoverAt(p.x, p.y);
        return;
      }
      if (!start || transform.dragging || dragged || latest.current.picking) return;
      const p = pointer(event),
        distance = Math.hypot(p.x - start.x, p.y - start.y);
      if (distance < 5) return;
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
      if (dragged) {
        dragged = false;
        box.hidden = true;
        return;
      }
      const p = pointer(event);
      if (!box.hidden) {
        box.hidden = true;
        const ids: number[] = [];
        latest.current.points.forEach((point, i) => {
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
        latest.current.onSelect(ids, from.shift);
      } else selectAt(p.x, p.y, from.shift);
    };
    const doubleClick = (event: MouseEvent) => {
      if (transform.dragging || latest.current.disabled) return;
      const p = pointer(event);
      selectAt(p.x, p.y, event.shiftKey, true);
    };
    const context = (e: Event) => e.preventDefault();
    const resize = () => {
      const w = el.clientWidth,
        h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      invalidate();
    };
    const update = () => {
      if (disposed) return;
      clearHover();
      const p = latest.current,
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
      pivotMarker.position.set(...p.pivot);
      pivotMarker.scale.setScalar(Math.max(0.05, camera.position.distanceTo(orbit.target) * 0.004));
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
      transform.setRotationSnap(Math.PI / 36);
      if (!transform.dragging) {
        handle.position.set(...p.pivot);
        handle.quaternion.set(...p.frame);
        handle.scale.set(1, 1, 1);
        handle.updateMatrixWorld();
        if (p.selected.length && !p.picking) transform.attach(handle);
        else transform.detach();
      }
      if (p.view.id !== lastView) {
        lastView = p.view.id;
        const bounds = new THREE.Box3().setFromPoints(
            p.points.map((point) => new THREE.Vector3(...point)),
          ),
          center = bounds.getCenter(new THREE.Vector3());
        const distance =
          p.view.kind === 'fit' || !camera.position.length()
            ? Math.max(bounds.getSize(new THREE.Vector3()).length() * 1.8, 30) /
              Math.min(camera.aspect, 1)
            : camera.position.distanceTo(orbit.target);
        const direction = {
          top: [0, -0.00001, 1],
          front: [0, -1, 0.001],
          right: [1, 0, 0.001],
          iso: [1, -1, 0.8],
          fit: [1, -1, 0.8],
        }[p.view.kind];
        orbit.target.copy(center);
        camera.position
          .copy(center)
          .addScaledVector(new THREE.Vector3(...direction).normalize(), distance);
        orbit.update();
      }
      invalidate();
    };
    transform.addEventListener('mouseDown', () => {
      dragged = true;
      dragBase = latest.current.points;
      dragIds = [...latest.current.selected];
      handle.updateMatrixWorld();
      dragInverse.copy(handle.matrixWorld).invert();
      orbit.enabled = false;
    });
    const dragMatrix = () => {
      const p = latest.current;
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
      latest.current.onTransform(transformGeometryPoints(dragBase, dragIds, dragMatrix()), false);
      invalidate();
    });
    transform.addEventListener('mouseUp', () => {
      if (!dragBase) return;
      handle.updateMatrixWorld();
      const next = transformGeometryPoints(dragBase, dragIds, dragMatrix());
      dragBase = undefined;
      latest.current.onTransform(next, true);
      orbit.enabled = true;
      invalidate();
    });
    transform.addEventListener('change', () => {
      el.dataset.handleAxis = transform.axis ?? '';
      invalidate();
    });
    orbit.addEventListener('change', invalidate);
    canvas.addEventListener('pointerdown', pointerDown);
    canvas.addEventListener('pointermove', pointerMove);
    canvas.addEventListener('pointerup', pointerUp);
    canvas.addEventListener('pointerleave', clearHover);
    canvas.addEventListener('pointercancel', (event) => {
      touches.delete(event.pointerId);
      start = undefined;
      box.hidden = true;
      clearHover();
    });
    canvas.addEventListener('dblclick', doubleClick);
    canvas.addEventListener('contextmenu', context);
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    refresh.current = update;
    resize();
    update();
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      orbit.dispose();
      transform.dispose();
      transform.detach();
      scene.traverse((object) => {
        const draw = object as THREE.Mesh;
        if (draw.geometry) draw.geometry.dispose();
        if (draw.material)
          (Array.isArray(draw.material) ? draw.material : [draw.material]).forEach((m) =>
            m.dispose(),
          );
      });
      map.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
      box.remove();
      refresh.current = () => {};
    };
  }, [props.geometry]);
  useEffect(
    () => refresh.current(),
    [
      props.points,
      props.selected,
      props.mode,
      props.operation,
      props.pivot,
      props.frame,
      props.axes,
      props.xray,
      props.allEdges,
      props.picking,
      props.snap,
      props.uniformScale,
      props.view,
      props.disabled,
    ],
  );
  return <div ref={host} className="geometry-stage" data-testid="geometry-stage" />;
}
