import { makeCompound, type AnyShape } from 'replicad';
import type { Body, FaceRef } from '../model/project';
import { bodyFromShape, createShape, meshBody, solidFaceIds } from './kernel';
import { shapeEdges, shapeFaces } from './topology';
import type { TransformCache } from './buildCache';

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
