import {
  deserializeShape,
  cast,
  getOC,
  measureArea,
  basicFaceExtrusion,
  Vector,
  makeCompound,
  type AnyShape,
  type Face,
  type Shape3D,
} from 'replicad';
import type { Body, Vec3 } from '../model/project';
import { scale } from '../model/geometry';
import { shapeFaces } from './topology';

type Record = { face: string; profile: string };
const records = (body: Body) =>
  body.feature.type === 'brep' ? body.feature.cutProfiles : undefined;
const bounds = (shape: AnyShape) => {
  const box = shape.boundingBox;
  try {
    return box.bounds.flat();
  } finally {
    box.delete();
  }
};
/** Require the whole face. Subdividing/removing a sketch intentionally detaches
 * its old cutting intent; coincident bounding boxes alone are insufficient. */
function sameFace(a: AnyShape, b: AnyShape) {
  const box = bounds(b);
  if (bounds(a).some((n, i) => Math.abs(n - box[i]) > 1e-5)) return false;
  const area = measureArea(a as Shape3D),
    epsilon = Math.max(1e-6, area * 1e-7);
  if (Math.abs(area - measureArea(b as Shape3D)) > epsilon) return false;
  const op = new (getOC().BRepAlgoAPI_Common)(a.wrapped, b.wrapped);
  let common: AnyShape | undefined;
  try {
    common = cast(op.Shape());
    return Math.abs(measureArea(common as Shape3D) - area) < epsilon;
  } finally {
    common?.delete();
    op.delete();
  }
}
function localRecord(face: AnyShape, profile: AnyShape, origin: Vec3): Record {
  const f = face.clone().translate(scale(origin, -1)),
    p = profile.clone().translate(scale(origin, -1));
  try {
    return { face: f.serialize(), profile: p.serialize() };
  } finally {
    f.delete();
    p.delete();
  }
}
export function attachCutProfile(body: Body, face: Face, profile: AnyShape) {
  if (body.feature.type !== 'brep') return;
  const list = [...(records(body) ?? []), localRecord(face, profile, body.origin)];
  body.feature = { ...body.feature, cutProfiles: list.slice(-128) };
}
export function transferCutProfiles(sources: Body[], result: AnyShape, origin: Vec3) {
  if (!sources.some((b) => records(b)?.length)) return;
  const faces = shapeFaces(result),
    next: Record[] = [];
  try {
    for (const body of sources)
      for (const record of records(body) ?? []) {
        const old = deserializeShape(record.face).translate(body.origin);
        try {
          const match = faces.find((f) => sameFace(old, f));
          if (!match) continue;
          const profile = deserializeShape(record.profile).translate(body.origin);
          try {
            next.push(localRecord(match, profile, origin));
          } finally {
            profile.delete();
          }
        } finally {
          old.delete();
        }
      }
  } finally {
    faces.forEach((f) => f.delete());
  }
  return next.length ? next.slice(-128) : undefined;
}
/** Only inward Push/Pull uses the complete sketch. Outward extrusion remains
 * the selected material face, so drawing over a hole never silently fills it. */
export function sketchCutPrism(body: Body, face: Face, normal: Vec3, distance: number) {
  if (distance >= 0 || body.feature.type !== 'brep' || !body.feature.solid) return;
  for (const record of records(body) ?? []) {
    const old = deserializeShape(record.face).translate(body.origin);
    try {
      if (!sameFace(old, face)) continue;
      const profile = deserializeShape(record.profile).translate(body.origin),
        faces = shapeFaces(profile);
      const vector = new Vector(scale(normal, distance)),
        prisms: AnyShape[] = [];
      try {
        for (const f of faces) prisms.push(basicFaceExtrusion(f, vector));
        return prisms.length === 1 ? prisms[0].clone() : makeCompound(prisms);
      } finally {
        vector.delete();
        prisms.forEach((s) => s.delete());
        faces.forEach((f) => f.delete());
        profile.delete();
      }
    } finally {
      old.delete();
    }
  }
}
export function transformCutProfiles(
  source: Body,
  result: Body,
  transform: (s: AnyShape) => AnyShape,
) {
  if (result.feature.type !== 'brep' || !records(source)?.length) return;
  result.feature.cutProfiles = records(source)!.map((record) => {
    const face = transform(deserializeShape(record.face).translate(source.origin));
    const profile = transform(deserializeShape(record.profile).translate(source.origin));
    try {
      return localRecord(face, profile, result.origin);
    } finally {
      face.delete();
      profile.delete();
    }
  });
}
export async function transformCutProfilesAsync(
  source: Body,
  result: Body,
  transform: (s: AnyShape) => Promise<AnyShape>,
) {
  if (result.feature.type !== 'brep' || !records(source)?.length) return;
  const list: Record[] = [];
  for (const record of records(source)!) {
    const f = deserializeShape(record.face).translate(source.origin),
      p = deserializeShape(record.profile).translate(source.origin);
    let face: AnyShape | undefined, profile: AnyShape | undefined;
    try {
      face = await transform(f);
      profile = await transform(p);
      list.push(localRecord(face, profile, result.origin));
    } finally {
      face?.delete();
      profile?.delete();
      f.delete();
      p.delete();
    }
  }
  result.feature.cutProfiles = list;
}
