import { basicFaceExtrusion, Vector, getOC, type AnyShape, type Face } from 'replicad';
import type { Vec3 } from '../model/project';
import { dot, sub, scale } from '../model/geometry';
import { shapeIsValid } from './kernel';
import { shapeEdges } from './topology';

// Fixed-order quadrature can differ noticeably for equivalent trimmed NURBS.
// Use adaptive integration for this equivalence proof, not viewport statistics.
function volume(shape: AnyShape) {
  const oc = getOC(),
    props = new oc.GProp_GProps();
  try {
    oc.BRepGProp.VolumePropertiesGK(shape.wrapped, props, 1e-9, true, true, false, false, false);
    return props.Mass();
  } finally {
    props.delete();
  }
}

/** Only reconstruct a uniform extrusion after proving that the entire source
 * equals the prism of this cap. A pocket, taper or side opening must not vanish.
 * OCCT intersections and spline volume integration have finite tolerances. */
export function resizeProvenPrism(
  source: AnyShape,
  face: Face,
  normal: Vec3,
  center: Vec3,
  distance: number,
) {
  const edges = shapeEdges(source);
  const edgeCount = edges.length;
  let depth = 0;
  try {
    for (const edge of edges) {
      for (const t of [0, 0.5, 1]) {
        const point = edge.pointAt(t);
        try {
          const d = dot(sub(point.toTuple(), center), normal);
          if (d > 1e-5) return;
          depth = Math.max(depth, -d);
        } finally {
          point.delete();
        }
      }
    }
  } finally {
    edges.forEach((e) => e.delete());
  }
  if (depth < 1e-5 || depth + distance < 0.1) return;
  const vector = new Vector(scale(normal, -depth));
  let proof: AnyShape | undefined, common: AnyShape | undefined;
  try {
    proof = basicFaceExtrusion(face, vector);
    const sourceVolume = volume(source),
      epsilon = Math.max(1e-6, sourceVolume * 1e-7);
    if (!shapeIsValid(proof) || Math.abs(volume(proof) - sourceVolume) > epsilon) return;
    common = source.asShape3D().intersect(proof);
    if (Math.abs(volume(common) - sourceVolume) > epsilon) return;
    const moved = face.clone().translate(scale(normal, distance));
    const length = new Vector(scale(normal, -(depth + distance)));
    try {
      const result = basicFaceExtrusion(moved, length);
      const rebuiltEdges = shapeEdges(result),
        sameTopology = rebuiltEdges.length === edgeCount;
      rebuiltEdges.forEach((e) => e.delete());
      // Preserve deliberate side divisions rather than simplifying them away.
      if (sameTopology && shapeIsValid(result)) return result;
      result.delete();
    } finally {
      moved.delete();
      length.delete();
    }
  } catch {
    // Recognition is optional; an OCCT proof failure must leave the ordinary
    // face operation available and must never replace the source speculatively.
    return;
  } finally {
    vector.delete();
    proof?.delete();
    common?.delete();
  }
}
