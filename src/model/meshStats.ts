import type { BodyMesh } from '../cad/protocol';
import type { Body } from './project';

export const isModelPart = (body: Body) =>
  body.purpose !== 'construction' && body.purpose !== 'drawing';

/** Display-mesh triangles, counted once per part instance; no overlays or shadow passes. */
export function meshStatistics(bodies: Body[], meshes: BodyMesh[], ids?: ReadonlySet<string>) {
  const byId = new Map(meshes.map((mesh) => [mesh.id, mesh]));
  let triangles = 0,
    parts = 0,
    pending = 0;
  for (const body of bodies) {
    if (!isModelPart(body) || (ids && !ids.has(body.id))) continue;
    parts++;
    const mesh = byId.get(body.id);
    if (mesh) triangles += mesh.triangles.length / 3;
    else if (body.feature.type === 'mesh') triangles += body.feature.triangles.length / 3;
    else pending++;
  }
  return { parts, triangles, pending };
}

export const triangleCount = (value: number) => value.toLocaleString('fi-FI');
