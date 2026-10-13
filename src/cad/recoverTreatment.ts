import { basicFaceExtrusion, cast, getOC, makePolygon, Vector, type AnyShape } from 'replicad';
import { bodyFromShape, createShape, shapeIsValid, solidVolume } from './kernel';
import { shapeEdges, shapeFaces } from './topology';
import { cylindricalSurface } from './planarity';
import { add, sub, scale, dot, unit } from '../model/geometry';
import { cross } from '../model/transforms';
import type { Body, Vec3 } from '../model/project';
const cache = new WeakMap<Body, Body['edgeTreatment']>();
/** Recover only an exact rectangular extrusion with convex, equal-radius profile
 * corners. Re-fillet and intersect to prove equivalence; never replace an
 * arbitrary part by its bounding box or infer missing design history from a name. */
export function recoverCornerTreatment(body: Body): Body['edgeTreatment'] {
  if (body.feature.type !== 'brep' || !body.feature.solid) return;
  if (cache.has(body)) return cache.get(body);
  cache.set(body, undefined);
  const shape = createShape(body),
    faces = shapeFaces(shape);
  let prism: AnyShape | undefined, proof: AnyShape | undefined;
  try {
    if (faces.length < 7 || faces.length > 10) return;
    const cylinders = faces
      .filter((f) => f.geomType === 'CYLINDRE')
      .map((f) => {
        const center = f.center,
          normal = f.normalAt();
        try {
          return cylindricalSurface(f, center.toTuple(), normal.toTuple())!;
        } finally {
          center.delete();
          normal.delete();
        }
      });
    if (!cylinders.length || cylinders.some((c) => c.sign !== 1)) return;
    const axis = cylinders[0].axis,
      radius = cylinders[0].radius;
    if (
      cylinders.some(
        (c) => Math.abs(dot(c.axis, axis)) < 1 - 1e-8 || Math.abs(c.radius - radius) > 1e-5,
      )
    )
      return;
    if (faces.some((f) => f.geomType !== 'CYLINDRE' && f.geomType !== 'PLANE')) return;
    const normals = faces
      .filter((f) => f.geomType === 'PLANE')
      .map((f) => {
        const n = f.normalAt();
        try {
          return n.toTuple();
        } finally {
          n.delete();
        }
      });
    const u = normals.find((n) => Math.abs(dot(n, axis)) < 1e-8);
    if (!u) return;
    const v = unit(cross(axis, u));
    if (normals.some((n) => ![axis, u, v].some((a) => Math.abs(dot(n, a)) > 1 - 1e-8))) return;
    const edges = shapeEdges(shape),
      points: Vec3[] = [];
    try {
      for (const e of edges) {
        const a = e.startPoint,
          b = e.endPoint;
        points.push(a.toTuple(), b.toTuple());
        a.delete();
        b.delete();
      }
    } finally {
      edges.forEach((e) => e.delete());
    }
    const axes = [u, v, axis];
    const min = axes.map((a) => Math.min(...points.map((p) => dot(p, a))));
    const max = axes.map((a) => Math.max(...points.map((p) => dot(p, a))));
    if (max.some((n, i) => n - min[i] < 0.1)) return;
    const point = (a: number, b: number, c: number) =>
      add(add(scale(u, a), scale(v, b)), scale(axis, c));
    const corners = [
      [min[0], min[1]],
      [max[0], min[1]],
      [max[0], max[1]],
      [min[0], max[1]],
    ].map(([a, b]) => point(a, b, min[2]));
    const cap = makePolygon(corners),
      vector = new Vector(scale(axis, max[2] - min[2]));
    try {
      prism = basicFaceExtrusion(cap, vector);
    } finally {
      cap.delete();
      vector.delete();
    }
    const plain = bodyFromShape(body, prism, []),
      plainEdges = shapeEdges(prism);
    const indices: number[] = [];
    try {
      for (const c of cylinders) {
        const index = plainEdges.findIndex((e) => {
          const a = e.startPoint,
            b = e.endPoint;
          try {
            const p = a.toTuple(),
              d = sub(b.toTuple(), p),
              radial = sub(sub(p, c.origin), scale(axis, dot(sub(p, c.origin), axis)));
            return (
              Math.abs(dot(unit(d), axis)) > 1 - 1e-8 &&
              Math.abs(Math.hypot(...radial) - radius * Math.SQRT2) < 1e-5
            );
          } finally {
            a.delete();
            b.delete();
          }
        });
        if (index < 0 || indices.includes(index)) return;
        indices.push(index);
      }
      const oc = getOC(),
        builder = new oc.BRepFilletAPI_MakeFillet(
          prism.wrapped,
          oc.ChFi3d_FilletShape.ChFi3d_Rational,
        );
      try {
        indices.forEach((i) => builder.Add(radius, plainEdges[i].wrapped));
        const raw = builder.Shape();
        try {
          proof = cast(raw);
        } finally {
          raw.delete();
        }
      } finally {
        builder.delete();
      }
    } finally {
      plainEdges.forEach((e) => e.delete());
    }
    if (!proof || !shapeIsValid(proof)) return;
    const volume = solidVolume(shape),
      epsilon = Math.max(1e-6, volume * 1e-9);
    if (Math.abs(solidVolume(proof) - volume) > epsilon) return;
    const common = shape.asShape3D().intersect(proof);
    try {
      if (Math.abs(solidVolume(common) - volume) > epsilon) return;
    } finally {
      common.delete();
    }
    const result: NonNullable<Body['edgeTreatment']> = {
      id: `recovered-${body.id}`.slice(0, 100),
      source: plain.feature,
      offset: sub(plain.origin, body.origin),
      rotation: [0, 0, 0, 1],
      indices,
      operation: 'fillet',
      size: radius,
    };
    cache.set(body, result);
    return result;
  } catch {
    return;
  } finally {
    proof?.delete();
    prism?.delete();
    faces.forEach((f) => f.delete());
    shape.delete();
  }
}
