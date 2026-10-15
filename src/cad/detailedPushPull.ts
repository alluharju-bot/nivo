import { recoverCornerTreatment } from './recoverTreatment';
import { makeVertex, measureDistanceBetween, type AnyShape, type Edge } from 'replicad';
import type { Body, Vec3 } from '../model/project';
import type { CadFace } from './protocol';
import type { TransformCache } from './buildCache';
import { add, sub, dot, scale } from '../model/geometry';
import { bodyFromShape, createShape, meshBody, pushPullFace } from './kernel';
import { detailSourceShape } from './detailSource';
import { detailEdges, removeEdgeTreatment } from './details';
import { shapeEdges, shapeFaces } from './topology';
import { isLinearEdge } from './planarity';
import { transferFaceMaterials } from './faceMaterials';
import { resizeProvenPrism } from './prismResize';

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
const near = (a: Vec3, b: Vec3) => Math.hypot(...sub(a, b)) < 1e-3;

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
    const rebuildPrism = () => {
      const sourceFaces = shapeFaces(source);
      try {
        return resizeProvenPrism(
          source,
          sourceFaces[matching[0].index],
          target.normal,
          target.center,
          distance,
        );
      } finally {
        sourceFaces.forEach((face) => face.delete());
      }
    };
    let resized: Body;
    try {
      resized = pushPullFace(sourceBody, matching[0].ref, distance);
    } catch (error) {
      // Boolean intersections may leave mathematically cylindrical surfaces
      // represented as splines. A face fuse can fail even for a uniform prism.
      const prism = rebuildPrism();
      if (!prism) throw error;
      try {
        resized = bodyFromShape(sourceBody, prism);
      } finally {
        prism.delete();
      }
    }
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
      const prism = rebuildPrism();
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
    const nextSamples = nextEdges.map(samples);
    const used = new Set<number>();
    const delta = scale(target.normal, distance);
    const mapping = edges.map((edge) => {
      const points = samples(edge);
      // Earlier fillets introduce edges behind the cap plane. Their complete
      // curves move with the end, while longitudinal edges change one endpoint.
      // Accept only a unique geometric match under these permitted motions;
      // never rely on edge order after a boolean or a rebuilt treatment.
      const variants: Vec3[][] = [points, points.map((p) => add(p, delta))];
      if (isLinearEdge(edge))
        for (const end of [0, 4]) {
          const a = end === 0 ? add(points[0], delta) : points[0];
          const b = end === 4 ? add(points[4], delta) : points[4];
          variants.push([0, 0.25, 0.5, 0.75, 1].map((t) => add(a, scale(sub(b, a), t))));
        }
      let matches = nextSamples.flatMap((other, i) =>
        !used.has(i) &&
        variants.some(
          (expected) =>
            expected.every((p, j) => near(p, other[j])) ||
            expected.every((p, j) => near(p, other[4 - j])),
        )
          ? [i]
          : [],
      );
      if (!matches.length && !isLinearEdge(edge)) {
        // Rebuilt spline fillets can have different parameter spacing while
        // tracing the same curve. Compare geometric distance in both directions.
        const candidates = [edge.clone(), edge.clone().translate(delta)];
        try {
          matches = nextEdges.flatMap((other, i) => {
            if (used.has(i)) return [];
            const actual = nextSamples[i];
            const same = candidates.some((candidate, k) => {
              const expected = variants[k];
              if (!(
                (near(expected[0], actual[0]) && near(expected[4], actual[4])) ||
                (near(expected[0], actual[4]) && near(expected[4], actual[0]))
              ))
                return false;
              if (Math.abs(candidate.length - other.length) > 1e-3) return false;
              const follows = (points: Vec3[], curve: Edge) =>
                points.every((p) => {
                  const vertex = makeVertex(p);
                  try {
                    return measureDistanceBetween(vertex, curve) < 1e-3;
                  } finally {
                    vertex.delete();
                  }
                });
              return follows(expected, other) && follows(actual, candidate);
            });
            return same ? [i] : [];
          });
        } finally {
          candidates.forEach((e) => e.delete());
        }
      }
      if (matches.length !== 1) throw unsupported();
      used.add(matches[0]);
      return matches[0];
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
