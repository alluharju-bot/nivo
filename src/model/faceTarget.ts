import type { BodyMesh, FaceTarget } from '../cad/protocol';
import type { FaceRef } from './project';

/** An explicit face selection outranks pointer hover, including on another body. */
export function toolFaceTarget(
  meshes: BodyMesh[],
  selected: { bodyId: string; face: FaceRef } | undefined,
  hovered: FaceTarget | undefined,
  fallback: { bodyId: string; face?: FaceRef } | undefined,
): FaceTarget | undefined {
  const source = selected ?? hovered ?? fallback;
  if (!source) return;
  const mesh = meshes.find((m) => m.id === source.bodyId);
  const face = source.face
    ? mesh?.faces.find((f) => f.ref === source.face)
    : (mesh?.faces.find((f) => f.planar && f.normal[2] > 0.9) ?? mesh?.faces.find((f) => f.planar));
  // Never turn a stale selection into a different, arbitrary surface.
  if (!face) return;
  return {
    bodyId: source.bodyId,
    face: face.ref,
    normal: face.normal,
    point:
      hovered?.bodyId === source.bodyId && hovered.face === face.ref ? hovered.point : face.center,
  };
}
