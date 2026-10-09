import { Quaternion, Vector3 } from 'three';
import type { Body } from './project';
import type { BodyMesh } from '../cad/protocol';

/** Original extrusion corners, including a retained treatment after moving/rotating it. */
export function profileCorners(body?: Body, mesh?: BodyMesh) {
  if (!body || !mesh) return;
  const feature = body.edgeTreatment?.source ?? body.feature;
  if (!['rectangle-extrusion', 'polygon-extrusion', 'profile-extrusion'].includes(feature.type))
    return;
  if (
    feature.type === 'profile-extrusion' &&
    !['rectangle', 'polygon'].includes(feature.profile.kind)
  )
    return;
  const normal = new Vector3(
    ...(feature.type === 'profile-extrusion' ? feature.frame.normal : ([0, 0, 1] as const)),
  );
  if (body.edgeTreatment) normal.applyQuaternion(new Quaternion(...body.edgeTreatment.rotation));
  const height = Math.abs(feature.type === 'profile-extrusion' ? feature.distance : feature.height);
  if (height < 1e-7) return;
  const indices = (mesh.sourceDetailEdges ?? mesh.detailEdges ?? [])
    .filter((edge) => {
      if (edge.lines.length !== 6) return false;
      const delta = new Vector3(...edge.lines.slice(3, 6)).sub(
        new Vector3(...edge.lines.slice(0, 3)),
      );
      return (
        Math.abs(delta.length() - height) < 1e-5 &&
        Math.abs(delta.normalize().dot(normal)) > 1 - 1e-6
      );
    })
    .map((e) => e.index);
  const rectangle =
    feature.type === 'rectangle-extrusion'
      ? feature
      : feature.type === 'profile-extrusion' && feature.profile.kind === 'rectangle'
        ? feature.profile
        : undefined;
  return indices.length
    ? { indices, halfWidth: rectangle ? Math.min(rectangle.width, rectangle.depth) / 2 : undefined }
    : undefined;
}
