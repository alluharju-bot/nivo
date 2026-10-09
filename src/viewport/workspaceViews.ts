import * as THREE from 'three';
import type { ViewportProps } from './types';
import { frameV, fromUV } from '../model/sketch';
import { sectionAxis, positionSection, sectionPosition } from '../model/sections';
import type { Vec3 } from '../model/project';
import { intersectModel } from './spatialIndex';

export function createWorkspaceViews(
  scene: THREE.Scene,
  canvas: HTMLCanvasElement,
  current: () => ViewportProps,
  camera: () => THREE.Camera,
  bodies: THREE.Group,
  clippedGroups: THREE.Group[],
  render: () => void,
  shadowChanged: () => void,
) {
  const caps = new THREE.Group(),
    images = new THREE.Group(),
    handle = new THREE.Group();
  handle.name = 'section-handles';
  scene.add(caps, images, handle);
  const plane = new THREE.Plane(),
    ray = new THREE.Raycaster();
  let sectionKey = '',
    clippingActive = false,
    capData: ViewportProps['sectionResult'],
    imageKey = '',
    disposed = false;
  const imageTextures = new Map<string, THREE.Texture>();
  const clear = (group: THREE.Group) => {
    group.traverse((object) => {
      if (
        object instanceof THREE.Mesh ||
        object instanceof THREE.Line ||
        object instanceof THREE.Points
      ) {
        object.geometry.dispose();
        (Array.isArray(object.material) ? object.material : [object.material]).forEach((m) =>
          m.dispose(),
        );
      }
    });
    group.clear();
  };
  const setRay = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    ray.setFromCamera(
      new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        1 - ((event.clientY - rect.top) / rect.height) * 2,
      ),
      camera(),
    );
  };
  const sync = () => {
    const props = current(),
      section = props.section;
    const key = JSON.stringify(
      section && [section.id, section.frame, section.flipped, props.sectionControls],
    );
    if (key !== sectionKey) {
      sectionKey = key;
      clear(handle);
      clear(caps);
      capData = undefined;
      shadowChanged();
      if (section && props.sectionControls) {
        const size = Math.max(80, props.sectionExtent ?? 600);
        const normal = new THREE.Vector3(...section.frame.normal);
        const arrow = new THREE.ArrowHelper(
          normal,
          new THREE.Vector3(...section.frame.origin),
          size * 0.3,
          '#c07835',
          size * 0.08,
          size * 0.045,
        );
        arrow.line.material = new THREE.LineBasicMaterial({ color: '#9b5e28', depthTest: false });
        (arrow.cone.material as THREE.Material).depthTest = false;
        arrow.renderOrder = 100;
        handle.add(arrow);
        const points = [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
          [-1, -1],
        ].flatMap((p) => fromUV([(p[0] * size) / 2, (p[1] * size) / 2], section.frame));
        handle.add(
          new THREE.Line(
            new THREE.BufferGeometry().setAttribute(
              'position',
              new THREE.Float32BufferAttribute(points, 3),
            ),
            new THREE.LineDashedMaterial({
              color: '#a27045',
              dashSize: size / 35,
              gapSize: size / 60,
              transparent: true,
              opacity: 0.7,
            }),
          ),
        );
        (handle.children[1] as THREE.Line).computeLineDistances();
      }
    }
    if (section) {
      plane.setFromNormalAndCoplanarPoint(
        new THREE.Vector3(...section.frame.normal).multiplyScalar(section.flipped ? 1 : -1),
        new THREE.Vector3(...section.frame.origin),
      );
      bodies.userData.acceptPoint = (point: THREE.Vector3) => plane.distanceToPoint(point) >= -1e-5;
    } else delete bodies.userData.acceptPoint;
    if (section || clippingActive)
      for (const group of [...clippedGroups, scene.getObjectByName('interaction-overlays')].filter(
        Boolean,
      ) as THREE.Object3D[])
        group.traverse((object) => {
          if (!(
            object instanceof THREE.Mesh ||
            object instanceof THREE.Line ||
            object instanceof THREE.Points
          ))
            return;
          for (const material of Array.isArray(object.material)
            ? object.material
            : [object.material]) {
            if (!!material.clippingPlanes?.length !== !!section) material.needsUpdate = true;
            material.clippingPlanes = section ? [plane] : null;
            material.clipShadows = true;
          }
        });
    clippingActive = !!section;
    if (props.sectionResult !== capData) {
      clear(caps);
      capData = props.sectionResult;
      if (section && capData?.caps.length) {
        // Caps are display geometry, so one combined draw preserves all independent CAD parts.
        const vertices: number[] = [],
          normals: number[] = [],
          triangles: number[] = [],
          edges: number[] = [];
        for (const cap of capData.caps) {
          const offset = vertices.length / 3;
          for (const n of cap.vertices) vertices.push(n);
          for (const n of cap.normals) normals.push(n);
          for (const n of cap.triangles) triangles.push(n + offset);
          for (const n of cap.edges) edges.push(n);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geometry.setIndex(triangles);
        caps.add(
          new THREE.Mesh(
            geometry,
            new THREE.MeshBasicMaterial({
              color: '#d9bc8d',
              side: THREE.DoubleSide,
              polygonOffset: true,
              polygonOffsetFactor: -1,
              polygonOffsetUnits: -1,
            }),
          ),
          new THREE.LineSegments(
            new THREE.BufferGeometry().setAttribute(
              'position',
              new THREE.Float32BufferAttribute(edges, 3),
            ),
            new THREE.LineBasicMaterial({ color: '#634c31' }),
          ),
        );
      }
    }
    canvas.dataset.sectionCaps = String(section ? (capData?.caps.length ?? 0) : 0);
    canvas.dataset.section = section?.id ?? '';
    const nextImages = JSON.stringify([props.referenceImages, props.calibration]);
    if (nextImages !== imageKey) {
      imageKey = nextImages;
      clear(images);
      const used = new Set<string>();
      for (const image of props.referenceImages ?? []) {
        if (image.hidden) continue;
        const asset = props.assets?.[image.assetId];
        if (!asset) continue;
        used.add(image.assetId);
        let texture = imageTextures.get(image.assetId);
        if (!texture) {
          texture = new THREE.TextureLoader().load(asset.dataUrl, () => {
            if (!disposed) render();
          });
          texture.colorSpace = THREE.SRGBColorSpace;
          imageTextures.set(image.assetId, texture);
        }
        const mesh = new THREE.Mesh(
          new THREE.PlaneGeometry(image.width, image.height),
          new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            opacity: image.opacity,
            side: THREE.DoubleSide,
            depthWrite: false,
            toneMapped: false,
          }),
        );
        const v = frameV(image.frame);
        mesh.quaternion.setFromRotationMatrix(
          new THREE.Matrix4().makeBasis(
            new THREE.Vector3(...image.frame.u),
            new THREE.Vector3(...v),
            new THREE.Vector3(...image.frame.normal),
          ),
        );
        mesh.position.set(...fromUV([image.width / 2, image.height / 2], image.frame));
        mesh.position.addScaledVector(new THREE.Vector3(...image.frame.normal), -0.02);
        mesh.renderOrder = -2;
        mesh.userData.imageId = image.id;
        images.add(mesh);
        if (props.calibration?.id === image.id) {
          const points = props.calibration.points.map(
            (p) =>
              new THREE.Vector3(
                ...fromUV([p[0] * image.width, (1 - p[1]) * image.height], image.frame),
              ),
          );
          if (points.length) {
            const dots = new THREE.Points(
              new THREE.BufferGeometry().setFromPoints(points),
              new THREE.PointsMaterial({
                color: '#196cbd',
                size: 10,
                sizeAttenuation: false,
                depthTest: false,
              }),
            );
            dots.renderOrder = 100;
            images.add(dots);
            if (points.length === 2)
              images.add(
                new THREE.Line(
                  new THREE.BufferGeometry().setFromPoints(points),
                  new THREE.LineBasicMaterial({ color: '#196cbd', depthTest: false }),
                ),
              );
          }
        }
      }
      for (const [id, texture] of imageTextures)
        if (!used.has(id)) {
          texture.dispose();
          imageTextures.delete(id);
        }
    }
    images.updateMatrixWorld(true);
    handle.updateMatrixWorld(true);
    canvas.dataset.referenceImages = String(
      (props.referenceImages ?? []).filter((i) => !i.hidden).length,
    );
    canvas.dataset.calibrationPoints = String(props.calibration?.points.length ?? 0);
    render();
  };
  let drag:
    | {
        id: number;
        section: NonNullable<ViewportProps['section']>;
        latest: NonNullable<ViewportProps['section']>;
        plane: THREE.Plane;
        point: THREE.Vector3;
        position: number;
      }
    | undefined;
  const block = (e: PointerEvent) => {
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  const down = (event: PointerEvent) => {
    if (event.button !== 0 || current().busy) return;
    const props = current();
    setRay(event);
    if (props.calibration) {
      block(event);
      const hit = ray
        .intersectObjects(images.children)
        .find((h) => h.object.userData.imageId === props.calibration!.id);
      if (hit?.uv) props.onCalibrationPoint?.([hit.uv.x, 1 - hit.uv.y]);
      return;
    }
    if (props.sectionPick) {
      block(event);
      const hit = intersectModel(ray, bodies).find(
        (h) => h.object instanceof THREE.Mesh && h.faceIndex !== undefined,
      );
      if (hit) {
        const id = hit.object.userData.id,
          mesh = props.meshes.find((m) => m.id === id);
        const face = mesh?.faces.find(
          (f) => hit.faceIndex! * 3 >= f.start && hit.faceIndex! * 3 < f.start + f.count,
        );
        if (face?.planar)
          props.onSectionPick?.({
            bodyId: id,
            face: face.ref,
            normal: face.normal,
            point: hit.point.toArray() as Vec3,
          });
      }
      return;
    }
    if (!props.section || !props.sectionControls) return;
    ray.params.Line = { threshold: Math.max(8, (props.sectionExtent ?? 600) / 45) };
    if (!ray.intersectObjects(handle.children, true).length) return;
    const normal = new THREE.Vector3(...props.section.frame.normal),
      view = new THREE.Vector3();
    camera().getWorldDirection(view);
    const dragNormal = view.addScaledVector(normal, -view.dot(normal));
    if (dragNormal.lengthSq() < 1e-6) return;
    const dragPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(
      dragNormal.normalize(),
      new THREE.Vector3(...props.section.frame.origin),
    );
    const point = ray.ray.intersectPlane(dragPlane, new THREE.Vector3());
    if (!point) return;
    block(event);
    canvas.setPointerCapture(event.pointerId);
    drag = {
      id: event.pointerId,
      section: props.section,
      latest: props.section,
      plane: dragPlane,
      point,
      position: sectionPosition(props.section),
    };
  };
  const move = (event: PointerEvent) => {
    if (!drag) {
      if (current().calibration && !(event.buttons & 6)) block(event);
      return;
    }
    block(event);
    setRay(event);
    const point = ray.ray.intersectPlane(drag.plane, new THREE.Vector3());
    if (!point) return;
    let delta = point.sub(drag.point).dot(new THREE.Vector3(...drag.section.frame.normal));
    if (current().gridSnap) delta = Math.round(delta / current().gridStep) * current().gridStep;
    const next = positionSection(
      drag.section,
      drag.position +
        delta *
          (sectionAxis(drag.section) === undefined
            ? 1
            : drag.section.frame.normal[sectionAxis(drag.section)!]),
    );
    drag.latest = next;
    current().onSectionMove?.(next, false);
  };
  const up = (event: PointerEvent) => {
    if (!drag) {
      if ((current().calibration || current().sectionPick) && event.button === 0) block(event);
      return;
    }
    block(event);
    const latest = drag.latest;
    drag = undefined;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (event.type === 'pointercancel') current().onWorkspaceCancel?.();
    else current().onSectionMove?.(latest, true);
  };
  const cancel = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || (!drag && !current().calibration && !current().sectionPick))
      return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (drag && canvas.hasPointerCapture(drag.id)) canvas.releasePointerCapture(drag.id);
    drag = undefined;
    current().onWorkspaceCancel?.();
  };
  window.addEventListener('keydown', cancel, true);
  canvas.addEventListener('pointerdown', down, true);
  canvas.addEventListener('pointermove', move, true);
  canvas.addEventListener('pointerup', up, true);
  canvas.addEventListener('pointercancel', up, true);
  return {
    sync,
    dispose() {
      disposed = true;
      clear(caps);
      clear(images);
      clear(handle);
      imageTextures.forEach((t) => t.dispose());
      scene.remove(caps, images, handle);
      window.removeEventListener('keydown', cancel, true);
      canvas.removeEventListener('pointerdown', down, true);
      canvas.removeEventListener('pointermove', move, true);
      canvas.removeEventListener('pointerup', up, true);
      canvas.removeEventListener('pointercancel', up, true);
    },
  };
}
