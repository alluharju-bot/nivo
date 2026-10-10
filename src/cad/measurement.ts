import { cast, getOC, makeLine, type AnyShape } from 'replicad';
import { createShape, meshBody, solidFaceIds } from './kernel';
import { type Body, type FaceRef, type Vec3 } from '../model/project';
import { add, sub, scale, dot } from '../model/geometry';
import type { FaceSpan } from './protocol';
import type { TransformCache } from './buildCache';
import { shapeFaces } from './topology';

/** Measure the first continuous material interval behind a point on a planar face. */
export function measureFaceSpan(
  body: Body,
  ref: FaceRef,
  point?: Vec3,
  cache?: TransformCache,
): FaceSpan {
  const shape = cache?.shape(body) ?? createShape(body);
  try {
    const mesh = cache?.get(body)?.mesh ?? meshBody(body, shape),
      face = mesh.faces.find((f) => f.ref === ref);
    if (!face?.planar) throw new Error('Toteutuva kokonaismitta tarvitsee tasopinnan.');
    const normal = face.normal;
    let start = point ?? face.center;
    start = sub(start, scale(normal, dot(sub(start, face.center), normal)));
    const faces = shapeFaces(shape);
    let solid: boolean;
    try {
      solid = solidFaceIds(shape).has(faces[face.index].hashCode);
    } finally {
      faces.forEach((face) => face.delete());
    }
    if (!solid) return { start, end: start, depth: 0, solid: false };
    const reach = Math.hypot(body.feature.width, body.feature.depth, body.feature.height) + 1;
    const measure = (p: Vec3): FaceSpan | undefined => {
      const line = makeLine(add(p, scale(normal, 0.01)), sub(p, scale(normal, reach)));
      const common = new (getOC().BRepAlgoAPI_Common)(shape.wrapped, line.wrapped);
      let intersection: AnyShape | undefined;
      try {
        intersection = cast(common.Shape());
        const edges = intersection.edges;
        try {
          const intervals = edges
            .map((edge) => {
              const a = edge.startPoint,
                b = edge.endPoint;
              try {
                return [dot(sub(p, a.toTuple()), normal), dot(sub(p, b.toTuple()), normal)].sort(
                  (a, b) => a - b,
                );
              } finally {
                a.delete();
                b.delete();
              }
            })
            .sort((a, b) => a[0] - b[0]);
          // Splits can divide a straight material interval into adjoining edges.
          let end = 0,
            found = false;
          for (const [lo, hi] of intervals) {
            if (hi <= 1e-6) continue;
            if (lo > end + 1e-5) break;
            end = Math.max(end, hi);
            found = true;
          }
          if (found) return { start: p, end: sub(p, scale(normal, end)), depth: end, solid: true };
        } finally {
          edges.forEach((e) => e.delete());
        }
      } finally {
        intersection?.delete();
        common.delete();
        line.delete();
      }
    };
    const measured = measure(start);
    if (measured) return measured;
    // A face's bounding-box centre may lie in a hole. Use an interior triangle
    // point only for automatic selection, never silently move a user's pick.
    if (!point) {
      for (let i = face.start; i < face.start + face.count; i += 3) {
        const p = [0, 1, 2].map(
          (axis) =>
            (mesh.vertices[mesh.triangles[i] * 3 + axis] +
              mesh.vertices[mesh.triangles[i + 1] * 3 + axis] +
              mesh.vertices[mesh.triangles[i + 2] * 3 + axis]) /
            3,
        ) as Vec3;
        const result = measure(sub(p, scale(normal, dot(sub(p, face.center), normal))));
        if (result) return result;
      }
    }
    throw new Error('Tästä kohdasta ei löytynyt vastapintaa. Valitse kohta materiaalin päältä.');
  } finally {
    shape.delete();
  }
}
