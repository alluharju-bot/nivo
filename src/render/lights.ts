import * as THREE from 'three';
import type { Body } from '../model/project';
import { defaultAppearance, emissionSettings } from '../model/materials';
import { textureFrameMatrix } from './materials';

export const previewLightLimit = 8;

/** Compute emitter faces in the part's local frame, never its rotated world AABB. */
export function emitterFrame(
  body: Body,
  geometry: THREE.BufferGeometry,
  axis: number,
  sign: number,
) {
  const frame = textureFrameMatrix(body),
    inverse = frame.clone().invert();
  const positions = geometry.getAttribute('position'),
    point = new THREE.Vector3();
  const box = new THREE.Box3();
  for (let i = 0; i < positions.count; i++)
    box.expandByPoint(point.fromBufferAttribute(positions, i).applyMatrix4(inverse));
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  center.setComponent(axis, sign > 0 ? box.max.getComponent(axis) : box.min.getComponent(axis));
  const localDirection = new THREE.Vector3().setComponent(axis, sign);
  const direction = localDirection.clone().transformDirection(frame);
  const position = center.applyMatrix4(frame).addScaledVector(direction, 0.1);
  const uAxis = (axis + 1) % 3,
    vAxis = (axis + 2) % 3;
  const u = new THREE.Vector3().setComponent(uAxis, 1).transformDirection(frame);
  const back = direction.clone().negate(),
    v = back.clone().cross(u).normalize();
  const rotation = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(u, v, back),
  );
  return {
    position,
    direction,
    rotation,
    width: Math.max(size.getComponent(uAxis), 0.1),
    height: Math.max(size.getComponent(vAxis), 0.1),
    size,
  };
}

export function createPartLights(body: Body, geometry: THREE.BufferGeometry) {
  const emission = emissionSettings(
    body.appearance ?? defaultAppearance(body.material),
    body.color,
  );
  const group = new THREE.Group();
  group.userData.bodyId = body.id;
  if (
    !emission.enabled ||
    emission.intensity <= 0 ||
    (geometry.getAttribute('position')?.count ?? 0) < 3 ||
    (geometry.index !== null && geometry.index.count < 3)
  )
    return group;
  if (emission.type === 'spot') {
    const axis = { x: 0, y: 1, z: 2 }[emission.direction.slice(-1)]!;
    const frame = emitterFrame(body, geometry, axis, emission.direction.startsWith('-') ? -1 : 1);
    const light = new THREE.SpotLight(
      emission.color,
      emission.intensity * 1_000_000,
      0,
      THREE.MathUtils.degToRad(emission.angle / 2),
      0.35,
      2,
    );
    light.position.copy(frame.position);
    light.target.position.copy(frame.position).add(frame.direction);
    light.shadow.mapSize.set(512, 512);
    light.shadow.bias = -0.0001;
    light.shadow.camera.near = 0.1;
    light.shadow.camera.far = 100000;
    group.add(light, light.target);
  } else {
    const size = emitterFrame(body, geometry, 2, 1).size.toArray();
    const axis = size.indexOf(Math.min(...size));
    // The two broad faces approximate a strip/panel. The tracer uses actual emissive geometry.
    group.userData.previewOnly = true;
    for (const sign of [-1, 1]) {
      const frame = emitterFrame(body, geometry, axis, sign);
      const light = new THREE.RectAreaLight(
        emission.color,
        emission.intensity,
        frame.width,
        frame.height,
      );
      light.position.copy(frame.position);
      light.quaternion.copy(frame.rotation);
      group.add(light);
      group.userData.power = frame.width * frame.height * emission.intensity;
    }
  }
  return group;
}

/** Remove approximations before tracing so emission is never counted twice. */
export function omitPreviewLights(scene: THREE.Scene) {
  const omitted: THREE.Object3D[] = [];
  scene.traverse((object) => {
    if (object.userData.previewOnly) omitted.push(object);
  });
  omitted.forEach((object) => object.removeFromParent());
}
