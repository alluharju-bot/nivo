import type { BodyMesh } from '../cad/protocol';
import type { Body, FaceRef } from '../model/project';

/** A selected face needs at most three draws, independent of the number of CAD faces. */
export function surfaceFaceRanges(
  data: BodyMesh,
  selected?: FaceRef,
  perFace = false,
  materials?: Body['faceMaterials'],
): { ref?: FaceRef; start: number; count: number; paintIndex?: number }[] {
  if (materials && Object.keys(materials).length) {
    const ranges: { ref?: FaceRef; start: number; count: number; paintIndex?: number }[] = [];
    for (const face of data.faces) {
      const paintIndex = materials[face.index] ? face.index : undefined;
      const ref = perFace || face.ref === selected ? face.ref : undefined;
      const last = ranges.at(-1);
      if (
        last &&
        !perFace &&
        !ref &&
        !last.ref &&
        last.paintIndex === paintIndex &&
        last.start + last.count === face.start
      )
        last.count += face.count;
      else ranges.push({ start: face.start, count: face.count, ref, paintIndex });
    }
    return ranges;
  }
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
