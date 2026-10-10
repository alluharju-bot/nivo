import * as THREE from 'three';
import { bounds, type Body, type Vec3 } from '../model/project';
import { scaleHandles, scalePoint, type Scaling } from '../model/scaling';

/** Shared model buffers: a drag only changes matrices and a handful of handles. */
export function scalingPreview(scene: THREE.Scene) {
  const group = new THREE.Group(),
    surfaces = new THREE.Group(),
    handles = new THREE.Group();
  group.add(surfaces, handles);
  scene.add(group);
  const handleGeometry = new THREE.BoxGeometry(1, 1, 1);
  const box = new THREE.Box3Helper(new THREE.Box3(), '#c08d43');
  (box.material as THREE.LineBasicMaterial).depthTest = false;
  box.renderOrder = 97;
  group.add(box);
  let key = '';
  const clear = (g: THREE.Group) => {
    for (const child of g.children)
      if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments)
        (Array.isArray(child.material) ? child.material : [child.material]).forEach((m) =>
          m.dispose(),
        );
    g.clear();
  };
  function update(
    s: Scaling | undefined,
    bodies: Body[],
    nodes: Map<string, { mesh: THREE.Mesh; outline: THREE.LineSegments }>,
  ) {
    group.visible = !!s;
    if (!s) {
      if (key) {
        clear(surfaces);
        clear(handles);
        key = '';
      }
      return;
    }
    const nextKey = s.ids.map((id) => `${id}:${nodes.get(id)?.mesh.geometry.uuid}`).join('|');
    if (nextKey !== key) {
      clear(surfaces);
      clear(handles);
      key = nextKey;
      for (const id of s.ids) {
        const node = nodes.get(id);
        if (!node) continue;
        const mesh = new THREE.Mesh(
          node.mesh.geometry,
          new THREE.MeshStandardMaterial({
            color: '#85b19f',
            roughness: 0.8,
            side: THREE.DoubleSide,
            forceSinglePass: true,
          }),
        );
        mesh.userData.orbitSurface = true;
        const edge = new THREE.LineSegments(
          node.outline.geometry,
          new THREE.LineBasicMaterial({ color: '#36755f' }),
        );
        surfaces.add(mesh, edge);
      }
    }
    surfaces.visible = s.factors.some((f) => Math.abs(f - 1) > 1e-10);
    surfaces.matrixAutoUpdate = false;
    surfaces.matrix
      .makeTranslation(...s.pivot)
      .multiply(new THREE.Matrix4().makeScale(...s.factors))
      .multiply(new THREE.Matrix4().makeTranslation(...(s.pivot.map((n) => -n) as Vec3)));
    surfaces.matrixWorldNeedsUpdate = true;
    const points = scaleHandles(s, bodies);
    if (handles.children.length !== points.length + 1) {
      clear(handles);
      for (let i = 0; i <= points.length; i++) {
        const marker = new THREE.Mesh(
          handleGeometry,
          new THREE.MeshBasicMaterial({
            color: i === points.length ? '#ffffff' : points[i].color,
            depthTest: false,
            depthWrite: false,
          }),
        );
        marker.renderOrder = 99;
        handles.add(marker);
      }
    }
    points.forEach((h, i) => {
      const marker = handles.children[i] as THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
      marker.position.set(...h.point);
      marker.material.color.set(h.color);
    });
    handles.children.at(-1)!.position.set(...s.pivot);
    handles.visible = !s.picking;
    const extent = bounds(bodies.filter((b) => s.ids.includes(b.id)));
    box.box.set(
      new THREE.Vector3(...scalePoint(extent.min, s.pivot, s.factors)),
      new THREE.Vector3(...scalePoint(extent.max, s.pivot, s.factors)),
    );
  }
  function resize(camera: THREE.Camera, height: number) {
    if (!group.visible) return;
    for (const marker of handles.children) {
      const distance = marker.position.clone().applyMatrix4(camera.matrixWorldInverse).z;
      const worldPerPixel =
        camera instanceof THREE.OrthographicCamera
          ? (camera.top - camera.bottom) / camera.zoom / height
          : (2 *
              Math.abs(distance) *
              Math.tan(THREE.MathUtils.degToRad((camera as THREE.PerspectiveCamera).fov / 2))) /
            height;
      marker.scale.setScalar(Math.max(0.00001, worldPerPixel * 9));
    }
  }
  return {
    update,
    resize,
    dispose: () => {
      clear(surfaces);
      clear(handles);
      handleGeometry.dispose();
      box.dispose();
      scene.remove(group);
    },
  };
}
