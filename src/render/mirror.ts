import * as THREE from 'three';
import type { Body } from '../model/project';
import { textureFrameMatrix } from './materials';

/** A plate's broad faces follow its local frame, including copied/rotated parts. */
export function mirrorFaceGroups(
  geometry: THREE.BufferGeometry,
  body: Body,
  start = 0,
  count = geometry.index?.count ?? 0,
) {
  const inverse = textureFrameMatrix(body).invert();
  const positions = geometry.getAttribute('position'),
    normals = geometry.getAttribute('normal');
  const point = new THREE.Vector3(),
    box = new THREE.Box3();
  for (let i = 0; i < positions.count; i++)
    box.expandByPoint(point.fromBufferAttribute(positions, i).applyMatrix4(inverse));
  const size = box.getSize(new THREE.Vector3()).toArray();
  const axis = size.indexOf(Math.min(...size));
  const side = body.appearance?.mirrorSide ?? 'front';
  const front = axis === 1 ? -1 : 1;
  const groups: { start: number; count: number; reflective: boolean }[] = [];
  for (let i = start; i < start + count; i += 3) {
    point.fromBufferAttribute(normals, geometry.index!.getX(i)).transformDirection(inverse);
    const normal = point.getComponent(axis) * front;
    const reflective =
      side === 'both' ? Math.abs(normal) > 0.99 : normal * (side === 'back' ? -1 : 1) > 0.99;
    const last = groups.at(-1);
    if (last && last.reflective === reflective) last.count += 3;
    else groups.push({ start: i, count: 3, reflective });
  }
  return groups;
}

export function mirrorBacking(material: THREE.MeshPhysicalMaterial) {
  material.color.set('#69706e');
  material.metalness = 0;
  material.roughness = 1;
  material.clearcoat = 0;
  material.transmission = 0;
  material.emissiveIntensity = 0;
  material.map = material.normalMap = material.roughnessMap = material.metalnessMap = null;
  material.userData.mirrorBacking = true;
}
