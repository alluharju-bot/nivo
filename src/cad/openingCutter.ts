import { basicFaceExtrusion, Vector, type AnyShape } from 'replicad';
import { createShape, meshBody } from './kernel';
import { featureIsSolid, corners, type Body, type Vec3 } from '../model/project';
import { dot, sub, scale } from '../model/geometry';
import { sketchFrame, frameV } from '../model/sketch';

/** Extrude a closed planar profile through the bounds of the chosen target solids. */
export function openingCutter(
  profile: Body,
  targets: Body[],
  depth?: number,
  normalOverride?: Vec3,
): { shape: AnyShape; eligible: Set<string> } | undefined {
  if (featureIsSolid(profile.feature)) throw new Error('Valitse suljettu muoto ilman paksuutta.');
  const sketch = createShape(profile),
    faces = sketch.faces;
  try {
    const metadata = meshBody(profile, sketch).faces;
    if (faces.length !== 1 || !metadata[0]?.planar)
      throw new Error('Leikkaa aukko tarvitsee yhden suljetun tasomuodon.');
    const { center } = metadata[0];
    const normal = normalOverride ?? metadata[0].normal;
    const frame = sketchFrame(center, normal),
      axes = [frame.u, frameV(frame)];
    const projected = (body: Body) =>
      axes.map((axis) => {
        const values = corners(body).map((p) => dot(p, axis));
        return [Math.min(...values), Math.max(...values)];
      });
    const limits = projected(profile);
    const eligible = targets.filter(
      (b) =>
        b.id !== profile.id &&
        featureIsSolid(b.feature) &&
        projected(b).every((range, i) => range[0] <= limits[i][1] && range[1] >= limits[i][0]) &&
        (depth === undefined ||
          (() => {
            const values = corners(b).map((p) => dot(sub(p, center), normal));
            return Math.min(...values) <= 1e-5 && Math.max(...values) >= -depth;
          })()),
    );
    const eligibleIds = new Set(eligible.map((b) => b.id));
    if (!eligible.length && depth === undefined) return;
    let min = Infinity,
      max = -Infinity;
    for (const body of eligible)
      for (const point of corners(body)) {
        const depth = dot(sub(point, center), normal);
        min = Math.min(min, depth - 1);
        max = Math.max(max, depth + 1);
      }
    if (depth !== undefined) {
      min = -depth;
      max = 1e-5;
    }
    const face = faces[0].clone().translate(scale(normal, min)),
      vector = new Vector(scale(normal, max - min));
    try {
      return { shape: basicFaceExtrusion(face, vector), eligible: eligibleIds };
    } finally {
      face.delete();
      vector.delete();
    }
  } finally {
    faces.forEach((f) => f.delete());
    sketch.delete();
  }
}
