import { materialFaceRanges } from '../render/layerUV';
import { layerDomain } from '../render/layers';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { selectionPivot, transformSelection } from './editing';
import { visibleFrom } from './topology';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';
import { createMaterialLibrary, disposeMaterial, materialUV } from '../render/materials';
import { faceMaterialBody } from '../model/faceMaterials';
import type { Body, Project, Vec3 } from '../model/project';
import { appearancePreset, defaultAppearance, emissionSettings } from '../model/materials';
import { geometryOf, meshBounds, type SurfaceMesh } from './mesh';
import { sculptMesh, type BrushStamp, type SculptMode } from './sculpt';
import type { SurfaceMaps, PixelMap, MapChannel } from './maps';

export type SurfaceTool = 'orbit' | 'paint' | 'mask' | SculptMode;
export interface StageProps {
  mesh: SurfaceMesh;
  selection?: number[];
  loops?: number[][];
  transformMode?: 'translate' | 'rotate' | 'scale';
  onTransformed: (mesh: SurfaceMesh) => void;
  onSelectLoop: (index: number) => void;
  onMask: (stamps: BrushStamp[], erase: boolean) => void;
  onCancelStroke: () => void;
  body: Body;
  assets: Project['assets'];
  maps: SurfaceMaps;
  tool: SurfaceTool;
  radius: number;
  strength: number;
  wire: boolean;
  pinBoundary: boolean;
  plane?: { axis: number; coordinate: number };
  resetCamera: number;
  onStart: () => void;
  onPaint: (stamps: BrushStamp[]) => void;
  onFinish: (mesh?: SurfaceMesh) => void;
  onError: (error: string) => void;
}
export function mapCanvas(map: PixelMap) {
  const canvas = document.createElement('canvas');
  canvas.width = map.size;
  canvas.height = map.size;
  canvas
    .getContext('2d')!
    .putImageData(new ImageData(new Uint8ClampedArray(map.pixels), map.size, map.size), 0, 0);
  return canvas;
}
function mapTexture(map: PixelMap | undefined, color = false) {
  if (!map) return null;
  const texture = new THREE.CanvasTexture(mapCanvas(map));
  texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.anisotropy = 4;
  texture.userData.surfacePixels = map;
  return texture;
}
export function SurfaceStage(props: StageProps) {
  const root = useRef<HTMLDivElement>(null),
    live = useRef(props);
  live.current = props;
  const runtime = useRef<
    | {
        mesh: THREE.Mesh;
        wire: THREE.LineSegments;
        plane: THREE.Mesh;
        selection: THREE.LineSegments;
        points: THREE.Points;
        mask: THREE.Mesh;
        gizmo: TransformControls;
        pivot: THREE.Object3D;
        controls: OrbitControls;
        camera: THREE.PerspectiveCamera;
        render: () => void;
        fit: () => void;
        library: ReturnType<typeof createMaterialLibrary>;
        materialSource?: { mesh: SurfaceMesh; body: Body; atlas: boolean };
        geometrySource?: SurfaceMesh;
        geometryDirty?: boolean;
      }
    | undefined
  >(undefined);
  useEffect(() => {
    const element = root.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      live.current.onError('Verkon esikatselu tarvitsee WebGL2-tuen.');
      return;
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.setClearColor('#1a242d');
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    element.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-label', 'Verkon esikatselu');
    const scene = new THREE.Scene(),
      camera = new THREE.PerspectiveCamera(42, 1, 0.01, 1000000);
    camera.up.set(0, 0, 1);
    const pmrem = new THREE.PMREMGenerator(renderer),
      room = new RoomEnvironment();
    const environment = pmrem.fromScene(room, 0.04);
    scene.environment = environment.texture;
    room.dispose();
    pmrem.dispose();
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.screenSpacePanning = true;
    scene.add(new THREE.HemisphereLight('#edf5ff', '#4b3d32', 2.2));
    for (const [x, y, z, intensity] of [
      [1, -1, 2, 2.4],
      [-1, 1, 0.5, 1.2],
    ]) {
      const light = new THREE.DirectionalLight('#fff5e9', intensity);
      light.position.set(x, y, z);
      scene.add(light);
    }
    const object = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshStandardMaterial({ color: '#bbc9cd', roughness: 0.65, side: THREE.DoubleSide }),
    );
    object.raycast = acceleratedRaycast;
    scene.add(object);
    const wire = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        color: '#70c9da',
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
      }),
    );
    scene.add(wire);
    const ring = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(
        Array.from(
          { length: 64 },
          (_, i) =>
            new THREE.Vector3(
              Math.cos((i / 64) * Math.PI * 2),
              Math.sin((i / 64) * Math.PI * 2),
              0,
            ),
        ),
      ),
      new THREE.LineBasicMaterial({ color: '#ffb85b', depthTest: false }),
    );
    ring.visible = false;
    ring.renderOrder = 10;
    scene.add(ring);
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        color: '#ffad61',
        transparent: true,
        opacity: 0.18,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    plane.visible = false;
    scene.add(plane);
    const selectedLines = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: '#ffad61', depthTest: false, depthWrite: false }),
    );
    const selectedPoints = new THREE.Points(
      new THREE.BufferGeometry(),
      new THREE.PointsMaterial({
        color: '#ffce88',
        size: 6,
        sizeAttenuation: false,
        depthTest: false,
        depthWrite: false,
      }),
    );
    selectedLines.renderOrder = selectedPoints.renderOrder = 12;
    const mask = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    );
    mask.renderOrder = 4;
    const pivot = new THREE.Object3D(),
      gizmo = new TransformControls(camera, renderer.domElement);
    gizmo.setSize(0.7);
    gizmo.setSpace('world');
    scene.add(selectedLines, selectedPoints, mask, pivot, gizmo.getHelper());
    let transformBase: SurfaceMesh | undefined, transformPreview: SurfaceMesh | undefined;
    const inversePivot = new THREE.Matrix4();
    gizmo.addEventListener('mouseDown', () => {
      transformBase = live.current.mesh;
      transformPreview = undefined;
      pivot.updateMatrixWorld();
      inversePivot.copy(pivot.matrixWorld).invert();
      controls.enabled = false;
    });
    gizmo.addEventListener('objectChange', () => {
      if (!transformBase) return;
      pivot.updateMatrixWorld();
      transformPreview = transformSelection(
        transformBase,
        live.current.selection ?? [],
        new THREE.Matrix4().multiplyMatrices(pivot.matrixWorld, inversePivot),
      );
      (object.geometry.getAttribute('position') as THREE.BufferAttribute).copyArray(
        new Float32Array(transformPreview.positions),
      );
      object.geometry.getAttribute('position').needsUpdate = true;
      (object.geometry.getAttribute('normal') as THREE.BufferAttribute).copyArray(
        new Float32Array(transformPreview.normals),
      );
      object.geometry.getAttribute('normal').needsUpdate = true;
      object.geometry.computeBoundingSphere();
      if (runtime.current) runtime.current.geometryDirty = true;
      const selected = (live.current.selection ?? []).flatMap((i) =>
        transformPreview!.positions.slice(i * 3, i * 3 + 3),
      );
      (selectedPoints.geometry.getAttribute('position') as THREE.BufferAttribute)?.copyArray(
        new Float32Array(selected),
      );
      if (selectedPoints.geometry.getAttribute('position'))
        selectedPoints.geometry.getAttribute('position').needsUpdate = true;
      selectedPoints.geometry.computeBoundingSphere();
      selectedLines.visible = mask.visible = wire.visible = false;
      selectedPoints.visible = true;
      render();
    });
    gizmo.addEventListener('mouseUp', () => {
      const next = transformPreview;
      transformBase = transformPreview = undefined;
      controls.enabled = true;
      if (next) live.current.onTransformed(next);
    });
    gizmo.addEventListener('change', () => render());
    let frame = 0,
      disposed = false;
    const render = () => {
      if (!frame && !disposed)
        frame = requestAnimationFrame(() => {
          frame = 0;
          if (!disposed) renderer.render(scene, camera);
        });
    };
    const fit = () => {
      const b = meshBounds(live.current.mesh),
        span = Math.max(...b.size, 1),
        center = new THREE.Vector3(...b.center);
      controls.target.copy(center);
      camera.position
        .copy(center)
        .add(new THREE.Vector3(1.4, -1.8, 1.2).normalize().multiplyScalar(span * 2.7));
      camera.near = Math.max(0.001, span / 10000);
      camera.far = Math.max(1000, span * 100);
      camera.updateProjectionMatrix();
      controls.update();
      render();
    };
    const library = createMaterialLibrary(render);
    runtime.current = {
      mesh: object,
      wire,
      plane,
      selection: selectedLines,
      points: selectedPoints,
      mask,
      gizmo,
      pivot,
      controls,
      camera,
      render,
      fit,
      library,
    };
    const resize = new ResizeObserver(() => {
      const { width, height } = element.getBoundingClientRect();
      renderer.setSize(Math.max(1, width), Math.max(1, height));
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
      render();
    });
    resize.observe(element);
    controls.addEventListener('change', render);
    const raycaster = new THREE.Raycaster();
    raycaster.firstHitOnly = true;
    let stroke: SurfaceMesh | undefined,
      active = false,
      lastPoint: THREE.Vector3 | undefined,
      lastTime = 0;
    let lastPointer: { x: number; y: number } | undefined;
    const hit = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      raycaster.setFromCamera(
        new THREE.Vector2(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          (-(event.clientY - rect.top) / rect.height) * 2 + 1,
        ),
        camera,
      );
      return raycaster.intersectObject(object, false)[0];
    };
    const sample = (event: PointerEvent, force = false) => {
      const p = live.current,
        h = hit(event);
      if (!h) {
        ring.visible = false;
        render();
        return;
      }
      const normal = (h.normal ?? h.face?.normal ?? new THREE.Vector3(0, 0, 1)).clone().normalize();
      ring.visible = p.tool !== 'orbit';
      ring.position.copy(h.point);
      ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
      ring.scale.setScalar(p.radius);
      render();
      if (!active || (!force && performance.now() - lastTime < 35)) return;
      const distance = lastPoint?.distanceTo(h.point) ?? p.radius;
      if (!force && distance < p.radius * 0.12) return;
      const steps = lastPoint
          ? Math.min(24, Math.max(1, Math.ceil(distance / (p.radius * 0.25))))
          : 1,
        stamps: BrushStamp[] = [];
      for (let i = 1; i <= steps; i++) {
        const sampled = lastPointer
          ? hit({
              clientX: lastPointer.x + ((event.clientX - lastPointer.x) * i) / steps,
              clientY: lastPointer.y + ((event.clientY - lastPointer.y) * i) / steps,
            } as PointerEvent)
          : h;
        if (!sampled) continue;
        stamps.push({
          point: sampled.point.toArray() as Vec3,
          normal: (sampled.normal ?? sampled.face!.normal).toArray() as Vec3,
          radius: p.radius,
          strength: p.strength,
          triangle: sampled.faceIndex ?? undefined,
          camera: camera.position.toArray() as Vec3,
        });
      }
      lastPointer = { x: event.clientX, y: event.clientY };
      lastPoint = h.point.clone();
      lastTime = performance.now();
      try {
        if (p.tool === 'mask') p.onMask(stamps, event.shiftKey);
        else if (p.tool === 'paint') p.onPaint(stamps);
        else if (p.tool !== 'orbit' && stroke) {
          for (const stamp of stamps)
            stroke = sculptMesh(
              stroke,
              stamp,
              event.shiftKey ? 'smooth' : p.tool,
              p.pinBoundary,
              visibleFrom(stroke, stamp.camera, object.geometry.boundsTree as MeshBVH),
            );
          (object.geometry.getAttribute('position') as THREE.BufferAttribute).copyArray(
            new Float32Array(stroke.positions),
          );
          object.geometry.getAttribute('position').needsUpdate = true;
          (object.geometry.getAttribute('normal') as THREE.BufferAttribute).copyArray(
            new Float32Array(stroke.normals),
          );
          object.geometry.getAttribute('normal').needsUpdate = true;
          object.geometry.computeBoundingSphere();
          object.geometry.boundsTree?.refit();
          if (runtime.current) runtime.current.geometryDirty = true;
          wire.visible = false;
          render();
        }
      } catch (e) {
        p.onError((e as Error).message);
      }
    };
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || live.current.tool === 'orbit' || !hit(event)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      controls.enabled = false;
      renderer.domElement.setPointerCapture(event.pointerId);
      active = true;
      stroke = live.current.mesh;
      lastPoint = undefined;
      lastPointer = undefined;
      live.current.onStart();
      sample(event, true);
    };
    const up = (event: PointerEvent) => {
      if (!active) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      active = false;
      controls.enabled = true;
      if (renderer.domElement.hasPointerCapture(event.pointerId))
        renderer.domElement.releasePointerCapture(event.pointerId);
      live.current.onFinish(['paint', 'mask'].includes(live.current.tool) ? undefined : stroke);
      stroke = undefined;
      lastPoint = undefined;
      wire.visible = live.current.wire;
      render();
    };
    const cancel = () => {
      if (active) {
        active = false;
        live.current.onCancelStroke();
        stroke = undefined;
        lastPoint = undefined;
        lastPointer = undefined;
      }
      if (transformBase) {
        const base = transformBase;
        transformBase = transformPreview = undefined;
        gizmo.reset();
        (object.geometry.getAttribute('position') as THREE.BufferAttribute).copyArray(
          new Float32Array(base.positions),
        );
        (object.geometry.getAttribute('normal') as THREE.BufferAttribute).copyArray(
          new Float32Array(base.normals),
        );
        object.geometry.getAttribute('position').needsUpdate = object.geometry.getAttribute(
          'normal',
        ).needsUpdate = true;
        object.geometry.computeBoundingSphere();
        object.geometry.boundsTree?.refit();
        const selected = (live.current.selection ?? []).flatMap((i) =>
          base.positions.slice(i * 3, i * 3 + 3),
        );
        (selectedPoints.geometry.getAttribute('position') as THREE.BufferAttribute)?.copyArray(
          new Float32Array(selected),
        );
        if (selectedPoints.geometry.getAttribute('position'))
          selectedPoints.geometry.getAttribute('position').needsUpdate = true;
        selectedPoints.geometry.computeBoundingSphere();
        selectedLines.visible = selectedPoints.visible = !!live.current.selection?.length;
        mask.visible = !!base.mask?.some((n) => n > 0);
        wire.visible = live.current.wire;
      }
      controls.enabled = true;
      render();
    };
    const escape = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const undo = (event.ctrlKey || event.metaKey) && (key === 'z' || key === 'y');
      if ((event.key === 'Escape' || undo) && (active || transformBase)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        cancel();
      }
    };
    window.addEventListener('keydown', escape, true);
    window.addEventListener('blur', cancel);
    renderer.domElement.addEventListener('pointerdown', down, true);
    renderer.domElement.addEventListener('pointermove', sample);
    renderer.domElement.addEventListener('pointerup', up, true);
    renderer.domElement.addEventListener('pointercancel', cancel, true);
    const leave = () => {
      if (!active) {
        ring.visible = false;
        render();
      }
    };
    renderer.domElement.addEventListener('pointerleave', leave);
    fit();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resize.disconnect();
      window.removeEventListener('keydown', escape, true);
      window.removeEventListener('blur', cancel);
      gizmo.dispose();
      controls.dispose();
      library.dispose();
      runtime.current = undefined;
      renderer.domElement.removeEventListener('pointerdown', down, true);
      renderer.domElement.removeEventListener('pointermove', sample);
      renderer.domElement.removeEventListener('pointerup', up, true);
      renderer.domElement.removeEventListener('pointercancel', cancel, true);
      for (const obj of [object, wire, ring, plane, selectedLines, selectedPoints, mask]) {
        obj.geometry.dispose();
        new Set(Array.isArray(obj.material) ? obj.material : [obj.material]).forEach(
          disposeMaterial,
        );
      }
      renderer.dispose();
      environment.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, []);
  useEffect(() => {
    const r = runtime.current;
    if (!r) return;
    if (
      !r.geometryDirty &&
      r.geometrySource?.positions === props.mesh.positions &&
      r.geometrySource.indices === props.mesh.indices &&
      r.geometrySource.normals === props.mesh.normals
    )
      return;
    r.geometrySource = props.mesh;
    r.geometryDirty = false;
    const g = geometryOf(props.mesh);
    g.boundsTree = new MeshBVH(g, { indirect: true });
    const faces = props.mesh.faces;
    let previous = -1,
      group = -1;
    for (let t = 0; t < faces.length; t++) {
      if (faces[t] !== previous) {
        g.addGroup(t * 3, 3, ++group);
        previous = faces[t];
      } else g.groups.at(-1)!.count += 3;
    }
    r.mesh.geometry.dispose();
    r.mesh.geometry = g;
    r.wire.geometry.dispose();
    r.wire.geometry = new THREE.WireframeGeometry(g);
    r.wire.visible = props.wire;
    r.render();
  }, [props.mesh]);
  useEffect(() => {
    const r = runtime.current;
    if (!r) return;
    const g = r.mesh.geometry;
    const sameMesh =
      r.materialSource?.mesh.positions === props.mesh.positions &&
      r.materialSource.mesh.indices === props.mesh.indices &&
      r.materialSource.mesh.uv === props.mesh.uv;
    if (
      sameMesh &&
      r.materialSource?.body === props.body &&
      !r.materialSource.atlas &&
      !props.maps.color
    )
      return;
    if (
      sameMesh &&
      r.materialSource &&
      r.materialSource.body === props.body &&
      r.materialSource.atlas &&
      props.mesh.uv &&
      props.maps.color
    ) {
      const materials = [
        ...new Set(Array.isArray(r.mesh.material) ? r.mesh.material : [r.mesh.material]),
      ] as THREE.MeshPhysicalMaterial[];
      const channels: [
        MapChannel,
        'map' | 'normalMap' | 'roughnessMap' | 'metalnessMap' | 'aoMap',
      ][] = [
        ['color', 'map'],
        ['normal', 'normalMap'],
        ['roughness', 'roughnessMap'],
        ['metalness', 'metalnessMap'],
        ['ao', 'aoMap'],
      ];
      for (const [channel, key] of channels) {
        const map = props.maps[channel],
          old = materials[0]?.[key];
        if (map && old && old.userData.surfacePixels === map) continue;
        let texture = old;
        if (map && old) {
          const image = old.image as HTMLCanvasElement;
          image.width = image.height = map.size;
          image
            .getContext('2d')!
            .putImageData(
              new ImageData(new Uint8ClampedArray(map.pixels), map.size, map.size),
              0,
              0,
            );
          old.needsUpdate = true;
          old.userData.surfacePixels = map;
        } else {
          old?.dispose();
          texture = mapTexture(map, channel === 'color');
        }
        for (const m of materials) {
          if (m[key] !== texture) {
            m[key] = texture;
            m.needsUpdate = true;
          }
        }
      }
      r.render();
      return;
    }
    r.materialSource = { mesh: props.mesh, body: props.body, atlas: !!props.maps.color };
    new Set(Array.isArray(r.mesh.material) ? r.mesh.material : [r.mesh.material]).forEach(
      disposeMaterial,
    );
    if (props.mesh.uv && props.maps.color) {
      g.setAttribute('uv', new THREE.Float32BufferAttribute(props.mesh.uv, 2));
      const maps = {
        map: mapTexture(props.maps.color, true),
        normalMap: mapTexture(props.maps.normal),
        roughnessMap: mapTexture(props.maps.roughness),
        metalnessMap: mapTexture(props.maps.metalness),
        aoMap: mapTexture(props.maps.ao),
      };
      r.mesh.material = g.groups.map((group) => {
        const source = faceMaterialBody(props.body, props.mesh.faces[group.start / 3]);
        const appearance = source.appearance ?? defaultAppearance(source.material),
          preset = appearancePreset(appearance),
          emission = emissionSettings(appearance, source.color);
        return new THREE.MeshPhysicalMaterial({
          color: '#ffffff',
          roughness: 1,
          metalness: props.maps.metalness ? 1 : 0,
          side: THREE.DoubleSide,
          ...maps,
          transmission: appearance.transmission ?? preset.transmission ?? 0,
          ior: appearance.ior ?? preset.ior ?? 1.5,
          clearcoat:
            (appearance.roughness ?? preset.roughness) === 1 && !appearance.atlasMaps
              ? 0
              : (appearance.clearcoat ?? preset.clearcoat ?? 0),
          clearcoatRoughness:
            appearance.atlasCoatRoughness ?? appearance.roughness ?? preset.roughness,
          emissive: emission.color,
          emissiveIntensity: emission.enabled ? emission.intensity : 0,
        });
      });
    } else if (props.body.appearance?.atlasMaps) {
      const material = new THREE.MeshStandardMaterial({
        color: '#b8c3c8',
        roughness: 0.65,
        side: THREE.DoubleSide,
      });
      r.mesh.material = g.groups.map(() => material);
    } else {
      const temp = g.clone();
      temp.translate(...props.body.origin);
      materialUV(
        temp,
        props.body.feature.type === 'mesh'
          ? { ...props.body, feature: { ...props.body.feature, uv: props.mesh.uv } }
          : props.body,
        materialFaceRanges(props.mesh.faces),
      );
      temp.translate(...(props.body.origin.map((n) => -n) as [number, number, number]));
      for (const attribute of ['position', 'normal', 'uv'])
        g.setAttribute(attribute, temp.getAttribute(attribute).clone());
      g.setIndex(temp.index!.clone());
      temp.dispose();
      r.mesh.material = g.groups.map((group) =>
        r.library.create(
          faceMaterialBody(props.body, props.mesh.faces[group.start / 3]),
          props.assets,
          layerDomain(g, group.start, group.count),
        ),
      );
    }
    r.render();
  }, [props.mesh, props.maps, props.body, props.assets]);
  useEffect(() => {
    const r = runtime.current;
    if (!r) return;
    const chosen = new Set(props.selection ?? []),
      vertices: number[] = [],
      lines: number[] = [];
    for (const i of chosen) vertices.push(...props.mesh.positions.slice(i * 3, i * 3 + 3));
    const edges = new Set<string>();
    for (let t = 0; t < props.mesh.indices.length; t += 3)
      for (let k = 0; k < 3; k++) {
        const a = props.mesh.indices[t + k],
          b = props.mesh.indices[t + ((k + 1) % 3)],
          key = [Math.min(a, b), Math.max(a, b)].join(':');
        if (!chosen.has(a) || !chosen.has(b) || edges.has(key)) continue;
        edges.add(key);
        lines.push(
          ...props.mesh.positions.slice(a * 3, a * 3 + 3),
          ...props.mesh.positions.slice(b * 3, b * 3 + 3),
        );
      }
    r.selection.geometry.dispose();
    r.selection.geometry = new THREE.BufferGeometry().setAttribute(
      'position',
      new THREE.Float32BufferAttribute(lines, 3),
    );
    r.points.geometry.dispose();
    r.points.geometry = new THREE.BufferGeometry().setAttribute(
      'position',
      new THREE.Float32BufferAttribute(vertices, 3),
    );
    r.selection.visible = r.points.visible = chosen.size > 0;
    r.mask.geometry.dispose();
    r.mask.geometry = geometryOf(props.mesh);
    const colors = (props.mesh.mask ?? []).flatMap((n) => [0.47, 0.37, 0.85, n * 0.65]);
    if (colors.length)
      r.mask.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
    r.mask.visible = !!props.mesh.mask?.some((n) => n > 0);
    r.gizmo.detach();
    if (chosen.size && props.transformMode && props.tool === 'orbit') {
      r.pivot.position.set(...selectionPivot(props.mesh, [...chosen]));
      r.pivot.quaternion.identity();
      r.pivot.scale.setScalar(1);
      r.pivot.updateMatrixWorld();
      r.gizmo.setMode(props.transformMode);
      r.gizmo.attach(r.pivot);
    }
    r.render();
  }, [props.mesh, props.selection, props.transformMode, props.tool]);
  useEffect(() => {
    const r = runtime.current;
    if (!r) return;
    r.wire.visible = props.wire;
    r.controls.mouseButtons.LEFT = props.tool === 'orbit' ? THREE.MOUSE.ROTATE : null;
    root.current!.style.cursor = props.tool === 'orbit' ? 'grab' : 'crosshair';
    r.render();
  }, [props.wire, props.tool]);
  useEffect(() => {
    const r = runtime.current;
    if (!r) return;
    r.plane.visible = !!props.plane;
    if (props.plane) {
      const { center, size } = meshBounds(props.mesh),
        normal = new THREE.Vector3().setComponent(props.plane.axis, 1);
      r.plane.position.set(...center).setComponent(props.plane.axis, props.plane.coordinate);
      r.plane.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
      r.plane.scale.setScalar(Math.max(...size, 1) * 1.3);
    }
    r.render();
  }, [props.plane, props.mesh]);
  useEffect(() => runtime.current?.fit(), [props.resetCamera]);
  return (
    <div
      className="surface-canvas"
      ref={root}
      data-testid="surface-viewport"
      data-triangles={props.mesh.indices.length / 3}
      data-selected={props.selection?.length ?? 0}
      data-protected={props.mesh.mask?.filter((n) => n > 0).length ?? 0}
    />
  );
}
