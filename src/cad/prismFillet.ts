import {
  cast,
  assembleWire,
  basicFaceExtrusion,
  makeFace,
  makeLine,
  makeThreePointArc,
  Vector,
  type AnyShape,
  type Edge,
  type Wire,
} from 'replicad';
import type { Vec3 } from '../model/project';
import { add, sub, scale, dot, unit } from '../model/geometry';
import { shapeIsValid, solidVolume } from './kernel';

const tolerance = 1e-6;
const distance = (a: Vec3, b: Vec3) => Math.hypot(...sub(a, b));
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
function endpoints(edge: Edge): [Vec3, Vec3] {
  const a = edge.startPoint,
    b = edge.endPoint;
  try {
    return [a.toTuple(), b.toTuple()];
  } finally {
    a.delete();
    b.delete();
  }
}

/** Order the real CAD boundary; explorer order is not guaranteed after serialization. */
function polygon(wire: Wire): Vec3[] | undefined {
  const edges = wire.edges;
  try {
    if (edges.length < 3 || edges.some((e) => e.geomType !== 'LINE')) return;
    const remaining = edges.map(endpoints),
      points = [...remaining.shift()!];
    while (remaining.length) {
      const last = points.at(-1)!;
      const i = remaining.findIndex(
        ([a, b]) => distance(last, a) < tolerance || distance(last, b) < tolerance,
      );
      if (i < 0) return;
      const [a, b] = remaining.splice(i, 1)[0];
      points.push(distance(last, a) < tolerance ? b : a);
    }
    if (distance(points[0], points.at(-1)!) > tolerance) return;
    return points.slice(0, -1);
  } finally {
    edges.forEach((e) => e.delete());
  }
}

/** Exact circular corners, including the limit where the intervening line has zero length. */
function roundedWire(points: Vec3[], selected: Vec3[], radius: number): Wire | undefined {
  const normal = unit(
    points.reduce<Vec3>(
      (sum, p, i) =>
        add(sum, cross(sub(p, points[0]), sub(points[(i + 1) % points.length], points[0]))),
      [0, 0, 0],
    ),
  );
  let matched = 0;
  const corners = points.map((p, i) => {
    if (!selected.some((s) => distance(s, p) < tolerance)) return { start: p, end: p, trim: 0 };
    matched++;
    const previous = points[(i + points.length - 1) % points.length],
      next = points[(i + 1) % points.length];
    const a = unit(sub(previous, p)),
      b = unit(sub(next, p));
    if (dot(cross(scale(a, -1), b), normal) <= tolerance) return;
    const angle = Math.acos(Math.max(-1, Math.min(1, dot(a, b))));
    const trim = radius / Math.tan(angle / 2),
      bisector = unit(add(a, b));
    const center = add(p, scale(bisector, radius / Math.sin(angle / 2)));
    return {
      start: add(p, scale(a, trim)),
      end: add(p, scale(b, trim)),
      mid: sub(center, scale(bisector, radius)),
      trim,
    };
  });
  if (matched !== selected.length || corners.some((c) => !c)) return;
  const edges: Edge[] = [];
  try {
    for (let i = 0; i < points.length; i++) {
      const corner = corners[i]!,
        next = corners[(i + 1) % points.length]!;
      if (
        corner.trim + next.trim >
        distance(points[i], points[(i + 1) % points.length]) + tolerance
      )
        return;
      if ('mid' in corner && corner.mid)
        edges.push(makeThreePointArc(corner.start, corner.mid, corner.end));
      if (distance(corner.end, next.start) > tolerance)
        edges.push(makeLine(corner.end, next.start));
    }
    return assembleWire(edges);
  } finally {
    edges.forEach((e) => e.delete());
  }
}

/**
 * OC's rolling-ball fillet can fail at an exact half-width. Rebuild a proven linear
 * extrusion from its actual cap, preserving inner wires. No epsilon radius, bbox
 * replacement, or approximation of unrelated geometry is allowed.
 */
export function filletPrism(shape: AnyShape, chosen: Edge[], radius: number): AnyShape | undefined {
  if (!chosen.length || chosen.some((e) => e.geomType !== 'LINE')) return;
  const ends = chosen.map(endpoints),
    direction = sub(ends[0][1], ends[0][0]);
  const height = Math.hypot(...direction),
    axis = unit(direction);
  if (height < tolerance) return;
  const min = Math.min(...ends[0].map((p) => dot(p, axis))),
    max = min + height;
  if (
    ends.some((pair) => {
      const values = pair.map((p) => dot(p, axis));
      return (
        Math.abs(Math.min(...values) - min) > tolerance ||
        Math.abs(Math.max(...values) - max) > tolerance ||
        Math.abs(Math.hypot(...sub(pair[1], pair[0])) - height) > tolerance
      );
    })
  )
    return;
  const lower = ends.map((pair) => pair.find((p) => Math.abs(dot(p, axis) - min) < tolerance)!);
  const faces = shape.faces;
  try {
    for (const face of faces) {
      if (face.geomType !== 'PLANE') continue;
      const n = face.normalAt(),
        center = face.center;
      const matches =
        Math.abs(dot(n.toTuple(), axis)) > 1 - tolerance &&
        Math.abs(dot(center.toTuple(), axis) - min) < tolerance;
      n.delete();
      center.delete();
      if (!matches) continue;
      const outer = face.clone().outerWire(),
        holes = face.clone().innerWires(),
        vector = new Vector(scale(axis, height));
      let rounded: Wire | undefined, result: AnyShape | undefined;
      try {
        const points = polygon(outer);
        if (!points) continue;
        rounded = roundedWire(points, lower, radius);
        if (!rounded) continue;
        // Prove the cap accounts for the entire original solid (including holes).
        const prism = basicFaceExtrusion(face, vector);
        try {
          const volume = solidVolume(shape),
            epsilon = Math.max(1e-7, volume * 1e-9);
          if (Math.abs(solidVolume(prism) - volume) > epsilon) continue;
          const common = shape.asShape3D().intersect(prism);
          try {
            if (Math.abs(solidVolume(common) - volume) > epsilon) continue;
          } finally {
            common.delete();
          }
        } finally {
          prism.delete();
        }
        const originalNormal = face.normalAt(),
          plain = makeFace(rounded),
          plainNormal = plain.normalAt();
        const reverse = dot(originalNormal.toTuple(), plainNormal.toTuple()) < 0;
        originalNormal.delete();
        plainNormal.delete();
        plain.delete();
        const orientedHoles = holes.map((w) =>
          reverse ? (cast(w.wrapped.Reversed()) as Wire) : w.clone(),
        );
        try {
          const cap = makeFace(rounded, orientedHoles);
          try {
            result = basicFaceExtrusion(cap, vector);
          } finally {
            cap.delete();
          }
        } finally {
          orientedHoles.forEach((w) => w.delete());
        }
        if (!shapeIsValid(result) || solidVolume(result) >= solidVolume(shape)) continue;
        const accepted = result;
        result = undefined;
        return accepted;
      } finally {
        result?.delete();
        rounded?.delete();
        vector.delete();
        outer.delete();
        holes.forEach((w) => w.delete());
      }
    }
  } finally {
    faces.forEach((f) => f.delete());
  }
}
