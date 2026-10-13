import { cast, getOC, makeCompound, type AnyShape } from 'replicad';
import type { Body, FaceRef, Vec3 } from '../model/project';
import { dot } from '../model/geometry';
import { bodyFromShape, createShape, meshBody, solidFaceIds } from './kernel';
import { shapeEdges, shapeFaces } from './topology';
import type { TransformCache } from './buildCache';
import type { SplitResult } from './protocol';

/** A closed drawing can bridge empty space inside the edited part. Retain that
 * new surface in the same body, ready for Push/Pull, without duplicating an
 * existing face or adding a surface inside a solid. */
export function addSurfaceRegions(
  body: Body,
  regions: Body[],
  normal?: Vec3,
): SplitResult | undefined {
  if (body.locked) throw new Error('Vapauta kappaleen Hold ennen pinnan lisäämistä.');
  if (!regions.length) return;
  const shape = createShape(body);
  const aligned: AnyShape[] = [];
  let patches: AnyShape | undefined, remainder: AnyShape | undefined, result: AnyShape | undefined;
  try {
    for (const region of regions) {
      const patch = createShape(region),
        faces = shapeFaces(patch);
      try {
        for (const face of meshBody(region, patch).faces)
          aligned.push(
            normal && dot(face.normal, normal) < 0
              ? faces[face.index].flipOrientation()
              : faces[face.index].clone(),
          );
      } finally {
        faces.forEach((face) => face.delete());
        patch.delete();
      }
    }
    patches = makeCompound(aligned.splice(0));
    const cut = new (getOC().BRepAlgoAPI_Cut)(patches.wrapped, shape.wrapped);
    try {
      remainder = cast(cut.Shape());
    } finally {
      cut.delete();
    }
    const added = shapeFaces(remainder);
    try {
      if (!added.length) return;
      result = makeCompound([shape.clone(), ...added.map((face) => face.clone())]);
      const next = bodyFromShape(body, result),
        faces = shapeFaces(result);
      try {
        const index = faces.findIndex((face) => face.isSame(added[0]));
        const region = meshBody(next, result).faces.find((face) => face.index === index);
        if (!region) throw new Error('Lisättyä pintaa ei voitu tunnistaa.');
        return { body: next, face: region.ref };
      } finally {
        faces.forEach((face) => face.delete());
      }
    } finally {
      added.forEach((face) => face.delete());
    }
  } finally {
    result?.delete();
    remainder?.delete();
    patches?.delete();
    aligned.forEach((face) => face.delete());
    shape.delete();
  }
}

/** Delete surface regions without opening the boundary of a closed volume. */
export function removeSurfaceFaces(body: Body, refs: FaceRef[], cache?: TransformCache): Body[] {
  if (body.locked) throw new Error('Kappale on kiinnitetty. Vapauta se ennen pinnan poistamista.');
  if (!refs.length) throw new Error('Valitse poistettava pinta.');
  const shape = cache?.shape(body) ?? createShape(body),
    faces = shapeFaces(shape),
    solids = shape.solids;
  const pieces: AnyShape[] = [];
  let result: AnyShape | undefined;
  try {
    const metadata = (cache?.get(body)?.mesh ?? meshBody(body, shape)).faces;
    const targets = [...new Set(refs)].map((ref) => {
      const face = metadata.find((f) => f.ref === ref);
      if (!face || !faces[face.index]) throw new Error('Pinta on muuttunut. Valitse se uudelleen.');
      return faces[face.index];
    });
    const solidFaces = solidFaceIds(shape);
    if (targets.some((face) => solidFaces.has(face.hashCode)))
      throw new Error(
        'Valittu pinta rajaa umpinaista osaa. Tee aukko Push/Pullilla tai Cutilla. Poista pinta toimii paksuudettomille alueille.',
      );
    pieces.push(...solids.map((s) => s.clone()));
    pieces.push(
      ...faces
        .filter(
          (face) =>
            !solidFaces.has(face.hashCode) && !targets.some((target) => target.isSame(face)),
        )
        .map((face) => face.clone()),
    );
    // Independent drawing edges can coexist with surfaces. Removing a region
    // must not erase those edges, while its own boundary goes with the face.
    const attached = new Set<number>();
    for (const face of faces) {
      const edges = shapeEdges(face);
      try {
        edges.forEach((edge) => attached.add(edge.hashCode));
      } finally {
        edges.forEach((edge) => edge.delete());
      }
    }
    const edges = shapeEdges(shape);
    try {
      pieces.push(
        ...edges.filter((edge) => !attached.has(edge.hashCode)).map((edge) => edge.clone()),
      );
    } finally {
      edges.forEach((edge) => edge.delete());
    }
    if (!pieces.length) return [];
    // makeCompound takes ownership of the cloned pieces.
    result = makeCompound(pieces.splice(0));
    return [bodyFromShape(body, result)];
  } finally {
    result?.delete();
    pieces.forEach((piece) => piece.delete());
    solids.forEach((solid) => solid.delete());
    faces.forEach((face) => face.delete());
    shape.delete();
  }
}
