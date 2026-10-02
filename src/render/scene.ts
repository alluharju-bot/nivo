import { createMaterialLibrary, texturePlacement, textureFrameMatrix } from './materials';
import {
  defaultAppearance,
  type Appearance,
  type TexturePlacement,
  type TextureAsset,
} from '../model/materials';
import { installCameraNavigation } from '../viewport/cameraNavigation';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { BodyMesh } from '../cad/protocol';
import { bounds, type Body, type Project } from '../model/project';

export type RenderSettings = NonNullable<Project['settings']['render']>;
export const renderDefaults: RenderSettings = { environment: 'studio', exposure: 1, shadows: true };
export const materialNames = {
  matte: 'Matta',
  paint: 'Maalattu',
  wood: 'Puu',
  metal: 'Metalli',
  glass: 'Lasi',
};
type Props = {
  bodies: Body[];
  meshes: BodyMesh[];
  settings: RenderSettings;
  onPick: (id: string) => void;
  assets?: Record<string, TextureAsset>;
  selectedIds?: string[];
  editingTexture?: { id: string; appearance: Appearance };
  onTexture: (texture: TexturePlacement) => void;
};

export function createRenderScene(host: HTMLDivElement, current: () => Props) {
  const scene = new THREE.Scene();
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const canvas = renderer.domElement;
  canvas.dataset.testid = 'render-canvas';
  canvas.setAttribute('aria-label', 'Renderöintinäkymä');
  host.append(canvas);
  const environment = new RoomEnvironment(),
    pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(environment, 0.04);
  scene.environment = env.texture;
  scene.environmentIntensity = 0.7;
  environment.dispose();
  pmrem.dispose();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 1000000);
  camera.up.set(0, 0, 1);
  const controls = new OrbitControls(camera, canvas);
  controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
  controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
  controls.mouseButtons.MIDDLE = THREE.MOUSE.PAN;
  controls.screenSpacePanning = true;
  const model = new THREE.Group();
  scene.add(model);
  const ambient = new THREE.HemisphereLight('#eff4ff', '#b2a68e', 1.1);
  scene.add(ambient);
  const key = new THREE.DirectionalLight('#fff6e9', 3);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.00015;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight('#ccdfff', 1.3);
  scene.add(fill);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshStandardMaterial({ color: '#dce1dc', roughness: 0.95 }),
  );
  floor.receiveShadow = true;
  scene.add(floor);
  let extent = 100,
    initialized = false;
  const draw = () => {
    renderer.render(scene, camera);
    canvas.dataset.camera = JSON.stringify({
      position: camera.position.toArray(),
      quaternion: camera.quaternion.toArray(),
      projection: camera.projectionMatrix.toArray(),
      target: controls.target.toArray(),
    });
    updateHandles();
  };
  const library = createMaterialLibrary(draw);
  const navigation = installCameraNavigation(controls, canvas, () => model.children);
  controls.addEventListener('change', draw);
  const resize = () => {
    const width = host.clientWidth,
      height = host.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    draw();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  const fit = () => {
    const box = bounds(current().bodies),
      a = new THREE.Vector3(...box.min),
      b = new THREE.Vector3(...box.max);
    controls.target.copy(a).add(b).multiplyScalar(0.5);
    const radius = Math.max(a.distanceTo(b) / 2, 1);
    const distance =
      (radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) / Math.min(camera.aspect, 1)) *
      1.18;
    camera.position
      .copy(controls.target)
      .addScaledVector(new THREE.Vector3(1, -1.5, 0.85).normalize(), distance);
    camera.near = Math.max(0.01, radius / 1000);
    camera.far = Math.max(1000, radius * 1000);
    controls.minDistance = Math.max(0.1, radius * 0.05);
    controls.maxDistance = radius * 100;
    camera.updateProjectionMatrix();
    controls.update();
    draw();
  };
  const clearModel = () => {
    for (const object of model.children)
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        (object.material as THREE.MeshPhysicalMaterial).map?.dispose();
        (object.material as THREE.Material).dispose();
      }
    model.clear();
  };
  const sync = () => {
    clearModel();
    const { bodies, meshes } = current();
    for (const data of meshes) {
      const body = bodies.find((b) => b.id === data.id);
      if (!body) continue;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.vertices, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(data.normals, 3));
      geometry.setIndex(data.triangles);
      const uv: number[] = [];
      for (let i = 0; i < data.vertices.length; i += 3) {
        const n = data.normals.slice(i, i + 3).map(Math.abs),
          axis = n.indexOf(Math.max(...n));
        const u = axis === 0 ? 1 : 0,
          v = axis === 2 ? 1 : 2;
        uv.push(data.vertices[i + u] / 300, data.vertices[i + v] / 600);
      }
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      const surface = library.create(body, current().assets);
      const mesh = new THREE.Mesh(geometry, surface);
      mesh.userData.bodyId = body.id;
      mesh.castShadow = surface.transmission < 0.5;
      mesh.receiveShadow = true;
      model.add(mesh);
    }
    navigation.sync(bodies, current().selectedIds ?? []);
    const box = bounds(bodies),
      a = new THREE.Vector3(...box.min),
      b = new THREE.Vector3(...box.max),
      center = a.clone().add(b).multiplyScalar(0.5);
    extent = Math.max(100, a.distanceTo(b));
    floor.position.set(center.x, center.y, box.min[2] - extent * 0.001);
    floor.scale.setScalar(extent * 40);
    key.position.copy(center).add(new THREE.Vector3(-extent, -extent * 0.8, extent * 1.8));
    key.target.position.copy(center);
    fill.position.copy(center).add(new THREE.Vector3(extent, extent, extent));
    const shadow = key.shadow.camera;
    shadow.left = shadow.bottom = -extent;
    shadow.right = shadow.top = extent;
    shadow.near = extent * 0.01;
    shadow.far = extent * 6;
    shadow.updateProjectionMatrix();
    key.shadow.normalBias = extent * 0.001;
    settingsOnly();
    resize();
    if (!initialized) {
      initialized = true;
      fit();
    } else draw();
    canvas.dataset.bodyCount = String(model.children.length);
  };
  const settingsOnly = () => {
    const settings = current().settings;
    const color = { studio: '#e8ece9', warm: '#eee3d2', dark: '#25313a' }[settings.environment];
    scene.background = new THREE.Color(color);
    floor.material.color.set(color);
    key.color.set(settings.environment === 'warm' ? '#ffe3b7' : '#fff6e9');
    scene.environmentIntensity = settings.environment === 'dark' ? 0.9 : 0.7;
    renderer.toneMappingExposure = settings.exposure;
    renderer.shadowMap.enabled = settings.shadows;
    draw();
  };
  const handles = document.createElement('div');
  handles.className = 'texture-handles';
  handles.hidden = true;
  host.append(handles);
  const scaleHandle = document.createElement('button'),
    rotateHandle = document.createElement('button');
  scaleHandle.textContent = '↗';
  scaleHandle.setAttribute('aria-label', 'Skaalaa tekstuuria');
  scaleHandle.title = 'Vedä: tekstuurin koko';
  rotateHandle.textContent = '↻';
  rotateHandle.setAttribute('aria-label', 'Kierrä tekstuuria');
  rotateHandle.title = 'Vedä: tekstuurin kierto';
  handles.append(scaleHandle, rotateHandle);
  function updateHandles() {
    const editing = current().editingTexture,
      body = current().bodies.find((b) => b.id === editing?.id);
    handles.hidden = !body;
    if (!body) return;
    const point = new THREE.Vector3(...body.origin)
      .add(
        new THREE.Vector3(body.feature.width / 2, body.feature.depth / 2, body.feature.height / 2),
      )
      .project(camera);
    handles.style.left = `${((point.x + 1) * host.clientWidth) / 2}px`;
    handles.style.top = `${((1 - point.y) * host.clientHeight) / 2}px`;
    canvas.dataset.textureEditing = body.id;
  }
  const rayAt = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect(),
      ray = new THREE.Raycaster();
    ray.setFromCamera(
      new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        1 - ((event.clientY - rect.top) / rect.height) * 2,
      ),
      camera,
    );
    return ray;
  };
  let textureDrag:
    | {
        id: number;
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
      }
    | undefined;
  const textureDown = (event: PointerEvent, mode: 'move' | 'scale' | 'rotate' = 'move') => {
    const editing = current().editingTexture;
    if (!editing || event.button !== 0) return;
    const body = current().bodies.find((b) => b.id === editing.id);
    if (!body) return;
    const ray = rayAt(event),
      hit = ray.intersectObjects(model.children).find((h) => h.object.userData.bodyId === body.id);
    if (mode === 'move' && !hit) return;
    start = undefined;
    const point =
      hit?.point ??
      new THREE.Vector3(...body.origin).add(
        new THREE.Vector3(body.feature.width / 2, body.feature.depth / 2, body.feature.height / 2),
      );
    const normal =
      hit?.face?.normal.clone() ?? camera.getWorldDirection(new THREE.Vector3()).negate();
    const inverse = textureFrameMatrix(body).invert(),
      localNormal = normal.clone().transformDirection(inverse).toArray().map(Math.abs),
      axis = localNormal.indexOf(Math.max(...localNormal));
    const box = handles.getBoundingClientRect();
    textureDrag = {
      id: event.pointerId,
      mode,
      x: event.clientX,
      y: event.clientY,
      initial: { ...editing.appearance.texture },
      plane: new THREE.Plane().setFromNormalAndCoplanarPoint(normal, point),
      inverse,
      start: point.clone().applyMatrix4(inverse),
      u: axis === 0 ? 1 : 0,
      v: axis === 2 ? 1 : 2,
      center: { x: box.left, y: box.top },
    };
    controls.enabled = false;
    canvas.dataset.textureDragging = mode;
    event.preventDefault();
    event.stopImmediatePropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };
  const textureMove = (event: PointerEvent) => {
    const d = textureDrag;
    if (!d || d.id !== event.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const texture = { ...d.initial };
    if (d.mode === 'move') {
      const point = rayAt(event).ray.intersectPlane(d.plane, new THREE.Vector3());
      if (!point) return;
      const delta = point.applyMatrix4(d.inverse).sub(d.start);
      texture.offsetX += delta.getComponent(d.u);
      texture.offsetY += delta.getComponent(d.v);
    } else if (d.mode === 'scale') {
      const factor = Math.exp((event.clientX - d.x - (event.clientY - d.y)) * 0.008);
      texture.width = Math.max(0.1, Math.min(100000, texture.width * factor));
      if (texture.lockAspect)
        texture.height = Math.max(0.1, Math.min(100000, texture.height * factor));
    } else {
      texture.rotation +=
        ((Math.atan2(event.clientY - d.center.y, event.clientX - d.center.x) -
          Math.atan2(d.y - d.center.y, d.x - d.center.x)) *
          180) /
        Math.PI;
    }
    current().onTexture(texture);
  };
  const textureUp = (event: PointerEvent) => {
    if (textureDrag?.id !== event.pointerId) return;
    textureDrag = undefined;
    canvas.dataset.textureDragging = '';
    controls.enabled = true;
    event.stopImmediatePropagation();
  };
  const cancelTextureDrag = () => {
    textureDrag = undefined;
    canvas.dataset.textureDragging = '';
    controls.enabled = true;
  };
  canvas.addEventListener('pointerdown', textureDown, true);
  const scaleDown = (event: PointerEvent) => textureDown(event, 'scale'),
    rotateDown = (event: PointerEvent) => textureDown(event, 'rotate');
  scaleHandle.addEventListener('pointerdown', scaleDown);
  rotateHandle.addEventListener('pointerdown', rotateDown);
  window.addEventListener('pointermove', textureMove, true);
  window.addEventListener('pointerup', textureUp, true);
  window.addEventListener('pointercancel', cancelTextureDrag);
  window.addEventListener('blur', cancelTextureDrag);
  let start: { x: number; y: number; moved: boolean } | undefined;
  const down = (event: PointerEvent) => {
    start = event.button === 0 ? { x: event.clientX, y: event.clientY, moved: false } : undefined;
  };
  const move = (event: PointerEvent) => {
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 4)
      start.moved = true;
  };
  const up = (event: PointerEvent) => {
    if (!start || start.moved || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 4) {
      start = undefined;
      return;
    }
    start = undefined;
    const rect = canvas.getBoundingClientRect(),
      ray = new THREE.Raycaster();
    ray.setFromCamera(
      new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        (-(event.clientY - rect.top) / rect.height) * 2 + 1,
      ),
      camera,
    );
    const hit = ray.intersectObjects(model.children)[0];
    if (hit) current().onPick(hit.object.userData.bodyId);
  };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointermove', move);
  return {
    sync,
    fit,
    settings: settingsOnly,
    appearance(ids: string[], appearance: Appearance) {
      for (const object of model.children)
        if (object instanceof THREE.Mesh && ids.includes(object.userData.bodyId)) {
          const material = object.material as THREE.MeshPhysicalMaterial;
          if (material.map) texturePlacement(material.map, appearance.texture);
        }
      updateHandles();
      draw();
    },
    selection() {
      controls.mouseButtons.LEFT = current().editingTexture ? null! : THREE.MOUSE.ROTATE;
      navigation.sync(current().bodies, current().selectedIds ?? []);
      if (!current().editingTexture) cancelTextureDrag();
      updateHandles();
    },
    async exportPNG(width: number) {
      await library.ready();
      const size = renderer.getSize(new THREE.Vector2()),
        pixelRatio = renderer.getPixelRatio();
      const height = Math.max(1, Math.round(width / camera.aspect));
      try {
        renderer.setPixelRatio(1);
        renderer.setSize(width, height, false);
        draw();
        return await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new Error('Kuvan vienti epäonnistui.'))),
            'image/png',
          ),
        );
      } finally {
        renderer.setPixelRatio(pixelRatio);
        renderer.setSize(size.x, size.y);
        draw();
      }
    },
    dispose() {
      observer.disconnect();
      controls.removeEventListener('change', draw);
      navigation.dispose();
      controls.dispose();
      window.removeEventListener('pointermove', textureMove, true);
      window.removeEventListener('pointerup', textureUp, true);
      window.removeEventListener('pointercancel', cancelTextureDrag);
      window.removeEventListener('blur', cancelTextureDrag);
      canvas.removeEventListener('pointerdown', textureDown, true);
      scaleHandle.removeEventListener('pointerdown', scaleDown);
      rotateHandle.removeEventListener('pointerdown', rotateDown);
      handles.remove();
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointermove', move);
      clearModel();
      floor.geometry.dispose();
      floor.material.dispose();
      key.shadow.dispose();
      env.dispose();
      library.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
