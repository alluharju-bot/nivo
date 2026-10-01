import {
  cast,
  getOC,
  makeFace,
  measureArea,
  measureVolume,
  type AnyShape,
  type Shape3D,
  Wire,
} from 'replicad';
import { featureIsSolid, type Body, type FaceRef } from '../model/project';
import { createShape, meshBody, bodyFromShape, shapeIsValid, exactBounds } from './kernel';
import type { SplitResult } from './protocol';

/** A true planar inset: split the original face, preserving the solid and its volume. */
function withInset<T>(body: Body, ref: FaceRef, distance: number, use: (inset: AnyShape) => T): T {
  if (body.locked) throw new Error('Kappale on kiinnitetty. Vapauta se G-näppäimellä.');
  if (!Number.isFinite(distance) || distance < 0.1 || distance > 100000)
    throw new Error('Anna sisennys väliltä 0,1…100 000 mm.');
  const shape = createShape(body),
    faces = shape.faces;
  const wires: Wire[] = [],
    sourceWires: Wire[] = [];
  let inset: AnyShape | undefined;
  try {
    const target = meshBody(body, shape).faces.find((f) => f.ref === ref);
    if (!target?.planar) throw new Error('Offset tarvitsee tasomaisen pinnan.');
    const face = faces[target.index];
    sourceWires.push(face.clone().outerWire(), ...face.clone().innerWires());
    for (const [i, wire] of sourceWires.entries()) {
      const oc = getOC();
      const builder = new oc.BRepOffsetAPI_MakeOffset(
        wire.wrapped,
        oc.GeomAbs_JoinType.GeomAbs_Intersection,
        false,
      );
      try {
        builder.Perform(i === 0 ? -distance : distance, 0);
        const result = cast(builder.Shape());
        if (!(result instanceof Wire)) {
          result.delete();
          throw new Error('Sisennys hajoaa erillisiksi alueiksi. Kokeile pienempää mittaa.');
        }
        wires.push(result);
      } finally {
        builder.delete();
      }
    }
    inset = makeFace(wires[0], wires.slice(1));
    const area = measureArea(inset);
    if (!shapeIsValid(inset) || area < 1e-6 || area >= measureArea(face) - 1e-6)
      throw new Error('Sisennys on liian suuri tälle pinnalle.');
    // Split uses an exact intersection, so the original body remains one solid.
    return use(inset);
  } catch (error) {
    if (error instanceof Error && /Offset|Sisennys/.test(error.message)) throw error;
    throw new Error('Sisennystä ei voi muodostaa. Kokeile pienempää mittaa tai toista tasopintaa.');
  } finally {
    inset?.delete();
    wires.forEach((wire) => wire.delete());
    sourceWires.forEach((wire) => wire.delete());
    faces.forEach((face) => face.delete());
    shape.delete();
  }
}

export function offsetFace(body: Body, ref: FaceRef, distance: number): SplitResult {
  return withInset(body, ref, distance, (inset) =>
    splitFace(body, ref, bodyFromShape(body, inset, [])),
  );
}
export function offsetOutline(body: Body, ref: FaceRef, distance: number): number[] {
  return withInset(body, ref, distance, (inset) => inset.meshEdges({ tolerance: 0.15 }).lines);
}

/** Remove one shared boundary, preserving every other intentional face division. */
export function removeBoundary(body: Body, refs: [FaceRef, FaceRef]): Body {
  if (body.locked) throw new Error('Kappale on kiinnitetty. Vapauta se G-näppäimellä.');
  const shape = createShape(body),
    faces = shape.faces,
    edges = shape.edges;
  const unifier = new (getOC().ShapeUpgrade_UnifySameDomain)(shape.wrapped, false, true, false);
  let result: AnyShape | undefined;
  try {
    const mesh = meshBody(body, shape);
    if (
      refs[0] === refs[1] ||
      !mesh.boundaries.some((b) => refs.every((ref) => b.faces.includes(ref)))
    )
      throw new Error(
        'Valitse kahden samantasoisen pinnan välinen rajaus. Kulmia ja aukkojen reunoja ei voi kumittaa.',
      );
    const pair = refs.map((ref) => faces[mesh.faces.find((f) => f.ref === ref)!.index]);
    const first = pair[0].edges,
      second = pair[1].edges;
    try {
      for (const edge of edges)
        if (!(first.some((e) => e.isSame(edge)) && second.some((e) => e.isSame(edge))))
          unifier.KeepShape(edge.wrapped);
    } finally {
      first.forEach((e) => e.delete());
      second.forEach((e) => e.delete());
    }
    unifier.SetSafeInputMode(true);
    unifier.Build();
    result = cast(unifier.Shape());
    const afterFaces = result.faces;
    const count = afterFaces.length;
    afterFaces.forEach((f) => f.delete());
    if (!shapeIsValid(result) || count !== faces.length - 1)
      throw new Error('Rajausta ei voitu yhdistää ehjäksi pinnaksi. Kappale säilyi ennallaan.');
    const before = exactBounds(shape),
      after = exactBounds(result);
    const area = measureArea(shape as Shape3D);
    if (
      before.min.some((n, i) => Math.abs(n - after.min[i]) > 1e-5) ||
      before.max.some((n, i) => Math.abs(n - after.max[i]) > 1e-5) ||
      Math.abs(measureArea(result as Shape3D) - area) > Math.max(1e-5, area * 1e-8) ||
      (featureIsSolid(body.feature) &&
        Math.abs(measureVolume(result.asShape3D()) - mesh.volume) >
          Math.max(1e-5, mesh.volume * 1e-8))
    )
      throw new Error(
        'Rajauksen poisto muuttaisi kappaleen mittoja tai materiaalia. Muutos peruttiin.',
      );
    return bodyFromShape(body, result);
  } finally {
    result?.delete();
    unifier.delete();
    edges.forEach((e) => e.delete());
    faces.forEach((f) => f.delete());
    shape.delete();
  }
}

export function booleanBodies(targets: Body[], tools: Body[], operation: 'cut' | 'join'): Body[] {
  if (!targets.length || !tools.length)
    throw new Error('Valitse vähintään yksi kohde ja yksi työstökappale.');
  const all = [...targets, ...tools];
  if (new Set(all.map((b) => b.id)).size !== all.length)
    throw new Error('Kappale ei voi olla yhtä aikaa kohde ja työstökappale.');
  if (all.some((b) => !featureIsSolid(b.feature)))
    throw new Error('Cut ja Join tarvitsevat tilavuuskappaleet. Anna luonnokselle ensin paksuus.');
  const held: AnyShape[] = [];
  const keep = <T extends AnyShape>(s: T) => {
    held.push(s);
    return s;
  };
  try {
    const cutters = tools.map((b) => keep(createShape(b).asShape3D()));
    if (operation === 'join') {
      let result = keep(createShape(targets[0]).asShape3D());
      for (const part of [
        ...targets.slice(1).map((b) => keep(createShape(b).asShape3D())),
        ...cutters,
      ])
        result = keep(result.fuse(part));
      return [bodyFromShape(targets[0], result, all)];
    }
    return targets.flatMap((body) => {
      let result = keep(createShape(body).asShape3D());
      const before = measureVolume(result);
      for (const cutter of cutters) result = keep(result.cut(cutter));
      if (!shapeIsValid(result)) throw new Error('Leikkaus ei muodosta ehjää kappaletta.');
      const solids = result.solids,
        hasSolids = solids.length > 0;
      solids.forEach((s) => s.delete());
      if (!hasSolids || measureVolume(result) < 1e-7) return [];
      if (Math.abs(measureVolume(result) - before) < Math.max(1e-7, before * 1e-12)) return [body];
      return [bodyFromShape(body, result)];
    });
  } finally {
    held.reverse().forEach((s) => s.delete());
  }
}

export function splitFace(
  body: Body,
  ref: FaceRef,
  profile: Body,
  allowUnsplit = false,
): SplitResult {
  if (featureIsSolid(profile.feature))
    throw new Error('Pinnan rajaamiseen tarvitaan luonnos ilman paksuutta.');
  const shape = createShape(body),
    sketch = createShape(profile),
    faces = shape.faces;
  const oc = getOC();
  let clipped: AnyShape | undefined, result: AnyShape | undefined;
  const splitter = new oc.BRepAlgoAPI_Splitter();
  try {
    const target = meshBody(body, shape).faces.find((f) => f.ref === ref);
    if (!target?.planar) throw new Error('Valitse tasomainen pinta piirtotasoksi.');
    const common = new oc.BRepAlgoAPI_Common(faces[target.index].wrapped, sketch.wrapped);
    try {
      clipped = cast(common.Shape());
    } finally {
      common.delete();
    }
    const area = measureArea(clipped as Shape3D);
    // Automatic drawing keeps the whole profile as a new part whenever it
    // crosses the source boundary or spans a hole. Never silently crop a strip
    // spanning several objects down to the first object's face.
    if (allowUnsplit) {
      const profileArea = measureArea(sketch as Shape3D);
      if (profileArea - area > Math.max(1e-5, profileArea * 1e-8))
        return { body, face: ref, unchanged: true };
    }
    if (area < 1e-6) {
      if (allowUnsplit) return { body, face: ref, unchanged: true };
      throw new Error('Piirros ei osu valitulle pinnalle. Valitse piirtotavaksi Uusi osa.');
    }
    const argumentsList = splitter.Arguments(),
      toolList = splitter.Tools();
    try {
      argumentsList.Append(shape.wrapped);
      toolList.Append(clipped.wrapped);
      splitter.SetArguments(argumentsList);
      splitter.SetTools(toolList);
    } finally {
      argumentsList.delete();
      toolList.delete();
    }
    splitter.SetNonDestructive(true);
    splitter.Build();
    result = cast(splitter.Shape());
    const resultFaces = result.faces,
      count = resultFaces.length;
    resultFaces.forEach((f) => f.delete());
    if (count <= faces.length) {
      if (allowUnsplit) return { body, face: ref, unchanged: true };
      throw new Error('Rajaus ei jaa pintaa. Valitse Uusi osa tai piirrä raja pinnan sisälle.');
    }
    const next = bodyFromShape(body, result),
      restored = createShape(next),
      restoredFaces = restored.faces;
    try {
      const metadata = meshBody(next, restored).faces;
      const candidates = metadata.filter(
        (f) => f.planar && f.normal.every((n, i) => Math.abs(n - target.normal[i]) < 1e-5),
      );
      let selected: FaceRef | undefined;
      for (const candidate of candidates) {
        const face = restoredFaces[candidate.index],
          intersection = new oc.BRepAlgoAPI_Common(face.wrapped, clipped.wrapped);
        let overlap: AnyShape | undefined;
        try {
          overlap = cast(intersection.Shape());
          const own = measureArea(face);
          if (
            own > 1e-6 &&
            Math.abs(measureArea(overlap as Shape3D) - own) < Math.max(1e-5, own * 1e-8)
          ) {
            selected = candidate.ref;
            break;
          }
        } finally {
          overlap?.delete();
          intersection.delete();
        }
      }
      if (!selected) throw new Error('Piirrettyä aluetta ei voitu tunnistaa. Muutos peruttiin.');
      return { body: next, face: selected };
    } finally {
      restoredFaces.forEach((f) => f.delete());
      restored.delete();
    }
  } finally {
    result?.delete();
    clipped?.delete();
    splitter.delete();
    faces.forEach((f) => f.delete());
    sketch.delete();
    shape.delete();
  }
}
