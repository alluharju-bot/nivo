import { cast, DistanceTool, Face, getOC, makeFace, makePln, measureArea, Wire } from 'replicad';
import type { Vec3 } from '../model/project';
import { dot } from '../model/geometry';
import { shapeIsValid } from './kernel';

/** Supply the known plane explicitly: scaled planar faces may use B-spline supports. */
function offsetSupport(outer: Wire, point: Vec3, normal: Vec3): Face {
  const plane = makePln(point, normal);
  try {
    const builder = new (getOC().BRepBuilderAPI_MakeFace)(plane, outer.wrapped, true);
    try {
      return new Face(builder.Face());
    } finally {
      builder.delete();
    }
  } finally {
    plane.delete();
  }
}

/** Keep the generated curve's native plane/UV representation and orient holes against it. */
export function planarOffsetRegion(outer: Wire, holes: Wire[]): Face {
  const support = makeFace(outer);
  const normal = support.normalAt();
  try {
    const builder = new (getOC().BRepBuilderAPI_MakeFace)(support.wrapped);
    try {
      for (const hole of holes) {
        const filled = makeFace(hole);
        const holeNormal = filled.normalAt();
        const sameDirection = dot(normal.toTuple(), holeNormal.toTuple()) > 0;
        holeNormal.delete();
        const boundary = filled.outerWire();
        const reversed = sameDirection
          ? (boundary.flipOrientation() as unknown as Wire)
          : boundary.clone();
        try {
          builder.Add(reversed.wrapped);
        } finally {
          reversed.delete();
          boundary.delete();
          filled.delete();
        }
      }
      return new Face(builder.Face());
    } finally {
      builder.delete();
    }
  } finally {
    normal.delete();
    support.delete();
  }
}

/** Positive grows the enclosed loop; negative shrinks it, regardless of edge orientation. */
export function offsetPlanarLoop(wire: Wire, distance: number, point: Vec3, normal: Vec3): Wire {
  const support = offsetSupport(wire, point, normal);
  const measure = makeFace(wire);
  const sourceArea = measureArea(measure);
  measure.delete();
  const distanceTool = new DistanceTool();
  try {
    // Circular edges from boolean results can encode their parameter direction
    // opposite to a newly drawn circle. Validate the geometric side, not that sign.
    for (const signed of [distance, -distance]) {
      const oc = getOC();
      const builder = new oc.BRepOffsetAPI_MakeOffset(
        support.wrapped,
        oc.GeomAbs_JoinType.GeomAbs_Intersection,
        false,
      );
      try {
        builder.Perform(signed, 0);
        const result = cast(builder.Shape());
        try {
          if (!(result instanceof Wire)) continue;
          const region = makeFace(result);
          try {
            const area = measureArea(region);
            const correctSide = distance > 0 ? area > sourceArea + 1e-6 : area < sourceArea - 1e-6;
            if (!correctSide || area < 1e-6 || !shapeIsValid(region)) continue;
            // An oversized circular inset may fold into a smaller circle again.
            // Never accept it at a different distance from the original boundary.
            if (distanceTool.distanceBetween(wire, result) + 1e-5 < Math.abs(distance)) continue;
            return region.outerWire();
          } finally {
            region.delete();
          }
        } finally {
          result.delete();
        }
      } catch {
        // A failed direction must not suppress the orientation-independent attempt.
      } finally {
        builder.delete();
      }
    }
    throw new Error(
      'Sisennys ei mahdu pinnalle tai hajoaa erillisiksi alueiksi. Kokeile pienempää mittaa.',
    );
  } finally {
    distanceTool.delete();
    support.delete();
  }
}
