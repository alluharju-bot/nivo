import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { bounds, featureIsSolid, type Vec3 } from '../model/project';
import { guidePoints } from '../model/guides';
import { formatLength } from '../model/units';
import { installInteractions } from './interactions';
import type { ViewportProps as Props, CameraCommand } from './types';
import { profilePoints, frameV } from '../model/sketch';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { rotationHandles } from '../model/rotationHandles';
import { dot, unit } from '../model/geometry';
import { createWorkspaceGrid } from './workspaceGrid';
import { createModelDimensions } from './modelDimensions';
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
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    logarithmicDepthBuffer: true,
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.domElement.setAttribute('aria-label', '3D-mallinnusalue');
  renderer.domElement.setAttribute('data-testid', 'viewport');
  renderer.domElement.tabIndex = 0;
  container.append(renderer.domElement);
  const modelDimensions = createModelDimensions(container);
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
  const extrusionLabels: typeof labels = [];
  let labelOccluded: ((point: THREE.Vector3) => boolean) | undefined;
  const clippingSphere = new THREE.Sphere(new THREE.Vector3(300, 200, 200), 1000);
  let workspaceGrid: ReturnType<typeof createWorkspaceGrid> | undefined;
  const render = () => {
    // Keep useful depth precision at CAD scales instead of a fixed 1:10,000,000 range.
    const distance = camera.position.distanceTo(clippingSphere.center),
      extent = Math.max(clippingSphere.radius * 1.8, 100);
    const near = Math.max(
        0.1,
        Math.min(distance - extent, camera.position.distanceTo(controls.target) * 0.001),
      ),
      far = Math.max(2_000_000, distance + extent);
    if (camera.near !== near || camera.far !== far) {
      camera.near = near;
      camera.far = far;
      camera.updateProjectionMatrix();
    }
    workspaceGrid?.update(
      camera,
      camera.position.distanceTo(controls.target),
      current().axisStyle,
      current().axisLabels,
    );
    renderer.render(scene, camera);
    modelDimensions.update(
      current().bodies,
      current().dimensions,
      current().selectedIds,
      current().dimensionDisplay,
      camera,
    );
    for (const label of [...labels, ...extrusionLabels]) {
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
  workspaceGrid = createWorkspaceGrid(scene, container);
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
    renderer.domElement.dataset.selectionKind = props.selectedFace
      ? 'face'
      : props.selectedIds.length
        ? 'object'
        : '';
    renderer.domElement.dataset.editingBody = props.editingBodyId ?? '';
    const box = bounds(props.bodies),
      min = new THREE.Vector3(...box.min),
      max = new THREE.Vector3(...box.max);
    clippingSphere.center.copy(min).add(max).multiplyScalar(0.5);
    clippingSphere.radius = Math.max(100, min.distanceTo(max) / 2);
    for (const data of props.meshes) {
      const body = props.bodies.find((b) => b.id === data.id);
      if (!body) continue;
      const selected = props.selectedIds.includes(data.id);
      const context = data.id === props.editingBodyId;
      const reference = !!props.editingBodyId && !context;
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
          color: reference
            ? new THREE.Color(body.color).lerp(new THREE.Color('#eaece6'), 0.45)
            : target
              ? '#65a9ee'
              : cutter
                ? '#e6654e'
                : auxiliary
                  ? body.purpose === 'construction'
                    ? '#1289c6'
                    : '#9865b4'
                  : body.locked
                    ? '#9b7bb8'
                    : selected && face.ref === props.selectedFace
                      ? '#e1bd7b'
                      : selected && !props.selectedFace
                        ? new THREE.Color(body.color).lerp(new THREE.Color('#56a58b'), 0.3)
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
      mesh.castShadow = !auxiliary && !reference;
      // Self-shadow acne on broad coplanar CAD faces caused view-dependent striping.
      // Parts still cast a ground shadow; their own surfaces use stable direct lighting.
      mesh.receiveShadow = false;
      mesh.userData = { id: body.id, faces: data.faces, purpose: body.purpose };
      bodies.add(mesh);
      const edges = new THREE.BufferGeometry();
      edges.setAttribute('position', new THREE.Float32BufferAttribute(data.edges, 3));
      const outline = new THREE.LineSegments(
        edges,
        new THREE.LineBasicMaterial({
          color: context
            ? '#267e65'
            : reference
              ? '#819087'
              : target
                ? '#0066bf'
                : cutter
                  ? '#cc3d28'
                  : auxiliary
                    ? body.purpose === 'construction'
                      ? '#1289c6'
                      : '#9865b4'
                    : body.locked
                      ? '#684294'
                      : selected
                        ? '#237b65'
                        : '#766851',
          transparent: true,
          opacity: reference
            ? 0.65
            : selected || context || target || cutter || auxiliary
              ? 1
              : 0.5,
          depthTest: !cutter,
        }),
      );
      outline.userData = { id: body.id };
      bodies.add(outline);
      if (context) {
        const editBounds = bounds([body]);
        const box = new THREE.Box3(
          new THREE.Vector3(...editBounds.min),
          new THREE.Vector3(...editBounds.max),
        );
        box.expandByScalar(2);
        const boundary = new THREE.Box3Helper(box, '#267e65');
        (boundary.material as THREE.LineBasicMaterial).transparent = true;
        (boundary.material as THREE.LineBasicMaterial).opacity = 0.45;
        bodies.add(boundary);
      }
    }
    const editing = [
      'erase',
      'rotate',
      'rectangle',
      'circle',
      'boolean',
      'move',
      'extrude',
      'offset',
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
    const rotation = current().rotation;
    const moving = current().tool === 'move' ? current().preview : undefined;
    const source = moving && current().bodies.find((b) => b.id === moving.id);
    const moved =
      moving && source && moving.origin.some((n, i) => Math.abs(n - source.origin[i]) > 1e-6);
    for (const object of bodies.children)
      object.visible = !(
        (moved && !current().copyMove && object.userData.id === moving.id) ||
        (rotation &&
          !rotation.picking &&
          Math.abs(rotation.angle % 360) > 1e-8 &&
          rotation.ids.includes(object.userData.id))
      );
    renderer.domElement.dataset.copyMove = String(current().copyMove);
    renderer.domElement.dataset.offsetPreview = current().offsetOutline
      ? String(current().offsetPreviewDistance)
      : '';
    if (current().tool === 'offset' && current().offsetOutline) {
      // meshEdges returns disconnected segment pairs, not a connected polyline.
      const outline = new LineSegments2(
        new LineSegmentsGeometry().setPositions(current().offsetOutline!),
        new LineMaterial({
          color: 0x168ab8,
          linewidth: 2.5,
          depthTest: false,
          depthWrite: false,
          toneMapped: false,
          resolution: new THREE.Vector2(container.clientWidth, container.clientHeight),
        }),
      );
      outline.renderOrder = 96;
      ghost.add(outline);
    }
    if (rotation) {
      const transform = new THREE.Matrix4()
        .makeTranslation(...rotation.pivot)
        .multiply(
          new THREE.Matrix4().makeRotationAxis(
            new THREE.Vector3(...unit(rotation.axis)),
            THREE.MathUtils.degToRad(rotation.angle),
          ),
        )
        .multiply(new THREE.Matrix4().makeTranslation(...(rotation.pivot.map((n) => -n) as Vec3)));
      if (!rotation.picking && Math.abs(rotation.angle % 360) > 1e-8) {
        for (const data of current().meshes.filter((m) => rotation.ids.includes(m.id))) {
          const body = current().bodies.find((b) => b.id === data.id)!;
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.vertices, 3));
          geometry.setAttribute('normal', new THREE.Float32BufferAttribute(data.normals, 3));
          geometry.setIndex(data.triangles);
          geometry.applyMatrix4(transform);
          ghost.add(
            new THREE.Mesh(
              geometry,
              new THREE.MeshStandardMaterial({
                color: body.color,
                roughness: 0.8,
                side: THREE.DoubleSide,
                polygonOffset: true,
                polygonOffsetFactor: 1,
                polygonOffsetUnits: 1,
              }),
            ),
          );
          const outline = new THREE.BufferGeometry();
          outline.setAttribute('position', new THREE.Float32BufferAttribute(data.edges, 3));
          outline.applyMatrix4(transform);
          ghost.add(
            new THREE.LineSegments(outline, new THREE.LineBasicMaterial({ color: '#26765b' })),
          );
        }
      }
      for (const handle of rotationHandles(rotation, current().bodies)) {
        const ring = new Line2(
          new LineGeometry().setPositions(handle.points.flat()),
          new LineMaterial({
            color: new THREE.Color(handle.color).getHex(),
            linewidth: Math.abs(dot(handle.axis, rotation.axis)) > 0.999 ? 3 : 1.8,
            depthTest: false,
            transparent: true,
            opacity: rotation.picking ? 0.25 : 0.8,
            toneMapped: false,
            resolution: new THREE.Vector2(container.clientWidth, container.clientHeight),
          }),
        );
        ring.renderOrder = 96;
        ghost.add(ring);
      }
      const pivot = new THREE.Mesh(
        new THREE.SphereGeometry(
          Math.max(2, rotationHandles(rotation, current().bodies)[0].radius / 55),
          12,
          8,
        ),
        new THREE.MeshBasicMaterial({ color: '#f4e8c4', depthTest: false }),
      );
      pivot.position.set(...rotation.pivot);
      pivot.renderOrder = 97;
      ghost.add(pivot);
    }
    extrusionLabels.forEach((label) => label.element.remove());
    extrusionLabels.length = 0;
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
        const span = current().faceSpan;
        if (span) {
          const distance = current().faceDistance;
          const start = new THREE.Vector3(...span.start),
            base = new THREE.Vector3(...span.end),
            end = start.clone().addScaledVector(new THREE.Vector3(...target.normal), distance);
          const final = span.solid ? Math.max(0, span.depth + distance) : Math.abs(distance);
          const cameraDirection = new THREE.Vector3();
          camera.getWorldDirection(cameraDirection);
          const side = new THREE.Vector3(...target.normal).cross(cameraDirection);
          if (side.lengthSq() < 1e-8) side.set(1, 0, 0).cross(new THREE.Vector3(...target.normal));
          const pixels =
            camera instanceof THREE.OrthographicCamera
              ? (2 * halfHeight) / camera.zoom / container.clientHeight
              : (2 * camera.position.distanceTo(start) * Math.tan(Math.PI / 9)) /
                container.clientHeight;
          side.normalize().multiplyScalar(pixels * 5);
          const dimension = (
            a: THREE.Vector3,
            b: THREE.Vector3,
            text: string,
            kind: string,
            color: string,
          ) => {
            const coordinates = [
              ...a.toArray(),
              ...b.toArray(),
              ...a.clone().sub(side).toArray(),
              ...a.clone().add(side).toArray(),
              ...b.clone().sub(side).toArray(),
              ...b.clone().add(side).toArray(),
            ];
            ghost.add(
              new THREE.LineSegments(
                new THREE.BufferGeometry().setAttribute(
                  'position',
                  new THREE.Float32BufferAttribute(coordinates, 3),
                ),
                new THREE.LineBasicMaterial({ color, depthTest: false, depthWrite: false }),
              ),
            );
            const element = document.createElement('div');
            element.className = `extrusion-label ${kind}`;
            element.dataset.testid = `extrusion-${kind}`;
            element.textContent = text;
            container.append(element);
            extrusionLabels.push({
              element,
              point: a.clone().add(b).multiplyScalar(0.5),
              xray: true,
            });
          };
          dimension(
            base,
            final > 0 ? end : base,
            `Toteutuva kokonaismitta ${formatLength(final)} mm`,
            'remaining',
            '#137d52',
          );
          if (Math.abs(distance) >= 0.001)
            dimension(
              start,
              end,
              `${distance > 0 ? '+' : ''}${formatLength(distance)} mm`,
              'delta',
              distance < 0 ? '#bd5a30' : '#1268b2',
            );
        }
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
    if (command.type === 'origin') {
      camera.position.sub(controls.target);
      controls.target.set(0, 0, 0);
      controls.update();
      render();
      return;
    }
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
      extrusionLabels.forEach((l) => l.element.remove());
      disposeGroup(bodies);
      disposeGroup(ghost);
      workspaceGrid?.dispose();
      modelDimensions.dispose();
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
    props.editingBodyId,
    props.tool,
    props.epoch,
    props.booleanTargets,
    props.booleanTools,
    props.axisStyle,
    props.axisLabels,
    props.dimensions,
    props.dimensionDisplay,
  ]);
  useEffect(
    () => api.current?.preview(),
    [
      props.preview,
      props.faceTarget,
      props.faceDistance,
      props.faceSpan,
      props.tool,
      props.rotation,
      props.meshes,
      props.copyMove,
      props.offsetOutline,
      props.offsetPreviewDistance,
    ],
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
