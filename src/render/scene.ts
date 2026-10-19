import { layerDomain } from './layers';
import { setCameraLens, defaultFocalLength } from './cameraLens';
import { installTextureEditing } from '../viewport/textureEditing';
import { canUpdateSurfaces, surfaceKey, type RenderModel } from './sceneChanges';
import { loadStudioEnvironment } from './environment';
import {
  aimLight,
  createSunLighting,
  imageToneMapping,
  setTraceShadows,
  studioOffsets,
} from './lighting';
import type { ColorPreview } from '../model/colorPreview';
import { createPartLights, createTraceLights, previewLightLimit } from './lights';
import { progressiveRenderer, type TraceStatus } from './progressive';
import { prepareWithin } from './tracePreparation';
import { imageLook } from './imageLook';
import { mirrorBacking } from './mirror';
import { partEmitterGroups, renderFaceMaterials } from './faceMaterials';
import { faceMaterialBody } from '../model/faceMaterials';
import { captureRenderScene } from './snapshot';
import {
  createMaterialLibrary,
  updateMaterialPlacement,
  materialUV,
  disposeMaterial,
  setMaterialColor,
  bindPreviewShadowsOnce,
} from './materials';
import { type Appearance, type TexturePlacement, type TextureAsset } from '../model/materials';
import { installCameraNavigation } from '../viewport/cameraNavigation';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { BodyMesh } from '../cad/protocol';
import { bounds, type Body, type Project } from '../model/project';
import type { RenderView } from '../model/renderViews';
import { createRenderer } from '../viewport/graphicsContext';

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
  onPick: (id: string, face?: number) => void;
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
  const renderer = createRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
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
  setCameraLens(camera, current().settings.focalLength);
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
  scene.add(fill, fill.target);
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
  const sunLighting = createSunLighting(scene);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshStandardMaterial({ color: '#dce1dc', roughness: 0.95 }),
  );
  floor.receiveShadow = true;
  bindPreviewShadowsOnce(floor.material);
  scene.add(floor);
  let disposed = false;
  const lifetime = new AbortController();
  let extent = 100,
    initialized = false;
  const look = imageLook(current().settings);
  const draw = (materials = false, invalidate = true) => {
    if (disposed || renderer.getContext().isContextLost()) return;
    look.renderScene(renderer, scene, camera);
    if (invalidate) progressive.invalidate(false, materials);
    else progressive.display();
    canvas.dataset.camera = JSON.stringify({
      position: camera.position.toArray(),
      quaternion: camera.quaternion.toArray(),
      projection: camera.projectionMatrix.toArray(),
      target: controls.target.toArray(),
      focalLength: camera.getFocalLength(),
      fov: camera.fov,
      aspect: camera.aspect,
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
    look,
  );
  // The trace atlas packs independent sizes and prioritizes color detail. A
  // second material must not silently downgrade the same wood in this project.
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
      // Populate Three's PMREM cache before a material draw. In r186 a nested
      // environment conversion can restore a stale texture-unit cursor from
      // the outer render, leaving too few bindings for this room's shadows.
      renderer.compile(floor, camera, scene);
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
    setCameraLens(camera, current().settings.focalLength);
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
        const existing = Array.isArray(object.material) ? object.material : [object.material];
        for (const [materialIndex, material] of existing.entries()) {
          const index = material.userData.facePaintIndex as number | undefined;
          const source = faceMaterialBody(body, index);
          const surface = library.create(
            source,
            next.assets,
            source.appearance?.layers?.length
              ? (() => {
                  const ranges = (object.geometry as THREE.BufferGeometry).groups
                    .filter((g) => g.materialIndex === materialIndex)
                    .map((g) => layerDomain(object.geometry, g.start, g.count));
                  if (!ranges.length) return layerDomain(object.geometry);
                  const x = Math.min(...ranges.map((r) => r.x)),
                    y = Math.min(...ranges.map((r) => r.y));
                  return {
                    x,
                    y,
                    width: Math.max(...ranges.map((r) => r.x + r.width)) - x,
                    height: Math.max(...ranges.map((r) => r.y + r.height)) - y,
                  };
                })()
              : undefined,
          );
          const backing = material.userData.mirrorBacking;
          // Retain material identity: the trace snapshot shares these instances.
          disposeMaterial(material);
          material.copy(surface);
          if (backing) mirrorBacking(material as THREE.MeshPhysicalMaterial);
          material.userData.facePaintIndex = index;
          material.userData.surfaceColor = source.color;
          surface.dispose();
        }
        object.castShadow = existing.some(
          (m) => (m as THREE.MeshPhysicalMaterial).transmission < 0.5,
        );
        changed = true;
      }
      previousModel = { ...next };
      navigation.sync(next.bodies, next.selectedIds ?? []);
      if (changed) {
        setTraceShadows(model, next.settings.shadows);
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
      materialUV(geometry, body, data.faces);
      const materials = renderFaceMaterials(geometry, body, data, (source, range) =>
        library.create(
          source,
          current().assets,
          source.appearance?.layers?.length
            ? layerDomain(geometry, range.start, range.count)
            : undefined,
        ),
      );
      const mesh = new THREE.Mesh(geometry, materials);
      mesh.userData.bodyId = body.id;
      mesh.userData.faces = data.faces;
      mesh.castShadow = materials.some((m) => m.transmission < 0.5);
      mesh.receiveShadow = true;
      model.add(mesh);
      for (const range of partEmitterGroups(geometry, body, data)) {
        const emitter = new THREE.BufferGeometry();
        const indices = range.indices;
        emitter.setAttribute(
          'position',
          new THREE.Float32BufferAttribute(
            indices.flatMap((i) => data.vertices.slice(i * 3, i * 3 + 3)),
            3,
          ),
        );
        emitter.setAttribute(
          'normal',
          new THREE.Float32BufferAttribute(
            indices.flatMap((i) => data.normals.slice(i * 3, i * 3 + 3)),
            3,
          ),
        );
        const partLights = createPartLights(range.source, emitter);
        const traceLights = createTraceLights(range.source, emitter);
        emitter.dispose();
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
  };
  let previousLighting = '';
  let previousEnvironment: RenderSettings['environment'] | undefined;
  const settingsOnly = () => {
    const settings = current().settings;
    const focalLength = settings.focalLength ?? defaultFocalLength;
    if (Math.abs(camera.getFocalLength() - focalLength) > 1e-8) {
      setCameraLens(camera, focalLength);
      progressive.invalidate(false);
    }
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
    const rotation = THREE.MathUtils.degToRad(settings.lightRotation ?? 0);
    if (studioEnvironment) scene.environmentRotation.set(Math.PI / 2, 0, rotation);
    const [keyOffset, fillOffset] = studioOffsets(
      settings.lightRotation ?? 0,
      settings.lightElevation,
    );
    key.position.copy(keyOffset).multiplyScalar(extent).add(center);
    fill.position.copy(fillOffset).multiplyScalar(extent).add(center);
    fill.target.position.copy(center);
    for (const [source, panel, size] of [
      [key, softKey, 1.2],
      [fill, softFill, 1.6],
    ] as const) {
      panel.position.copy(source.position);
      aimLight(panel, center);
      panel.width = panel.height = extent * size * (settings.studioSoftness ?? 1);
      panel.color.copy(source.color);
      // Preserve roughly the same incident light at the model centre as its
      // directional preview, independently of scene units and model size.
      panel.intensity =
        (source.intensity * source.position.distanceToSquared(center)) /
        (panel.width * panel.height);
    }
    key.shadow.radius = Math.max(0.5, (settings.studioSoftness ?? 1) * 2);
    sunLighting.update(settings.sun, center, extent);
    const ground = settings.ground ?? true;
    if (floor.visible !== ground) {
      progressive.invalidate(true);
      renderer.shadowMap.needsUpdate = true;
    }
    floor.visible = ground;
    const lighting = JSON.stringify([
      settings.environment,
      settings.environmentPower,
      settings.lightPower,
      settings.lightRotation,
      settings.lightElevation,
      settings.studioSoftness,
      settings.sun,
    ]);
    if (lighting !== previousLighting) {
      previousLighting = lighting;
      renderer.shadowMap.needsUpdate = true;
      progressive.lighting();
      // Only a background change also recolors the floor material. Sun and
      // studio gestures must not repack every PBR texture in the project.
      progressive.invalidate(false, settings.environment !== previousEnvironment);
    }
    previousEnvironment = settings.environment;
    renderer.toneMappingExposure = settings.exposure;
    renderer.toneMapping = imageToneMapping(settings.look);
    look.configure(settings);
    if (renderer.shadowMap.enabled !== settings.shadows) renderer.shadowMap.needsUpdate = true;
    renderer.shadowMap.enabled = settings.shadows;
    if (setTraceShadows(scene, settings.shadows)) progressive.invalidate(false, true);
    canvas.dataset.lighting = JSON.stringify({
      rotation: settings.lightRotation ?? 0,
      studioPower: settings.lightPower ?? 1,
      studioElevation: settings.lightElevation ?? null,
      studioDirections: [key, fill].map((light) =>
        light.position.clone().sub(center).normalize().toArray(),
      ),
      shadows: settings.shadows,
      environmentPower: settings.environmentPower ?? 1,
      softness: settings.studioSoftness ?? 1,
      sun: settings.sun ?? null,
      sunDirection: sunLighting.preview.position.clone().sub(center).normalize().toArray(),
      look: settings.look ?? 'standard',
      lookStrength: settings.lookStrength ?? 0.5,
    });
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
    if (hit) {
      const face = (hit.object.userData.faces as BodyMesh['faces'] | undefined)?.find(
        (f) =>
          hit.faceIndex !== undefined &&
          hit.faceIndex !== null &&
          hit.faceIndex * 3 >= f.start &&
          hit.faceIndex * 3 < f.start + f.count,
      );
      current().onPick(hit.object.userData.bodyId, face?.index);
    }
  };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointermove', move);
  return {
    sync,
    fit,
    settings: settingsOnly,
    cameraView: (): Omit<RenderView, 'id' | 'name'> => ({
      position: camera.position.toArray(),
      target: controls.target.toArray(),
      focalLength: current().settings.focalLength ?? defaultFocalLength,
    }),
    restoreCameraView(view: RenderView) {
      camera.position.set(...view.position);
      camera.up.set(0, 0, 1);
      controls.target.set(...view.target);
      const distance = camera.position.distanceTo(controls.target);
      controls.minDistance = Math.min(controls.minDistance, distance / 2);
      controls.maxDistance = Math.max(controls.maxDistance, distance * 2);
      camera.near = Math.min(camera.near, distance / 10000);
      camera.far = Math.max(camera.far, distance * 4);
      setCameraLens(camera, view.focalLength);
      camera.lookAt(controls.target);
      camera.updateMatrixWorld();
      controls.update();
      progressive.interaction(false);
      draw();
    },
    trace: progressive,
    capture: async () => {
      await prepareWithin(Promise.all([environmentReady, library.ready()]), lifetime.signal);
      if (disposed) throw new Error('Renderöintinäkymä suljettiin ennen kuvan aloitusta.');
      return captureRenderScene(
        scene,
        camera,
        camera.aspect,
        renderer.toneMappingExposure,
        renderer.toneMapping,
        current().settings,
      );
    },
    appearance(ids: string[], appearance: Appearance) {
      for (const object of model.children)
        if (object instanceof THREE.Mesh && ids.includes(object.userData.bodyId)) {
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials
            .filter((m) => m.userData.facePaintIndex === undefined)
            .forEach((material) =>
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
            setMaterialColor(
              material as THREE.MeshPhysicalMaterial,
              material.userData.facePaintIndex !== undefined
                ? material.userData.surfaceColor
                : ids.has(body.id)
                  ? preview!.color
                  : body.color,
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
      await prepareWithin(Promise.all([environmentReady, library.ready()]), lifetime.signal);
      if (disposed) throw new Error('Renderöintinäkymä suljettiin ennen kuvan tallentamista.');
      const size = renderer.getSize(new THREE.Vector2()),
        pixelRatio = renderer.getPixelRatio();
      const height = Math.max(1, Math.round(width / camera.aspect));
      try {
        renderer.setPixelRatio(1);
        renderer.setSize(width, height, false);
        // Still exports keep their requested resolution; only the interactive
        // styled preview is capped to protect navigation on dense displays.
        look.renderScene(renderer, scene, camera, Infinity);
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
      lifetime.abort();
      progressive.dispose();
      look.dispose();
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
      sunLighting.dispose();
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
