import type { Body } from '../model/project';
import type { BodyMesh } from '../cad/protocol';
import { emissionSettings, defaultAppearance } from '../model/materials';

export type RenderModel = {
  bodies: Body[];
  meshes: BodyMesh[];
  assets?: unknown;
  partNumbers?: unknown;
};
const topology = (body: Body) => {
  const emission = emissionSettings(
    body.appearance ?? defaultAppearance(body.material),
    body.color,
  );
  return JSON.stringify([
    body.id,
    body.origin,
    body.feature,
    body.textureFrame,
    body.appearance?.preset === 'mirror',
    body.appearance?.mirrorSide,
    emission.enabled ? emission : null,
  ]);
};
export const surfaceKey = (body: Body) =>
  JSON.stringify([body.material, body.color, body.appearance]);

/** Material edits retain the mesh buffers and tracing BVH. Emitting geometry and
 * mirror face groups affect scene structure and must follow the full path. */
export function canUpdateSurfaces(before: RenderModel | undefined, after: RenderModel) {
  if (
    !before ||
    before.bodies.length !== after.bodies.length ||
    before.meshes.length !== after.meshes.length ||
    before.partNumbers !== after.partNumbers
  )
    return false;
  const meshes = new Map(before.meshes.map((mesh) => [mesh.id, mesh]));
  if (
    after.meshes.some((mesh) => {
      const old = meshes.get(mesh.id);
      return (
        !old ||
        old.vertices !== mesh.vertices ||
        old.normals !== mesh.normals ||
        old.triangles !== mesh.triangles
      );
    })
  )
    return false;
  const bodies = new Map(before.bodies.map((body) => [body.id, body]));
  return after.bodies.every((body) => {
    const old = bodies.get(body.id);
    return old && topology(old) === topology(body);
  });
}
