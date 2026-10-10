import type { BodyMesh } from '../cad/protocol';
import type { FaceRef } from '../model/project';

/** A selected face needs at most three draws, independent of the number of CAD faces. */
export function surfaceFaceRanges(data: BodyMesh, selected?: FaceRef, perFace = false) {
  if (perFace) return data.faces;
  const face = selected && data.faces.find((face) => face.ref === selected);
  const count = data.triangles.length;
  if (!face) return [{ ref: undefined, start: 0, count }];
  return [
    { ref: undefined, start: 0, count: face.start },
    { ref: face.ref, start: face.start, count: face.count },
    { ref: undefined, start: face.start + face.count, count: count - face.start - face.count },
  ].filter((range) => range.count > 0);
}
