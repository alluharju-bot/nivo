import { getOC, type Face, type Edge } from 'replicad';
import type { Vec3 } from '../model/project';
import { sub, dot, unit } from '../model/geometry';
import { cross } from '../model/transforms';

/** Affine OCCT transforms represent even planes as rational B-splines. Test
 * their control net, not a few tessellated samples which could miss curvature. */
export function isPlanarFace(face: Face): boolean {
  if (face.geomType === 'PLANE') return true;
  if (face.geomType !== 'BSPLINE_SURFACE') return false;
  const adaptor = new (getOC().BRepAdaptor_Surface)(face.wrapped, true);
  const spline = adaptor.BSpline();
  try {
    const points: Vec3[] = [];
    for (let u = 1; u <= spline.NbUPoles(); u++)
      for (let v = 1; v <= spline.NbVPoles(); v++) {
        const p = spline.Pole(u, v);
        points.push([p.X(), p.Y(), p.Z()]);
        p.delete();
      }
    const a = points[0],
      b = points.find((p) => Math.hypot(...sub(p, a)) > 1e-7);
    if (!b) return false;
    const ab = unit(sub(b, a));
    const c = points.find((p) => Math.hypot(...cross(ab, sub(p, a))) > 1e-7);
    if (!c) return false;
    const n = unit(cross(ab, sub(c, a)));
    return points.every((p) => Math.abs(dot(sub(p, a), n)) < 1e-6);
  } finally {
    spline.delete();
    adaptor.delete();
  }
}

export function isLinearEdge(edge: Edge): boolean {
  if (edge.geomType === 'LINE') return true;
  if (edge.geomType !== 'BSPLINE_CURVE') return false;
  const a = edge.startPoint,
    b = edge.endPoint;
  const start = a.toTuple(),
    delta = sub(b.toTuple(), start);
  a.delete();
  b.delete();
  const length = Math.hypot(...delta);
  if (length < 1e-7) return false;
  const direction = unit(delta),
    adaptor = new (getOC().BRepAdaptor_Curve)(edge.wrapped),
    spline = adaptor.BSpline();
  try {
    for (let i = 1; i <= spline.NbPoles(); i++) {
      const p = spline.Pole(i),
        v = sub([p.X(), p.Y(), p.Z()], start);
      p.delete();
      if (
        Math.hypot(...cross(v, direction)) > 1e-6 ||
        dot(v, direction) < -1e-6 ||
        dot(v, direction) > length + 1e-6
      )
        return false;
    }
    return true;
  } finally {
    spline.delete();
    adaptor.delete();
  }
}
