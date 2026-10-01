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
};

function woodTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 1024;
  const context = canvas.getContext('2d')!;
  const image = context.createImageData(canvas.width, canvas.height);
  const hash = (x: number, y: number) => {
    const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return value - Math.floor(value);
  };
  const noise = (x: number, y: number) => {
    const ix = Math.floor(x),
      iy = Math.floor(y);
    const fx = x - ix,
      fy = y - iy;
    const u = fx * fx * (3 - 2 * fx),
      v = fy * fy * (3 - 2 * fy);
    return THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(hash(ix, iy), hash(ix + 1, iy), u),
      THREE.MathUtils.lerp(hash(ix, iy + 1), hash(ix + 1, iy + 1), u),
      v,
    );
  };
  for (let y = 0; y < canvas.height; y++)
    for (let x = 0; x < canvas.width; x++) {
      const warped = x + (noise(x / 65, y / 350) - 0.5) * 18;
      const fiber = Math.pow(Math.abs(Math.sin(warped * 1.8 + noise(x / 13, y / 100) * 3)), 18);
      const value =
        242 + (noise(warped / 8, y / 300) - 0.5) * 14 - fiber * (4 + noise(x / 6, y / 180) * 8);
      const i = (y * canvas.width + x) * 4;
      image.data[i] = value;
      image.data[i + 1] = value;
      image.data[i + 2] = value;
      image.data[i + 3] = 255;
    }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

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
  const wood = woodTexture();
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
  const draw = () => renderer.render(scene, camera);
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
      const material = body.material ?? 'matte';
      const surface = new THREE.MeshPhysicalMaterial({
        color: body.color,
        side: THREE.DoubleSide,
        roughness:
          material === 'metal'
            ? 0.24
            : material === 'glass'
              ? 0.08
              : material === 'paint'
                ? 0.35
                : 0.78,
        metalness: material === 'metal' ? 0.9 : 0,
        clearcoat: material === 'paint' ? 0.3 : 0,
        transmission: material === 'glass' ? 0.92 : 0,
        thickness:
          material === 'glass'
            ? Math.max(
                1,
                Math.min(body.feature.width, body.feature.depth, body.feature.height) * 0.1,
              )
            : 0,
        ior: 1.5,
        map: material === 'wood' ? wood : null,
      });
      const mesh = new THREE.Mesh(geometry, surface);
      mesh.userData.bodyId = body.id;
      mesh.castShadow = material !== 'glass';
      mesh.receiveShadow = true;
      model.add(mesh);
    }
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
    async exportPNG(width: number) {
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
      controls.dispose();
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointermove', move);
      clearModel();
      floor.geometry.dispose();
      floor.material.dispose();
      key.shadow.dispose();
      env.dispose();
      wood.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
