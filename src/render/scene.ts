import { installTextureEditing } from '../viewport/textureEditing';
import { canUpdateSurfaces, surfaceKey, type RenderModel } from './sceneChanges';
import { loadStudioEnvironment } from './environment';
import type { ColorPreview } from '../model/colorPreview';
import { createPartLights, createTraceLights, previewLightLimit } from './lights';
import { progressiveRenderer, type TraceStatus } from './progressive';
import { mirrorFaceGroups, mirrorBacking } from './mirror';
import { captureRenderScene } from './snapshot';
import {
  createMaterialLibrary,
  updateMaterialPlacement,
  materialUV,
  disposeMaterial,
} from './materials';
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
  materialTool?: 'select' | 'texture' | 'paint';
  onTexture: (texture: TexturePlacement) => void;
  onTextureCommit?: () => void;
  onTraceStatus?: (status: TraceStatus) => void;
  partNumbers?: Record<string, number>;
};

export function createRenderScene(host: HTMLDivElement, current: () => Props) {
  const scene = new THREE.Scene();
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
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
  // Broad studio panels produce natural penumbras in the traced image. Keep
  // shadow-mapped directional proxies for the inexpensive live camera view.
  key.userData.previewOnly = fill.userData.previewOnly = true;
  const studioPanels = new THREE.Group();
  studioPanels.visible = false;
  studioPanels.userData.traceOnly = true;
  const softKey = new THREE.RectAreaLight(),
    softFill = new THREE.RectAreaLight();
  studioPanels.add(softKey, softFill);
  scene.add(studioPanels);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshStandardMaterial({ color: '#dce1dc', roughness: 0.95 }),
  );
  floor.receiveShadow = true;
  scene.add(floor);
  let disposed = false;
  let extent = 100,
    initialized = false;
  const draw = (materials = false, invalidate = true) => {
    renderer.render(scene, camera);
    if (invalidate) progressive.invalidate(false, materials);
    else progressive.display();
    canvas.dataset.camera = JSON.stringify({
      position: camera.position.toArray(),
      quaternion: camera.quaternion.toArray(),
      projection: camera.projectionMatrix.toArray(),
      target: controls.target.toArray(),
    });
    textureEditor.update();
  };
  const progressive = progressiveRenderer(
    renderer,
    scene,
    camera,
    (status) => current().onTraceStatus?.(status),
    async () => {
      await environmentReady;
      await library.ready();
    },
  );
  const library = createMaterialLibrary(() => {
    progressive.invalidate(false, true);
    draw();
  });
  let studioEnvironment: THREE.Texture | undefined;
  const environmentReady = loadStudioEnvironment()
    .then((texture) => {
      if (disposed) {
        texture.dispose();
        return;
      }
      studioEnvironment = texture;
      scene.environment = texture;
      scene.environmentRotation.set(
        Math.PI / 2,
        0,
        THREE.MathUtils.degToRad(current().settings.lightRotation ?? 0),
      );
      canvas.dataset.environment = 'studio-hdri';
      progressive.lighting();
      draw();
    })
    .catch(() => {
      // Modeling remains usable even if an offline cache lacks the studio image.
      canvas.dataset.environment = 'neutral-fallback';
    });
  const lights = new THREE.Group();
  scene.add(lights);
  const labels = new THREE.Group();
  scene.add(labels);
  const navigation = installCameraNavigation(controls, canvas, () => model.children);
  let cameraFrame = 0;
  const cameraDraw = () => {
    if (!cameraFrame)
      cameraFrame = requestAnimationFrame(() => {
        cameraFrame = 0;
        if (!disposed) draw();
      });
  };
  const cameraStart = () => progressive.interaction(true);
  const cameraEnd = () => progressive.interaction(false);
  controls.addEventListener('change', cameraDraw);
  controls.addEventListener('start', cameraStart);
  controls.addEventListener('end', cameraEnd);
  // A drag may end outside the window or lose capture without OrbitControls
  // receiving pointerup. Never leave the refinement gate latched in that case.
  canvas.addEventListener('lostpointercapture', cameraEnd);
  window.addEventListener('blur', cameraEnd);
  const resize = () => {
    const width = host.clientWidth,
      height = host.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    progressive.resize();
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
        (Array.isArray(object.material) ? object.material : [object.material]).forEach(
          disposeMaterial,
        );
      }
    model.clear();
    lights.traverse((o) => {
      if (o instanceof THREE.SpotLight) o.shadow.dispose();
    });
    lights.clear();
    labels.traverse((o) => {
      if (o instanceof THREE.Sprite) {
        o.material.map?.dispose();
        o.material.dispose();
      }
    });
    labels.clear();
  };
  let previousModel: RenderModel | undefined;
  let sceneBuilds = 0;
  let prepareTimer = 0;
  const sync = () => {
    const next = current();
    if (canUpdateSurfaces(previousModel, next)) {
      const previous = new Map(previousModel!.bodies.map((body) => [body.id, body]));
      const bodies = new Map(next.bodies.map((body) => [body.id, body]));
      let changed = false;
      for (const object of model.children) {
        if (!(object instanceof THREE.Mesh)) continue;
        const body = bodies.get(object.userData.bodyId)!;
        if (
          surfaceKey(previous.get(body.id)!) === surfaceKey(body) &&
          previousModel!.assets === next.assets
        )
          continue;
        const surface = library.create(body, next.assets);
        const existing = Array.isArray(object.material) ? object.material : [object.material];
        for (let i = 0; i < existing.length; i++) {
          // Retain material identity: the trace snapshot shares these instances.
          disposeMaterial(existing[i]);
          existing[i].copy(surface);
          if (i > 0) mirrorBacking(existing[i] as THREE.MeshPhysicalMaterial);
        }
        surface.dispose();
        object.castShadow = surface.transmission < 0.5;
        changed = true;
      }
      previousModel = { ...next };
      navigation.sync(next.bodies, next.selectedIds ?? []);
      if (changed) {
        renderer.shadowMap.needsUpdate = true;
        draw(true);
      }
      return;
    }
    renderer.shadowMap.needsUpdate = true;
    clearModel();
    library.beginFrame();
    const { bodies, meshes } = current();
    const areaLights: THREE.Group[] = [];
    let shadowSpots = 0;
    const bodiesById = new Map(bodies.map((body) => [body.id, body]));
    for (const data of meshes) {
      const body = bodiesById.get(data.id);
      if (!body) continue;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.vertices, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(data.normals, 3));
      geometry.setIndex(data.triangles);
      materialUV(geometry, body);
      const surface = library.create(body, current().assets);
      let materials: THREE.MeshPhysicalMaterial | THREE.MeshPhysicalMaterial[] = surface;
      if (body.appearance?.preset === 'mirror') {
        const backing = surface.clone();
        mirrorBacking(backing);
        materials = [surface, backing];
        geometry.clearGroups();
        for (const group of mirrorFaceGroups(geometry, body))
          geometry.addGroup(group.start, group.count, group.reflective ? 0 : 1);
      }
      const mesh = new THREE.Mesh(geometry, materials);
      mesh.userData.bodyId = body.id;
      mesh.castShadow = surface.transmission < 0.5;
      mesh.receiveShadow = true;
      model.add(mesh);
      const partLights = createPartLights(body, geometry);
      const traceLights = createTraceLights(body, geometry);
      if (traceLights.children.length) lights.add(traceLights);
      if (partLights.userData.previewOnly) areaLights.push(partLights);
      else {
        if (partLights.children.length) {
          partLights.visible = shadowSpots++ < previewLightLimit;
          partLights.userData.traceOnly = !partLights.visible;
          lights.add(partLights);
        }
      }
    }
    library.endFrame();
    areaLights.sort((a, b) => b.userData.power - a.userData.power);
    // All local shadow maps share a budget; leave sampler capacity for PBR maps
    // and studio lighting on devices with 16 fragment texture units.
    let surfaceShadows = Math.min(shadowSpots, previewLightLimit),
      surfaceParts = 0;
    for (const light of areaLights.slice(0, previewLightLimit)) {
      const count = light.children.filter((o) => o instanceof THREE.SpotLight).length;
      if (surfaceShadows + count > previewLightLimit) continue;
      lights.add(light);
      surfaceShadows += count;
      surfaceParts++;
    }
    canvas.dataset.surfaceLights = String(areaLights.length);
    canvas.dataset.previewSurfaceLights = String(surfaceParts);
    canvas.dataset.spotLights = String(shadowSpots);
    navigation.sync(bodies, current().selectedIds ?? []);
    const box = bounds(bodies),
      a = new THREE.Vector3(...box.min),
      b = new THREE.Vector3(...box.max),
      center = a.clone().add(b).multiplyScalar(0.5);
    extent = Math.max(100, a.distanceTo(b));
    lights.traverse((light) => {
      if (light instanceof THREE.SpotLight) {
        light.shadow.camera.far = Math.max(1000, extent * 4);
        light.shadow.camera.updateProjectionMatrix();
      }
    });
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
    if (current().partNumbers) {
      for (const body of bodies) {
        const number = current().partNumbers?.[body.id];
        if (!number) continue;
        const image = document.createElement('canvas');
        image.width = image.height = 96;
        const ctx = image.getContext('2d')!;
        ctx.fillStyle = '#203f32';
        ctx.beginPath();
        ctx.arc(48, 48, 37, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.font = 'bold 38px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'white';
        ctx.fillText(String(number), 48, 50);
        const texture = new THREE.CanvasTexture(image),
          material = new THREE.SpriteMaterial({
            map: texture,
            depthTest: false,
            toneMapped: false,
          });
        const sprite = new THREE.Sprite(material);
        sprite.renderOrder = 100;
        sprite.position.set(
          body.origin[0] + body.feature.width / 2,
          body.origin[1] + body.feature.depth / 2,
          body.origin[2] + body.feature.height / 2,
        );
        sprite.scale.setScalar(extent * 0.045);
        labels.add(sprite);
      }
    }
    progressive.invalidate(true);
    settingsOnly();
    resize();
    if (!initialized) {
      initialized = true;
      fit();
    } else draw();
    canvas.dataset.bodyCount = String(model.children.length);
    canvas.dataset.sceneBuilds = String(++sceneBuilds);
    previousModel = { ...next };
    clearTimeout(prepareTimer);
    prepareTimer = window.setTimeout(() => progressive.prepare(), 600);
  };
  let previousLighting = '';
  const settingsOnly = () => {
    renderer.shadowMap.needsUpdate = true;
    const settings = current().settings;
    const color = { studio: '#e8ece9', warm: '#eee3d2', dark: '#25313a' }[settings.environment];
    scene.background = new THREE.Color(color);
    floor.material.color.set(color);
    key.color.set(settings.environment === 'warm' ? '#ffe3b7' : '#fff6e9');
    scene.environmentIntensity =
      (settings.environment === 'dark' ? 0.025 : 0.7) * (settings.environmentPower ?? 1);
    ambient.intensity =
      (settings.environment === 'dark' ? 0.03 : 1.1) * (settings.environmentPower ?? 1);
    key.intensity = (settings.environment === 'dark' ? 0.03 : 3) * (settings.lightPower ?? 1);
    fill.intensity = (settings.environment === 'dark' ? 0.02 : 1.3) * (settings.lightPower ?? 1);
    const center = key.target.position;
    const rotation = THREE.MathUtils.degToRad(settings.lightRotation ?? 0),
      axis = new THREE.Vector3(0, 0, 1);
    if (studioEnvironment) scene.environmentRotation.set(Math.PI / 2, 0, rotation);
    key.position.copy(
      new THREE.Vector3(-extent, -extent * 0.8, extent * 1.8)
        .applyAxisAngle(axis, rotation)
        .add(center),
    );
    fill.position.copy(
      new THREE.Vector3(extent, extent, extent).applyAxisAngle(axis, rotation).add(center),
    );
    for (const [source, panel, size] of [
      [key, softKey, 1.2],
      [fill, softFill, 1.6],
    ] as const) {
      panel.position.copy(source.position);
      panel.up.set(0, 0, 1);
      panel.lookAt(center);
      panel.width = panel.height = extent * size;
      panel.color.copy(source.color);
      // Preserve roughly the same incident light at the model centre as its
      // directional preview, independently of scene units and model size.
      panel.intensity =
        (source.intensity * source.position.distanceToSquared(center)) /
        (panel.width * panel.height);
    }
    const ground = settings.ground ?? true;
    if (floor.visible !== ground) progressive.invalidate(true);
    floor.visible = ground;
    const lighting = JSON.stringify([
      settings.environment,
      settings.environmentPower,
      settings.lightPower,
      settings.lightRotation,
    ]);
    if (lighting !== previousLighting) {
      previousLighting = lighting;
      progressive.lighting();
      progressive.invalidate(false, true);
    }
    renderer.toneMappingExposure = settings.exposure;
    renderer.shadowMap.enabled = settings.shadows;
    draw(false, false);
  };
  const textureEditor = installTextureEditing({
    host,
    canvas,
    camera: () => camera,
    hitAt: (ray) => {
      const hit = ray.intersectObjects(model.children)[0];
      return hit?.face
        ? {
            bodyId: hit.object.userData.bodyId,
            point: hit.point,
            normal: hit.face.normal.clone().transformDirection(hit.object.matrixWorld),
          }
        : undefined;
    },
    current: () => {
      const editing = current().editingTexture;
      const body = current().bodies.find((b) => b.id === editing?.id);
      return editing && body
        ? {
            body,
            texture: editing.appearance.texture,
            change: (texture) => current().onTexture(texture),
            commit: () => current().onTextureCommit?.(),
          }
        : undefined;
    },
    enableCamera: (enabled) => {
      controls.enabled = enabled;
    },
    onStart: () => {
      start = undefined;
    },
  });
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
    trace: progressive,
    capture: async () => {
      await library.ready();
      if (disposed) throw new Error('Renderöintinäkymä suljettiin ennen kuvan aloitusta.');
      return captureRenderScene(scene, camera, camera.aspect, renderer.toneMappingExposure);
    },
    appearance(ids: string[], appearance: Appearance) {
      for (const object of model.children)
        if (object instanceof THREE.Mesh && ids.includes(object.userData.bodyId)) {
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) =>
            updateMaterialPlacement(material as THREE.MeshPhysicalMaterial, appearance.texture),
          );
        }
      textureEditor.update();
      draw(true);
    },
    color(preview?: ColorPreview) {
      const ids = new Set(preview?.ids);
      const bodies = new Map(current().bodies.map((body) => [body.id, body]));
      for (const object of model.children) {
        if (!(object instanceof THREE.Mesh)) continue;
        const body = bodies.get(object.userData.bodyId);
        if (!body) continue;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials)
          if (!material.userData.mirrorBacking)
            (material as THREE.MeshPhysicalMaterial).color.set(
              ids.has(body.id) ? preview!.color : body.color,
            );
      }
      draw(true);
    },
    selection() {
      controls.mouseButtons.LEFT =
        current().materialTool && current().materialTool !== 'select' ? null! : THREE.MOUSE.ROTATE;
      navigation.sync(current().bodies, current().selectedIds ?? []);
      if (!current().editingTexture) textureEditor.cancel();
      textureEditor.update();
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
      disposed = true;
      clearTimeout(prepareTimer);
      progressive.dispose();
      observer.disconnect();
      cancelAnimationFrame(cameraFrame);
      controls.removeEventListener('change', cameraDraw);
      controls.removeEventListener('start', cameraStart);
      controls.removeEventListener('end', cameraEnd);
      canvas.removeEventListener('lostpointercapture', cameraEnd);
      window.removeEventListener('blur', cameraEnd);
      navigation.dispose();
      controls.dispose();
      textureEditor.dispose();
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointermove', move);
      clearModel();
      floor.geometry.dispose();
      floor.material.dispose();
      key.shadow.dispose();
      env.dispose();
      studioEnvironment?.dispose();
      library.dispose();
      // These lookup textures are shared by Three, but their GPU disposal listeners belong
      // to each renderer. Release them before closing this context; another view can reupload.
      for (const name of ['LTC_FLOAT_1', 'LTC_FLOAT_2', 'LTC_HALF_1', 'LTC_HALF_2']) {
        const texture: unknown = Reflect.get(THREE.UniformsLib, name);
        if (texture instanceof THREE.Texture) texture.dispose();
      }
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
