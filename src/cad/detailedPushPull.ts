import { recoverCornerTreatment } from './recoverTreatment';
import { basicFaceExtrusion, Vector, type AnyShape, type Edge, type Face } from 'replicad';
import type { Body, Vec3 } from '../model/project';
import type { CadFace } from './protocol';
import type { TransformCache } from './buildCache';
import { add, sub, dot, scale } from '../model/geometry';
import { bodyFromShape, createShape, meshBody, pushPullFace, solidVolume } from './kernel';
import { detailSourceShape } from './detailSource';
import { detailEdges, removeEdgeTreatment } from './details';
import { shapeEdges, shapeFaces } from './topology';
import { isLinearEdge } from './planarity';
import { transferFaceMaterials } from './faceMaterials';

const tolerance = 1e-5;
function samples(edge: Edge): Vec3[] {
  return [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const point = edge.pointAt(t);
    try {
      return point.toTuple();
    } finally {
      point.delete();
    }
  });
}
const near = (a: Vec3, b: Vec3) => Math.hypot(...sub(a, b)) < tolerance;

/** Rebuild only a proven straight extrusion. Unlike a face union this doesn't
 * leave the old rim between two equivalent, differently represented cylinders. */
function resizedPrism(source: AnyShape, face: Face, normal: Vec3, depth: number, distance: number) {
  if (depth + distance < 0.1) return;
  const vector = new Vector(scale(normal, -depth));
  let proof: AnyShape | undefined, common: AnyShape | undefined;
  try {
    proof = basicFaceExtrusion(face, vector);
    const volume = solidVolume(source),
      epsilon = Math.max(1e-7, volume * 1e-9);
    if (Math.abs(solidVolume(proof) - volume) > epsilon) return;
    common = source.asShape3D().intersect(proof);
    if (Math.abs(solidVolume(common) - volume) > epsilon) return;
    const moved = face.clone().translate(scale(normal, distance));
    const length = new Vector(scale(normal, -(depth + distance)));
    try {
      return basicFaceExtrusion(moved, length);
    } finally {
      moved.delete();
      length.delete();
    }
  } finally {
    vector.delete();
    proof?.delete();
    common?.delete();
  }
}

/** Resize a treated end from its retained source, then rebuild the same rounds.
 * A fillet's reduced planar face alone would instead create a pocket or a boss.
 * Only an unambiguous outer source face qualifies; inset faces and bevel faces
 * retain ordinary face-extrusion behavior. Never guess edge indices after CSG. */
export function pushPullDetailedFace(
  body: Body,
  original: AnyShape,
  target: CadFace,
  distance: number,
  cache?: TransformCache,
): Body | undefined {
  const treatment = body.edgeTreatment ?? recoverCornerTreatment(body);
  if (!treatment) return;
  if (!body.edgeTreatment) body = { ...body, edgeTreatment: treatment };
  const source = detailSourceShape(body);
  let nextShape: AnyShape | undefined;
  let edges: Edge[] = [],
    nextEdges: Edge[] = [];
  try {
    const sourceBody = removeEdgeTreatment(body);
    const mesh = meshBody(sourceBody, source);
    const onPlane = (p: Vec3) => Math.abs(dot(sub(p, target.center), target.normal)) < tolerance;
    const matching = mesh.faces.filter(
      (face) => face.planar && dot(face.normal, target.normal) > 1 - 1e-8 && onPlane(face.center),
    );
    if (matching.length !== 1) return;
    // A recess is a deliberate local face edit, not an outer dimension change.
    for (let i = 0; i < mesh.vertices.length; i += 3)
      if (dot(sub(mesh.vertices.slice(i, i + 3) as Vec3, target.center), target.normal) > tolerance)
        return;
    let resized = pushPullFace(sourceBody, matching[0].ref, distance);
    nextShape = createShape(resized);
    edges = shapeEdges(source);
    nextEdges = shapeEdges(nextShape);
    if (edges.length !== nextEdges.length) {
      // Extending a cylindrical wall may retain the old cap's seam. Unify it,
      // but accept the result only if every original edge still maps below.
      // An intentional source division must never disappear in this cleanup.
      const simplified = nextShape.simplify();
      nextShape.delete();
      nextShape = simplified;
      nextEdges.forEach((edge) => edge.delete());
      nextEdges = shapeEdges(nextShape);
      resized = bodyFromShape(resized, nextShape);
    }
    if (edges.length !== nextEdges.length) {
      let depth = 0;
      for (let i = 0; i < mesh.vertices.length; i += 3)
        depth = Math.max(
          depth,
          -dot(sub(mesh.vertices.slice(i, i + 3) as Vec3, target.center), target.normal),
        );
      const faces = shapeFaces(source);
      let prism: AnyShape | undefined;
      try {
        prism = resizedPrism(source, faces[matching[0].index], target.normal, depth, distance);
      } finally {
        faces.forEach((face) => face.delete());
      }
      if (prism) {
        nextShape.delete();
        nextShape = prism;
        nextEdges.forEach((edge) => edge.delete());
        nextEdges = shapeEdges(nextShape);
        resized = bodyFromShape(resized, nextShape);
      }
    }
    const unsupported = () =>
      new Error(
        'Päätyä ei voi siirtää säilyttäen nämä reunakäsittelyt. Poista reunakäsittely tai pienennä siirtymää. Alkuperäinen osa säilyi.',
      );
    if (edges.length !== nextEdges.length) throw unsupported();
    const movedCurveEnds = edges
      .filter((edge) => !isLinearEdge(edge) && samples(edge).some(onPlane))
      .flatMap((edge) => {
        const p = samples(edge);
        return [p[0], p[4]];
      });
    const movingEndpoint = (p: Vec3) => onPlane(p) || movedCurveEnds.some((q) => near(p, q));
    const nextSamples = nextEdges.map(samples);
    const used = new Set<number>();
    const mapping = edges.map((edge) => {
      const points = samples(edge),
        linear = isLinearEdge(edge);
      let expected: Vec3[];
      if (points.every(onPlane) || (!linear && points.some(onPlane)))
        expected = points.map((p) => add(p, scale(target.normal, distance)));
      else if (linear) {
        const a = movingEndpoint(points[0])
          ? add(points[0], scale(target.normal, distance))
          : points[0];
        const b = movingEndpoint(points[4])
          ? add(points[4], scale(target.normal, distance))
          : points[4];
        expected = [0, 0.25, 0.5, 0.75, 1].map((t) => add(a, scale(sub(b, a), t)));
      } else expected = points;
      const index = nextSamples.findIndex(
        (other, i) =>
          !used.has(i) &&
          (expected.every((p, j) => near(p, other[j])) ||
            expected.every((p, j) => near(p, other[4 - j]))),
      );
      if (index < 0) throw unsupported();
      used.add(index);
      return index;
    });
    const indices = treatment.indices.map((index) => mapping[index]);
    if (indices.some((index) => index === undefined)) throw unsupported();
    const result = detailEdges(
      {
        ...resized,
        edgeTreatment: {
          ...treatment,
          source: resized.feature,
          offset: [0, 0, 0],
          rotation: [0, 0, 0, 1],
          indices,
          previous: resized.edgeTreatment
            ? [
                ...(resized.edgeTreatment.previous ?? []),
                (({ previous, ...layer }) => layer)(resized.edgeTreatment),
              ]
            : undefined,
        },
      },
      indices,
      treatment.operation,
      treatment.size,
      true,
      cache,
    ).body;
    if (!body.faceMaterials) return result;
    const finalShape = createShape(result),
      originalFaces = shapeFaces(original);
    try {
      // Restoring the unrounded source cannot carry paint from a curved face.
      // Retain unchanged/growing side finishes, then translate finishes on the
      // moving end's rounded band. Source cap paint already follows Push/Pull.
      let paint = {
        ...transferFaceMaterials(body.faceMaterials, original, finalShape),
        ...result.faceMaterials,
      };
      for (const [key, material] of Object.entries(body.faceMaterials)) {
        const face = originalFaces[Number(key)];
        if (!face) continue;
        const vertices = face.mesh({ tolerance: 0.15 }).vertices;
        let atEnd = vertices.length > 0;
        for (let i = 0; i < vertices.length && atEnd; i += 3) {
          const depth = dot(sub(vertices.slice(i, i + 3) as Vec3, target.center), target.normal);
          atEnd = depth >= -treatment.size - tolerance && depth <= tolerance;
        }
        if (!atEnd) continue;
        const moved = face.clone().translate(scale(target.normal, distance));
        try {
          paint = { ...paint, ...transferFaceMaterials({ 0: material }, moved, finalShape) };
        } finally {
          moved.delete();
        }
      }
      return { ...result, faceMaterials: Object.keys(paint).length ? paint : undefined };
    } finally {
      originalFaces.forEach((face) => face.delete());
      finalShape.delete();
    }
  } finally {
    nextEdges.forEach((edge) => edge.delete());
    edges.forEach((edge) => edge.delete());
    nextShape?.delete();
    source.delete();
  }
}
