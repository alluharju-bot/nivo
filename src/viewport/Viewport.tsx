import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { bounds, featureIsSolid, type Vec3 } from '../model/project';
import { guidePoints } from '../model/guides';
import { formatLength } from '../model/units';
import { installInteractions } from './interactions';
import type { ViewportProps as Props, CameraCommand } from './types';
import { profilePoints, frameV } from '../model/sketch';
export type { Tool, CameraCommand } from './types';
interface SceneApi {
  sync: () => void;
  preview: () => void;
  command: (command: CameraCommand) => void;
  annotations: () => void;
  interactionSync: () => void;
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
  const labels: { element: HTMLDivElement; point: THREE.Vector3; xray: boolean }[] = [];
  let labelOccluded: ((point: THREE.Vector3) => boolean) | undefined;
  const clippingSphere = new THREE.Sphere(new THREE.Vector3(300, 200, 200), 1000);
  const render = () => {
    // Keep useful depth precision at CAD scales instead of a fixed 1:10,000,000 range.
    const distance = camera.position.distanceTo(clippingSphere.center),
      extent = Math.max(clippingSphere.radius * 1.8, 100);
    const near = Math.max(0.1, distance - extent),
      far = Math.max(near + 1000, distance + extent);
    if (camera.near !== near || camera.far !== far) {
      camera.near = near;
      camera.far = far;
      camera.updateProjectionMatrix();
    }
    renderer.render(scene, camera);
    for (const label of labels) {
      const p = label.point.clone().project(camera);
      label.element.hidden = Math.abs(p.z) > 1 || (!label.xray && !!labelOccluded?.(label.point));
      label.element.style.left = `${((p.x + 1) * container.clientWidth) / 2}px`;
      label.element.style.top = `${((1 - p.y) * container.clientHeight) / 2}px`;
    }
  };
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
    new THREE.ShadowMaterial({ opacity: 0.12, depthWrite: false }),
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
  const labelRay = new THREE.Raycaster();
  labelOccluded = (point) => {
    const projected = point.clone().project(camera);
    labelRay.setFromCamera(new THREE.Vector2(projected.x, projected.y), camera);
    const hit = labelRay
      .intersectObjects(bodies.children)
      .find((h) => h.object instanceof THREE.Mesh);
    return !!hit && hit.distance < labelRay.ray.origin.distanceTo(point) - 0.05;
  };
  const disposeGroup = (group: THREE.Group) => {
    group.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
        obj.geometry.dispose();
        (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach((m) => m.dispose());
      }
    });
    group.clear();
  };
  const sync = () => {
    disposeGroup(bodies);
    const props = current();
    const box = bounds(props.bodies),
      min = new THREE.Vector3(...box.min),
      max = new THREE.Vector3(...box.max);
    clippingSphere.center.copy(min).add(max).multiplyScalar(0.5);
    clippingSphere.radius = Math.max(100, min.distanceTo(max) / 2);
    for (const data of props.meshes) {
      const body = props.bodies.find((b) => b.id === data.id);
      if (!body) continue;
      const selected = props.selectedIds.includes(data.id);
      const target = props.tool === 'boolean' && props.booleanTargets.includes(data.id),
        cutter = props.tool === 'boolean' && props.booleanTools.includes(data.id),
        auxiliary = body.purpose === 'construction' || body.purpose === 'drawing';
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.vertices, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(data.normals, 3));
      geometry.setIndex(data.triangles);
      const materials = data.faces.map((face, index) => {
        geometry.addGroup(face.start, face.count, index);
        return new THREE.MeshStandardMaterial({
          color: target
            ? '#65a9ee'
            : cutter
              ? '#e6654e'
              : auxiliary
                ? body.purpose === 'construction'
                  ? '#1289c6'
                  : '#9865b4'
                : selected && face.ref === props.selectedFace
                  ? '#e1bd7b'
                  : body.color,
          roughness: 0.8,
          metalness: 0,
          side: THREE.DoubleSide,
          polygonOffset: true,
          polygonOffsetFactor: 1,
          polygonOffsetUnits: 1,
          transparent: auxiliary || cutter,
          opacity: cutter ? 0.22 : auxiliary ? 0.035 : 1,
          depthWrite: !auxiliary && !cutter,
          depthTest: !cutter,
        });
      });
      const mesh = new THREE.Mesh(geometry, materials);
      mesh.castShadow = !auxiliary;
      // Self-shadow acne on broad coplanar CAD faces caused view-dependent striping.
      // Parts still cast a ground shadow; their own surfaces use stable direct lighting.
      mesh.receiveShadow = false;
      mesh.userData = { id: body.id, faces: data.faces, purpose: body.purpose };
      bodies.add(mesh);
      const edges = new THREE.BufferGeometry();
      edges.setAttribute('position', new THREE.Float32BufferAttribute(data.edges, 3));
      bodies.add(
        new THREE.LineSegments(
          edges,
          new THREE.LineBasicMaterial({
            color: target
              ? '#0066bf'
              : cutter
                ? '#cc3d28'
                : auxiliary
                  ? body.purpose === 'construction'
                    ? '#1289c6'
                    : '#9865b4'
                  : selected
                    ? '#237b65'
                    : '#766851',
            transparent: true,
            opacity: selected || target || cutter || auxiliary ? 1 : 0.5,
            depthTest: !cutter,
          }),
        ),
      );
    }
    const editing = [
      'rectangle',
      'circle',
      'boolean',
      'move',
      'extrude',
      'measure',
      'pen',
    ].includes(props.tool);
    controls.mouseButtons.LEFT = editing || props.tool === 'select' ? null! : THREE.MOUSE.ROTATE;
    controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
    controls.mouseButtons.MIDDLE = THREE.MOUSE.PAN;
    controls.touches.ONE = props.tool === 'navigate' ? THREE.TOUCH.ROTATE : null!;
    controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
    render();
  };
  const preview = () => {
    disposeGroup(ghost);
    const target = current().faceTarget;
    if (current().tool === 'extrude' && target) {
      const data = current().meshes.find((m) => m.id === target.bodyId),
        face = data?.faces.find((f) => f.ref === target.face);
      if (data && face) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.vertices, 3));
        geometry.setIndex(data.triangles.slice(face.start, face.start + face.count));
        const mesh = new THREE.Mesh(
          geometry,
          new THREE.MeshBasicMaterial({
            color: '#128dec',
            transparent: true,
            opacity: 0.45,
            depthWrite: false,
            side: THREE.DoubleSide,
            polygonOffset: true,
            polygonOffsetFactor: -3,
            polygonOffsetUnits: -3,
          }),
        );
        mesh.position.set(...target.normal).multiplyScalar(current().faceDistance);
        ghost.add(mesh);
        const wire = new THREE.LineSegments(
          new THREE.EdgesGeometry(geometry),
          new THREE.LineBasicMaterial({ color: '#0069c8', depthTest: false }),
        );
        wire.position.copy(mesh.position);
        ghost.add(wire);
        const segments: number[] = [];
        for (const i of new Set(data.triangles.slice(face.start, face.start + face.count))) {
          const p = data.vertices.slice(i * 3, i * 3 + 3);
          segments.push(...p, ...p.map((n, j) => n + target.normal[j] * current().faceDistance));
        }
        ghost.add(
          new THREE.LineSegments(
            new THREE.BufferGeometry().setAttribute(
              'position',
              new THREE.Float32BufferAttribute(segments, 3),
            ),
            new THREE.LineBasicMaterial({ color: '#0069c8', depthTest: false }),
          ),
        );
      }
      render();
      return;
    }
    const body = current().preview;
    if (body) {
      const { width, depth, height } = body.feature;
      let geometry: THREE.BufferGeometry;
      const position = new THREE.Vector3(...body.origin);
      if (body.feature.type === 'profile-extrusion') {
        const { profile, frame, distance } = body.feature;
        const shape = new THREE.Shape(profilePoints(profile).map((p) => new THREE.Vector2(...p)));
        geometry = distance
          ? new THREE.ExtrudeGeometry(shape, {
              depth: Math.abs(distance),
              bevelEnabled: false,
              steps: 1,
            })
          : new THREE.ShapeGeometry(shape);
        if (distance < 0) geometry.translate(0, 0, distance);
        const matrix = new THREE.Matrix4().makeBasis(
          new THREE.Vector3(...frame.u),
          new THREE.Vector3(...frameV(frame)),
          new THREE.Vector3(...frame.normal),
        );
        matrix.setPosition(...frame.origin);
        geometry.applyMatrix4(matrix);
      } else if (body.feature.type === 'polygon-extrusion') {
        const shape = new THREE.Shape(body.feature.points.map((p) => new THREE.Vector2(...p)));
        geometry = height
          ? new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, steps: 1 })
          : new THREE.ShapeGeometry(shape);
      } else if (
        body.feature.type === 'union' ||
        body.feature.type === 'brep' ||
        body.feature.type === 'planar-polygon'
      ) {
        const data = current().meshes.find((m) => m.id === body.id),
          source = current().bodies.find((b) => b.id === body.id);
        if (!data || !source) return;
        geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.vertices, 3));
        geometry.setIndex(data.triangles);
        position.sub(new THREE.Vector3(...source.origin));
      } else {
        geometry = new THREE.BoxGeometry(width, depth, Math.max(height, 0.1));
        position.add(new THREE.Vector3(width / 2, depth / 2, height / 2));
      }
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({
          color: '#3b967a',
          transparent: true,
          opacity: 0.22,
          depthWrite: false,
          side: THREE.DoubleSide,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
        }),
      );
      mesh.position.copy(position);
      ghost.add(mesh);
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry),
        new THREE.LineBasicMaterial({ color: '#17755d', depthTest: false }),
      );
      edges.position.copy(position);
      ghost.add(edges);
    }
    render();
  };
  const guides = new THREE.Group();
  scene.add(guides);
  const annotations = () => {
    disposeGroup(guides);
    labels.forEach((l) => l.element.remove());
    labels.length = 0;
    const props = current(),
      all = props.guides.filter((g) => g.id !== props.guidePreview?.id);
    if (props.guidePreview) all.push(props.guidePreview);
    for (const guide of all) {
      const points = guidePoints(props.bodies, guide);
      if (!points) continue;
      const vectors = points.map((p) => new THREE.Vector3(...p));
      const isGuide = guide.mode === 'guide';
      const xray = props.guideXray || !!guide.xray;
      const color = props.selectedGuideId === guide.id ? '#0047ff' : '#008de0';
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(vectors),
        isGuide
          ? new THREE.LineDashedMaterial({
              color,
              dashSize: 14,
              gapSize: 8,
              depthTest: !xray,
              depthWrite: false,
            })
          : new THREE.LineBasicMaterial({ color: '#008bbd', depthTest: !xray, depthWrite: false }),
      );
      line.computeLineDistances();
      line.renderOrder = 80;
      line.userData = { guideId: guide.id, xray };
      guides.add(line);
      if (isGuide) {
        const direction = vectors[1].clone().sub(vectors[0]).normalize();
        const extension = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([
            vectors[0].clone().addScaledVector(direction, -20000),
            vectors[1].clone().addScaledVector(direction, 20000),
          ]),
          new THREE.LineDashedMaterial({
            color,
            dashSize: 14,
            gapSize: 8,
            transparent: true,
            opacity: 0.7,
            depthTest: !xray,
            depthWrite: false,
          }),
        );
        extension.computeLineDistances();
        extension.userData = { guideId: guide.id, xray };
        extension.renderOrder = 79;
        guides.add(extension);
      }
      const element = document.createElement('div');
      element.className = 'guide-label';
      element.dataset.xray = String(xray);
      element.dataset.testid = 'guide-label';
      element.textContent = `${formatLength(vectors[0].distanceTo(vectors[1]))} mm${isGuide ? ' · ' + formatLength(guide.angle) + '°' : ''}`;
      container.append(element);
      labels.push({ element, point: vectors[0].clone().add(vectors[1]).multiplyScalar(0.5), xray });
    }
    if (props.penPoints.length) {
      const points = [...props.penPoints];
      if (props.penHover) points.push(props.penHover);
      guides.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(points.map((p) => new THREE.Vector3(...p))),
          new THREE.LineBasicMaterial({ color: '#237b65', depthTest: false }),
        ),
      );
      props.penPoints.forEach((p, i) => {
        const marker = new THREE.Mesh(
          new THREE.SphereGeometry(i === 0 ? 6 : 4, 12, 8),
          new THREE.MeshBasicMaterial({ color: i === 0 ? '#ca883e' : '#237b65', depthTest: false }),
        );
        marker.position.set(...p);
        guides.add(marker);
      });
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
  const interactions = installInteractions({
    container,
    canvas: renderer.domElement,
    scene,
    bodies,
    guides,
    camera: () => camera,
    current,
    render,
  });
  resize();
  sync();
  return {
    sync,
    annotations,
    interactionSync: interactions.sync,
    preview,
    command,
    dispose() {
      observer.disconnect();
      controls.dispose();
      interactions.dispose();
      disposeGroup(guides);
      labels.forEach((l) => l.element.remove());
      disposeGroup(bodies);
      disposeGroup(ghost);
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
          obj.geometry.dispose();
          (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach((m) => m.dispose());
        }
      });
      key.shadow.dispose();
      renderer.dispose();
      renderer.domElement.remove();
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
    api.current?.interactionSync();
    if (props.meshes.length && !hadGeometry.current) api.current?.command({ id: 0, type: 'fit' });
    hadGeometry.current = props.meshes.length > 0;
  }, [
    props.bodies,
    props.meshes,
    props.selectedIds,
    props.selectedFace,
    props.tool,
    props.epoch,
    props.booleanTargets,
    props.booleanTools,
  ]);
  useEffect(
    () => api.current?.preview(),
    [props.preview, props.faceTarget, props.faceDistance, props.tool],
  );
  useEffect(
    () => api.current?.interactionSync(),
    [props.reference, props.axis, props.penPoints.length, props.freeRotate],
  );
  useEffect(
    () => api.current?.annotations(),
    [
      props.guides,
      props.guidePreview,
      props.penPoints,
      props.penHover,
      props.bodies,
      props.guideXray,
      props.selectedGuideId,
    ],
  );
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
