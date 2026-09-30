import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { bounds, type Axis, type Body, type FaceRef, type Vec3, type View } from '../model/project';
import { snapPoint, type Snap } from '../model/snap';
import type { BodyMesh } from '../cad/protocol';

export type Tool = 'select' | 'rectangle' | 'extrude' | 'move' | 'navigate';
export interface CameraCommand {
  id: number;
  type: 'fit' | 'view' | 'projection';
  view?: View;
  projection?: 'perspective' | 'orthographic';
}
interface Props {
  bodies: Body[];
  meshes: BodyMesh[];
  selected?: string;
  selectedFace?: FaceRef;
  tool: Tool;
  preview?: Body;
  axis?: Axis;
  gridSnap: boolean;
  busy: boolean;
  command?: CameraCommand;
  onSelect: (id?: string, face?: FaceRef) => void;
  onRectangle: (origin: Vec3, width: number, depth: number) => void;
  onMove: (origin: Vec3) => void;
  onExtrude: (height: number) => void;
  onSnap: (label: string) => void;
}
interface SceneApi {
  sync: () => void;
  preview: () => void;
  command: (command: CameraCommand) => void;
  dispose: () => void;
}

function makeScene(container: HTMLDivElement, current: () => Props): SceneApi {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#eaece6');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.domElement.setAttribute('aria-label', '3D-mallinnusalue');
  renderer.domElement.setAttribute('data-testid', 'viewport');
  renderer.domElement.tabIndex = 0;
  container.append(renderer.domElement);
  const perspective = new THREE.PerspectiveCamera(40, 1, 0.1, 1_000_000);
  const orthographic = new THREE.OrthographicCamera(-900, 900, 700, -700, 0.1, 1_000_000);
  perspective.up.set(0, 0, 1);
  orthographic.up.set(0, 0, 1);
  perspective.position.set(1350, -1550, 1250);
  let camera: THREE.PerspectiveCamera | THREE.OrthographicCamera = perspective;
  let halfHeight = 700;
  const controls = new OrbitControls<THREE.PerspectiveCamera | THREE.OrthographicCamera>(
    camera,
    renderer.domElement,
  );
  controls.target.set(230, 180, 170);
  controls.enableDamping = false;
  controls.minDistance = 2;
  controls.maxDistance = 250_000;
  controls.screenSpacePanning = true;
  const render = () => renderer.render(scene, camera);
  controls.addEventListener('change', render);
  controls.update();
  const resize = () => {
    const width = container.clientWidth,
      height = container.clientHeight;
    if (width < 1 || height < 1) return;
    renderer.setSize(width, height);
    perspective.aspect = width / height;
    perspective.updateProjectionMatrix();
    orthographic.left = (-halfHeight * width) / height;
    orthographic.right = -orthographic.left;
    orthographic.top = halfHeight;
    orthographic.bottom = -halfHeight;
    orthographic.updateProjectionMatrix();
    render();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  scene.add(new THREE.HemisphereLight('#fffdf4', '#798b78', 2.5));
  const key = new THREE.DirectionalLight('#fff5df', 3.2);
  key.position.set(-600, -1000, 1800);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, {
    left: -2000,
    right: 2000,
    top: 2000,
    bottom: -2000,
    near: 10,
    far: 6000,
  });
  key.shadow.bias = -0.00002;
  key.shadow.normalBias = 2;
  scene.add(key);
  const fill = new THREE.DirectionalLight('#e4edff', 1.5);
  fill.position.set(800, 600, 1200);
  scene.add(fill);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(200000, 200000),
    new THREE.ShadowMaterial({ opacity: 0.12 }),
  );
  floor.position.z = -0.3;
  floor.receiveShadow = true;
  scene.add(floor);
  const grid = new THREE.GridHelper(6000, 120, '#b9c5ba', '#d3d9cf');
  grid.rotation.x = Math.PI / 2;
  grid.position.z = -0.2;
  scene.add(grid);
  const axes = new THREE.AxesHelper(160);
  axes.position.z = 0.1;
  scene.add(axes);
  const bodies = new THREE.Group(),
    ghost = new THREE.Group();
  scene.add(bodies, ghost);
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(4, 12, 8),
    new THREE.MeshBasicMaterial({ color: '#df752f', depthTest: false }),
  );
  marker.visible = false;
  marker.renderOrder = 100;
  scene.add(marker);
  const disposeGroup = (group: THREE.Group) => {
    group.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
        obj.geometry.dispose();
        (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach((m) => m.dispose());
      }
    });
    group.clear();
  };
  const sync = () => {
    disposeGroup(bodies);
    const props = current();
    for (const data of props.meshes) {
      const body = props.bodies.find((b) => b.id === data.id);
      if (!body) continue;
      const selected = data.id === props.selected;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.vertices, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(data.normals, 3));
      geometry.setIndex(data.triangles);
      const materials = data.faces.map((face, index) => {
        geometry.addGroup(face.start, face.count, index);
        return new THREE.MeshStandardMaterial({
          color: selected && face.ref === props.selectedFace ? '#e1bd7b' : body.color,
          roughness: 0.8,
          metalness: 0,
          side: THREE.DoubleSide,
          polygonOffset: true,
          polygonOffsetFactor: 1,
          polygonOffsetUnits: 1,
          transparent: body.feature.height === 0,
          opacity: body.feature.height === 0 ? 0.65 : 1,
        });
      });
      const mesh = new THREE.Mesh(geometry, materials);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = { id: body.id, faces: data.faces };
      bodies.add(mesh);
      const edges = new THREE.BufferGeometry();
      edges.setAttribute('position', new THREE.Float32BufferAttribute(data.edges, 3));
      bodies.add(
        new THREE.LineSegments(
          edges,
          new THREE.LineBasicMaterial({
            color: selected ? '#237b65' : '#766851',
            transparent: true,
            opacity: selected ? 1 : 0.5,
            depthTest: true,
          }),
        ),
      );
    }
    const editing = ['rectangle', 'move', 'extrude'].includes(props.tool);
    if (!editing) marker.visible = false;
    controls.mouseButtons.LEFT = editing || props.tool === 'select' ? null! : THREE.MOUSE.ROTATE;
    controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
    controls.mouseButtons.MIDDLE = THREE.MOUSE.PAN;
    controls.touches.ONE = props.tool === 'navigate' ? THREE.TOUCH.ROTATE : null!;
    controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
    render();
  };
  const preview = () => {
    disposeGroup(ghost);
    const body = current().preview;
    if (body) {
      const { width, depth, height } = body.feature;
      const geometry = new THREE.BoxGeometry(width, depth, Math.max(height, 0.1));
      const material = new THREE.MeshBasicMaterial({
        color: '#3b967a',
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(
        body.origin[0] + width / 2,
        body.origin[1] + depth / 2,
        body.origin[2] + height / 2,
      );
      ghost.add(mesh);
      const lines = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry),
        new THREE.LineBasicMaterial({ color: '#17755d', depthTest: false }),
      );
      lines.position.copy(mesh.position);
      ghost.add(lines);
    }
    render();
  };
  const setProjection = (projection: 'perspective' | 'orthographic') => {
    if ((projection === 'perspective') === (camera === perspective)) return;
    const direction = camera.position.clone().sub(controls.target).normalize();
    const next = projection === 'perspective' ? perspective : orthographic;
    next.up.copy(camera.up);
    if (next === orthographic) {
      halfHeight =
        camera.position.distanceTo(controls.target) *
        Math.tan(THREE.MathUtils.degToRad(perspective.fov / 2));
      orthographic.zoom = 1;
      next.position.copy(camera.position);
    } else {
      const visibleHalf = halfHeight / orthographic.zoom;
      next.position
        .copy(controls.target)
        .addScaledVector(
          direction,
          visibleHalf / Math.tan(THREE.MathUtils.degToRad(perspective.fov / 2)),
        );
    }
    camera = next;
    controls.object = camera;
    resize();
    controls.update();
  };
  const command = (command: CameraCommand) => {
    if (command.type === 'projection') setProjection(command.projection!);
    else {
      const props = current();
      const items =
        command.type === 'fit' && props.selected
          ? props.bodies.filter((b) => b.id === props.selected)
          : props.bodies;
      const box = bounds(items),
        min = new THREE.Vector3(...box.min),
        max = new THREE.Vector3(...box.max);
      const center = min.clone().add(max).multiplyScalar(0.5);
      const aspect = container.clientWidth / Math.max(container.clientHeight, 1);
      const radius = Math.max(max.distanceTo(min) * 0.65, 100) / Math.min(aspect, 1);
      let direction = camera.position.clone().sub(controls.target).normalize();
      if (command.type === 'view') {
        const view = command.view!;
        setProjection(view === 'iso' ? 'perspective' : 'orthographic');
        direction = new THREE.Vector3(
          ...({ iso: [1, -1.4, 1], front: [0, -1, 0], right: [1, 0, 0], top: [0, 0, 1] }[
            view
          ] as Vec3),
        ).normalize();
        camera.up.set(...((view === 'top' ? [0, 1, 0] : [0, 0, 1]) as Vec3));
      }
      controls.target.copy(center);
      camera.position
        .copy(center)
        .addScaledVector(direction, radius / Math.tan(THREE.MathUtils.degToRad(20)));
      halfHeight = radius;
      orthographic.zoom = 1;
      resize();
      controls.update();
    }
    render();
  };
  const raycaster = new THREE.Raycaster(),
    pointer = new THREE.Vector2();
  const setRay = (event: PointerEvent) => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      (-(event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    camera.updateMatrixWorld();
    scene.updateMatrixWorld();
    raycaster.setFromCamera(pointer, camera);
  };
  const planePoint = (event: PointerEvent, z: number): Vec3 | undefined => {
    setRay(event);
    const point = raycaster.ray.intersectPlane(
      new THREE.Plane(new THREE.Vector3(0, 0, 1), -z),
      new THREE.Vector3(),
    );
    return point ? (point.toArray() as Vec3) : undefined;
  };
  let lastSnap: Snap | undefined;
  const snap = (raw: Vec3, anchor?: Vec3) => {
    const props = current();
    const height =
      camera === perspective
        ? camera.position.distanceTo(controls.target) * Math.tan(THREE.MathUtils.degToRad(20)) * 2
        : (halfHeight * 2) / orthographic.zoom;
    lastSnap = snapPoint(
      raw,
      props.bodies.filter((b) => props.tool !== 'move' || b.id !== props.selected),
      (height / container.clientHeight) * 16,
      lastSnap,
      props.tool === 'move' ? props.axis : undefined,
      anchor,
      props.gridSnap,
    );
    marker.position.set(...lastSnap.point);
    marker.scale.setScalar((height / container.clientHeight) * 1.1);
    marker.visible = true;
    props.onSnap(lastSnap.label);
    render();
    return lastSnap.point;
  };
  const pointers = new Set<number>();
  let drag:
    { start: Vec3; origin: Vec3; screenX: number; screenY: number; height: number } | undefined;
  let blockedGesture = false;
  const down = (event: PointerEvent) => {
    if (event.button !== 0) return;
    pointers.add(event.pointerId);
    if (pointers.size > 1) {
      drag = undefined;
      blockedGesture = true;
      marker.visible = false;
      render();
      return;
    }
    const props = current();
    if (props.busy || props.tool === 'navigate') return;
    const selected = props.bodies.find((b) => b.id === props.selected);
    const point = planePoint(event, props.tool === 'rectangle' ? 0 : (selected?.origin[2] ?? 0));
    if (!point && props.tool !== 'extrude' && props.tool !== 'select') return;
    const start = props.tool === 'rectangle' ? snap(point!) : (point ?? ([0, 0, 0] as Vec3));
    drag = {
      start,
      origin: selected?.origin ?? [0, 0, 0],
      screenX: event.clientX,
      screenY: event.clientY,
      height: selected?.feature.height ?? 0,
    };
    renderer.domElement.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent) => {
    const props = current();
    if (!drag || blockedGesture || pointers.size > 1 || props.busy) return;
    if (props.tool === 'extrude') {
      const height = Math.max(0.1, Math.round(drag.height + (drag.screenY - event.clientY) * 2));
      props.onExtrude(height);
      return;
    }
    const point = planePoint(event, props.tool === 'rectangle' ? 0 : drag.origin[2]);
    if (!point) return;
    if (props.tool === 'rectangle') {
      const end = snap(point),
        w = Math.abs(end[0] - drag.start[0]),
        d = Math.abs(end[1] - drag.start[1]);
      if (w >= 0.1 && d >= 0.1)
        props.onRectangle(
          [Math.min(end[0], drag.start[0]), Math.min(end[1], drag.start[1]), 0],
          w,
          d,
        );
    } else if (props.tool === 'move') {
      let origin = point.map((v, i) => drag!.origin[i] + v - drag!.start[i]) as Vec3;
      if (props.axis === 'z')
        origin = [
          drag.origin[0],
          drag.origin[1],
          drag.origin[2] + (drag.screenY - event.clientY) * 2,
        ];
      props.onMove(snap(origin, drag.origin));
    }
  };
  const up = (event: PointerEvent) => {
    const props = current();
    if (
      drag &&
      !blockedGesture &&
      props.tool === 'select' &&
      Math.hypot(event.clientX - drag.screenX, event.clientY - drag.screenY) < 8
    ) {
      setRay(event);
      const hit = raycaster
        .intersectObjects(bodies.children)
        .find((h) => h.object instanceof THREE.Mesh);
      if (hit) {
        const faces = hit.object.userData.faces as BodyMesh['faces'];
        const index = (hit.faceIndex ?? 0) * 3;
        props.onSelect(
          hit.object.userData.id,
          faces.find((f) => index >= f.start && index < f.start + f.count)?.ref,
        );
      } else props.onSelect();
    }
    pointers.delete(event.pointerId);
    drag = undefined;
    if (!pointers.size) blockedGesture = false;
  };
  const canceled = (event: PointerEvent) => {
    pointers.delete(event.pointerId);
    drag = undefined;
    if (!pointers.size) blockedGesture = false;
  };
  const canvas = renderer.domElement;
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', canceled);
  resize();
  sync();
  return {
    sync,
    preview,
    command,
    dispose() {
      observer.disconnect();
      controls.dispose();
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', canceled);
      disposeGroup(bodies);
      disposeGroup(ghost);
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
          obj.geometry.dispose();
          (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach((m) => m.dispose());
        }
      });
      key.shadow.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}

export function Viewport(props: Props) {
  const host = useRef<HTMLDivElement>(null),
    latest = useRef(props),
    api = useRef<SceneApi | undefined>(undefined);
  const hadGeometry = useRef(false);
  const [error, setError] = useState('');
  latest.current = props;
  useEffect(() => {
    try {
      api.current = makeScene(host.current!, () => latest.current);
    } catch {
      setError('3D-näkymä tarvitsee WebGL2-tuen. Tarkista selaimen laitteistokiihdytys.');
    }
    return () => api.current?.dispose();
  }, []);
  useEffect(() => {
    api.current?.sync();
    if (props.meshes.length && !hadGeometry.current) api.current?.command({ id: 0, type: 'fit' });
    hadGeometry.current = props.meshes.length > 0;
  }, [props.bodies, props.meshes, props.selected, props.selectedFace, props.tool]);
  useEffect(() => api.current?.preview(), [props.preview]);
  useEffect(() => {
    if (props.command) api.current?.command(props.command);
  }, [props.command]);
  return (
    <div className="viewport" ref={host}>
      {error && (
        <div className="viewport-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
