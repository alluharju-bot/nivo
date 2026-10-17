import {
  cast,
  getOC,
  makeCompound,
  makePolygon,
  makeSolid,
  type AnyShape,
  type Face,
} from 'replicad';
import {
  editableGeometry,
  geometryMeshBody,
  validateGeometry,
  geometryVolume,
  type EditableGeometry,
} from '../model/geometryEditing';
import { featureIsSolid, type Body, type Vec3 } from '../model/project';
import { add, sub } from '../model/geometry';
import { meshBody as importedMeshBody } from '../exchange/mesh';
import { createShape, bodyFromShape, meshBody, shapeIsValid, solidVolume } from './kernel';
import { isLinearEdge, isPlanarFace } from './planarity';
import { shapeEdges, shapeFaces } from './topology';
import { shapeVertexReferences } from './vertexReferences';
import { updatedQuantityBounds } from './quantityBounds';
import { retessellateGeometry } from '../model/geometryRetessellation';

export function prepareGeometry(body: Body): EditableGeometry {
  if (body.locked) throw new Error('Vapauta osan lukitus ennen geometrian muokkaamista.');
  if (body.feature.type === 'mesh') {
    const mesh = importedMeshBody(body);
    // Use the stored double precision coordinates, not the Float32 GPU mesh at
    // large project origins. A 0.1 mm detail must survive far from the origin.
    mesh.vertices = body.feature.vertices.map((n, i) => n + body.origin[i % 3]);
    return editableGeometry(body, mesh, false);
  }
  const shape = createShape(body),
    faces = shapeFaces(shape),
    edges = shapeEdges(shape);
  try {
    const exact = faces.every(isPlanarFace) && edges.every(isLinearEdge);
    const local = shape.clone().translate(body.origin.map((n) => -n) as Vec3);
    try {
      const mesh = meshBody({ ...body, origin: [0, 0, 0] }, local);
      const exactPoints = new Map<string, Vec3>();
      if (exact)
        for (const vertex of mesh.verticesCAD ?? []) {
          const key = vertex.point.map(Math.fround).join(',');
          const previous = exactPoints.get(key);
          if (previous && Math.hypot(...sub(previous, vertex.point)) > 1e-6)
            throw new Error(
              'Osan yksityiskohdat ovat liian lähellä toisiaan pistemuokkaukseen. Alkuperäinen säilyi.',
            );
          exactPoints.set(key, vertex.point);
        }
      const vertices: number[] = [];
      for (let i = 0; i < mesh.vertices.length; i += 3) {
        const point = mesh.vertices.slice(i, i + 3) as Vec3;
        const precise = exactPoints.get(point.map(Math.fround).join(',')) ?? point;
        vertices.push(...add(precise, body.origin));
      }
      return editableGeometry(body, { ...mesh, vertices }, exact);
    } finally {
      local.delete();
    }
  } finally {
    faces.forEach((f) => f.delete());
    edges.forEach((e) => e.delete());
    shape.delete();
  }
}

/** Only acceptance rebuilds CAD; pointer previews remain independent of the main kernel/cache. */
export function commitGeometry(body: Body, points: Vec3[], meshCopy = false): Body {
  if (body.locked) throw new Error('Vapauta osan lukitus ennen geometrian muokkaamista.');
  const original = prepareGeometry(body);
  const draft = retessellateGeometry(original, points);
  validateGeometry(draft, points);
  if (!draft.exact) {
    if (body.feature.type !== 'mesh' && !meshCopy)
      throw new Error(
        'Kaarevaa CAD-osaa voi muotoilla erillisenä verkkokopiona. Alkuperäinen CAD-osa säilyy.',
      );
    return geometryMeshBody(body, draft, points);
  }
  const shape = createShape(body),
    patchFaces: Face[] = [],
    temporary: AnyShape[] = [];
  let result: AnyShape | undefined;
  try {
    // Unify only within each old face. Intentional subdivisions and different
    // face materials survive; bent quads keep the required diagonal.
    const patches = new Map<number, number[]>();
    draft.patches.forEach((p, t) => patches.set(p, [...(patches.get(p) ?? []), t]));
    for (const triangles of patches.values()) {
      const pieces = triangles.map((t) =>
        makePolygon(draft.triangles.slice(t * 3, t * 3 + 3).map((i) => points[i])),
      );
      let compound: AnyShape | undefined, sewn: AnyShape | undefined;
      const sewing = new (getOC().BRepBuilderAPI_Sewing)(1e-6, true, true, true, false);
      try {
        compound = makeCompound(pieces);
        sewing.Add(compound.wrapped);
        sewing.Perform();
        sewn = cast(sewing.SewedShape());
        const unifier = new (getOC().ShapeUpgrade_UnifySameDomain)(sewn.wrapped, true, true, false);
        try {
          // Match the modelling tolerance: Float32 round trips must not turn
          // micrometre deviations into permanent, asymmetric diagonal faces.
          // Only triangles inside the SAME original patch are unified.
          unifier.SetLinearTolerance(1e-5);
          unifier.SetAngularTolerance(1e-7);
          unifier.Build();
          const patch = cast(unifier.Shape());
          temporary.push(patch);
          for (const face of shapeFaces(patch)) {
            if (shapeIsValid(face)) {
              patchFaces.push(face);
              continue;
            }
            // Unification may change a supporting plane by a few micrometres.
            // Update its edge/UV tolerances before sewing, also for open sheets.
            const fixer = new (getOC().ShapeFix_Face)(face.wrapped);
            try {
              fixer.SetPrecision(1e-5);
              fixer.SetMaxTolerance(1e-5);
              fixer.Perform();
              patchFaces.push(cast(fixer.Face()) as Face);
            } finally {
              fixer.delete();
              face.delete();
            }
          }
        } finally {
          unifier.delete();
        }
      } finally {
        sewing.delete();
        sewn?.delete();
        compound?.delete();
        pieces.forEach((p) => p.delete());
      }
    }
    if (featureIsSolid(body.feature)) result = makeSolid(patchFaces);
    else {
      const sewing = new (getOC().BRepBuilderAPI_Sewing)(1e-5, true, true, true, false);
      try {
        patchFaces.forEach((f) => sewing.Add(f.wrapped));
        sewing.Perform();
        result = cast(sewing.SewedShape());
      } finally {
        sewing.delete();
      }
    }
    if (!shapeIsValid(result))
      throw new Error('Pisteistä ei muodostu ehjää CAD-osaa. Pienennä muutosta.');
    if (draft.solid) {
      const expected = Math.abs(geometryVolume(draft, points));
      if (Math.abs(solidVolume(result) - expected) > Math.max(1e-4, expected * 1e-6))
        throw new Error(
          'CAD-osan kaikkia kuoria ei voitu säilyttää. Muokkaa erillisiä osia; alkuperäinen säilyi.',
        );
    }
    const next = bodyFromShape(body, result, []);
    if (featureIsSolid(body.feature) !== featureIsSolid(next.feature))
      throw new Error('Muutos avaisi umpinaisen kappaleen. Edellinen osa säilyi.');
    next.quantityBasis = updatedQuantityBounds(body, next, result);
    const refs = [
      ...shapeVertexReferences(body, shape),
      ...Object.entries(body.vertexRefs ?? {}).map(([key, local]) => ({
        key,
        point: add(body.origin, local),
      })),
    ];
    const byPoint = new Map(draft.points.map((p, i) => [p.map((n) => n.toFixed(6)).join(','), i]));
    next.vertexRefs = {};
    for (const ref of refs) {
      const index = byPoint.get(ref.point.map((n) => n.toFixed(6)).join(','));
      if (index !== undefined) next.vertexRefs[ref.key] = sub(points[index], next.origin);
    }
    if (body.faceMaterials) {
      const faces = shapeFaces(result),
        materials: NonNullable<Body['faceMaterials']> = {};
      const patchPoints = new Map(
        [...patches.keys()].map((p) => [
          p,
          new Set(
            patches
              .get(p)!
              .flatMap((t) => draft.triangles.slice(t * 3, t * 3 + 3))
              .map((i) => points[i].map((n) => n.toFixed(5)).join(',')),
          ),
        ]),
      );
      try {
        faces.forEach((face, index) => {
          const edges = shapeEdges(face),
            vertices = edges.flatMap((e) => [e.startPoint, e.endPoint]);
          try {
            const keys = vertices.map((v) =>
              v
                .toTuple()
                .map((n) => n.toFixed(5))
                .join(','),
            );
            for (const [patch, keysOfPatch] of patchPoints) {
              const paint = body.faceMaterials?.[draft.groups[patch].face];
              if (paint && keys.length >= 3 && keys.every((k) => keysOfPatch.has(k))) {
                materials[index] = paint;
                break;
              }
            }
          } finally {
            vertices.forEach((v) => v.delete());
            edges.forEach((e) => e.delete());
          }
        });
        next.faceMaterials = Object.keys(materials).length ? materials : undefined;
      } finally {
        faces.forEach((f) => f.delete());
      }
    }
    return next;
  } catch (error) {
    if (error instanceof Error && /Piste|Muutos|CAD-osan/.test(error.message)) throw error;
    throw new Error(
      'Pisteistä ei voitu rakentaa ehjää CAD-osaa. Pienennä muutosta tai muokkaa erillistä osaa. Alkuperäinen säilyi.',
    );
  } finally {
    result?.delete();
    patchFaces.forEach((f) => f.delete());
    temporary.forEach((s) => s.delete());
    shape.delete();
  }
}
