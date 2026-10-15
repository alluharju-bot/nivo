import { cast, getOC, measureArea, type AnyShape, type Face, type Shape3D } from 'replicad';
import { featureIsSolid, type Body } from '../model/project';
import { dot } from '../model/geometry';
import { shapeFaces } from './topology';

/** A primitive surface becomes two caps, never an arbitrarily painted side. */
export function primitiveFaceMaterials(
  body: Body,
  next: Body,
  source: AnyShape,
  result: AnyShape,
): Body['faceMaterials'] {
  if (!body.faceMaterials || featureIsSolid(body.feature) === featureIsSolid(next.feature))
    return body.faceMaterials;
  const normal =
    body.feature.type === 'profile-extrusion' ? body.feature.frame.normal : ([0, 0, 1] as const);
  const faces = shapeFaces(featureIsSolid(next.feature) ? result : source);
  try {
    const caps = faces.flatMap((face, index) => {
      if (face.geomType !== 'PLANE') return [];
      const n = face.normalAt();
      try {
        return Math.abs(dot(n.toTuple(), [...normal])) > 1 - 1e-8 ? [index] : [];
      } finally {
        n.delete();
      }
    });
    if (featureIsSolid(next.feature))
      return body.faceMaterials[0]
        ? Object.fromEntries(caps.map((i) => [i, body.faceMaterials![0]]))
        : undefined;
    const material = caps.map((i) => body.faceMaterials![i]).find(Boolean);
    return material ? { 0: material } : undefined;
  } finally {
    faces.forEach((face) => face.delete());
  }
}

/** Match actual surface overlap, never a stale face number after a topology edit. */
export function transferFaceMaterials(
  materials: Body['faceMaterials'],
  source: AnyShape,
  result: AnyShape,
): Body['faceMaterials'] {
  if (!materials || !Object.keys(materials).length) return undefined;
  const before = shapeFaces(source),
    after = shapeFaces(result);
  const bounds = (face: Face) => {
    const box = face.boundingBox;
    try {
      return box.bounds;
    } finally {
      box.delete();
    }
  };
  const mapped: NonNullable<Body['faceMaterials']> = {};
  try {
    const painted = Object.entries(materials).flatMap(([key, material]) => {
      const face = before[Number(key)];
      return face ? [{ face, material, box: bounds(face) }] : [];
    });
    for (const [index, face] of after.entries()) {
      const box = bounds(face);
      let bestArea = 1e-6;
      for (const old of painted) {
        if (old.box[0].some((n, i) => n > box[1][i] + 1e-5 || old.box[1][i] < box[0][i] - 1e-5))
          continue;
        if (face.isSame(old.face)) {
          mapped[index] = old.material;
          break;
        }
        const common = new (getOC().BRepAlgoAPI_Common)(old.face.wrapped, face.wrapped);
        let overlap: AnyShape | undefined;
        try {
          overlap = cast(common.Shape());
          const area = measureArea(overlap as Shape3D);
          if (area > bestArea) {
            mapped[index] = old.material;
            bestArea = area;
          }
        } finally {
          overlap?.delete();
          common.delete();
        }
      }
    }
    return Object.keys(mapped).length ? mapped : undefined;
  } finally {
    before.forEach((f) => f.delete());
    after.forEach((f) => f.delete());
  }
}
