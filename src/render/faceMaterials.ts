import * as THREE from 'three';
import type { BodyMesh } from '../cad/protocol';
import type { Body } from '../model/project';
import { faceMaterialBody } from '../model/faceMaterials';
import { surfaceFaceRanges } from '../viewport/faceRanges';
import { mirrorFaceGroups, mirrorBacking } from './mirror';

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
