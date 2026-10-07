import * as THREE from 'three';
import type { Body } from '../model/project';
import { defaultAppearance, emissionSettings } from '../model/materials';
import { textureFrameMatrix } from './materials';

export const previewLightLimit = 8;

function shadowedSpot(color: string, intensity: number, angle: number, penumbra: number) {
  const light = new THREE.SpotLight(color, intensity, 0, angle, penumbra, 2);
  light.castShadow = true;
  light.shadow.mapSize.set(512, 512);
  light.shadow.bias = -0.00001;
  light.shadow.normalBias = 0.1;
  light.shadow.camera.near = 0.05;
  light.shadow.camera.far = 100000;
  return light;
}

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
    const light = shadowedSpot(
      emission.color,
      emission.intensity * 1_000_000,
      THREE.MathUtils.degToRad(emission.angle / 2),
      0.35,
    );
    light.position.copy(frame.position);
    light.target.position.copy(frame.position).add(frame.direction);
    group.add(light, light.target);
  } else {
    const size = emitterFrame(body, geometry, 2, 1).size.toArray();
    const axis = size.indexOf(Math.min(...size));
    // RectAreaLight has no occlusion in the raster renderer, even in its glass
    // highlights. Sample both emitting faces with shadowed lights instead. The
    // tracer uses the real emissive geometry and its matching sampled faces.
    group.userData.previewOnly = true;
    for (const sign of [-1, 1]) {
      const frame = emitterFrame(body, geometry, axis, sign);
      const samples =
        Math.max(frame.width, frame.height) / Math.min(frame.width, frame.height) > 2 ? 2 : 1;
      const along = new THREE.Vector3(
        frame.width >= frame.height ? 1 : 0,
        frame.width >= frame.height ? 0 : 1,
        0,
      ).applyQuaternion(frame.rotation);
      for (let i = 0; i < samples; i++) {
        const light = shadowedSpot(
          emission.color,
          (emission.intensity * frame.width * frame.height) / samples,
          Math.PI * 0.49,
          1,
        );
        light.position
          .copy(frame.position)
          .addScaledVector(
            along,
            ((i + 0.5) / samples - 0.5) * Math.max(frame.width, frame.height),
          );
        light.target.position.copy(light.position).add(frame.direction);
        group.add(light, light.target);
      }
      group.userData.power = frame.width * frame.height * emission.intensity;
    }
  }
  return group;
}

/** Rectangular LED faces participate in next-event estimation. Tiny emissive
 * meshes alone are almost never found by diffuse rays in a sheltered recess. */
export function createTraceLights(body: Body, geometry: THREE.BufferGeometry) {
  const group = new THREE.Group();
  group.visible = false;
  group.userData.traceOnly = true;
  const emission = emissionSettings(
    body.appearance ?? defaultAppearance(body.material),
    body.color,
  );
  if (!emission.enabled || emission.intensity <= 0 || emission.type !== 'surface') return group;
  const positions = geometry.getAttribute('position');
  if (!positions?.count || (geometry.index !== null && geometry.index.count < 3)) return group;
  const inverse = textureFrameMatrix(body).invert();
  const box = new THREE.Box3(),
    point = new THREE.Vector3();
  let tolerance = 1e-4;
  for (let i = 0; i < positions.count; i++) {
    point.fromBufferAttribute(positions, i);
    // CAD positions become float32 in the renderer. Allow that precision loss
    // when recognizing a rotated rectangle far from the origin.
    tolerance = Math.max(
      tolerance,
      Math.max(Math.abs(point.x), Math.abs(point.y), Math.abs(point.z)) * 2 ** -22,
    );
    box.expandByPoint(point.applyMatrix4(inverse));
  }
  // Do not invent a rectangular emitter across a hole or a curved outline.
  const corners = new Set<string>();
  for (let i = 0; i < positions.count; i++) {
    point.fromBufferAttribute(positions, i).applyMatrix4(inverse);
    const key: number[] = [];
    for (let axis = 0; axis < 3; axis++) {
      const value = point.getComponent(axis);
      if (Math.abs(value - box.min.getComponent(axis)) < tolerance) key.push(0);
      else if (Math.abs(value - box.max.getComponent(axis)) < tolerance) key.push(1);
      else return group;
    }
    corners.add(key.join(''));
  }
  const size = box.getSize(new THREE.Vector3()).toArray();
  const axis = size.indexOf(Math.min(...size));
  if (corners.size !== (size[axis] < tolerance ? 4 : 8)) return group;
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
  }
  return group;
}

/** Remove approximations before tracing so emission is never counted twice. */
export function omitPreviewLights(scene: THREE.Scene) {
  const omitted: THREE.Object3D[] = [];
  scene.traverse((object) => {
    if (object.userData.previewOnly) omitted.push(object);
    if (object.userData.traceOnly) object.visible = true;
  });
  omitted.forEach((object) => object.removeFromParent());
}
