import * as THREE from 'three';
import type { BodyMesh } from '../cad/protocol';
import type { Body } from '../model/project';
import { faceMaterialBody } from '../model/faceMaterials';
import { surfaceFaceRanges } from '../viewport/faceRanges';
import { mirrorFaceGroups, mirrorBacking } from './mirror';
import { defaultAppearance, emissionSettings } from '../model/materials';

/** Shared material groups for raster, progressive tracing and image export. */
export function faceMaterialGroups(geometry: THREE.BufferGeometry, body: Body, data: BodyMesh) {
  return surfaceFaceRanges(data, undefined, false, body.faceMaterials).flatMap((range) => {
    const source = faceMaterialBody(body, range.paintIndex);
    return source.appearance?.preset === 'mirror'
      ? mirrorFaceGroups(geometry, source, range.start, range.count).map((group) => ({
          ...group,
          paintIndex: range.paintIndex,
          source,
        }))
      : [{ ...range, paintIndex: range.paintIndex, source, reflective: true }];
  });
}
export function renderFaceMaterials(
  geometry: THREE.BufferGeometry,
  body: Body,
  data: BodyMesh,
  create: (source: Body) => THREE.MeshPhysicalMaterial,
) {
  geometry.clearGroups();
  return faceMaterialGroups(geometry, body, data).map((range, index) => {
    geometry.addGroup(range.start, range.count, index);
    const material = create(range.source);
    if (!range.reflective) mirrorBacking(material);
    material.userData.facePaintIndex = range.paintIndex;
    material.userData.surfaceColor = range.source.color;
    return material;
  });
}

/** Painting a face can split the remaining base material into several draw
 * ranges. Those ranges are still one spotlight, not independent light sources
 * with origins at the bounds of each fragment. Surface emitters retain their
 * separate outlines so sampling never bridges a hole or a painted face. */
export function partEmitterGroups(geometry: THREE.BufferGeometry, body: Body, data: BodyMesh) {
  const groups: { source: Body; paintIndex?: number; indices: number[] }[] = [];
  const spots = new Map<number | undefined, (typeof groups)[number]>();
  for (const range of faceMaterialGroups(geometry, body, data)) {
    const emission = emissionSettings(
      range.source.appearance ?? defaultAppearance(range.source.material),
      range.source.color,
    );
    if (!range.reflective || !emission.enabled || emission.intensity <= 0) continue;
    let group = emission.type === 'spot' ? spots.get(range.paintIndex) : undefined;
    if (!group) {
      group = { source: range.source, paintIndex: range.paintIndex, indices: [] };
      groups.push(group);
      if (emission.type === 'spot') spots.set(range.paintIndex, group);
    }
    for (let i = range.start; i < range.start + range.count; i++)
      group.indices.push(data.triangles[i]);
  }
  return groups;
}
