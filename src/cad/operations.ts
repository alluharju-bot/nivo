import { cast, getOC, measureArea, measureVolume, type AnyShape, type Shape3D } from 'replicad';
import { featureIsSolid, type Body, type FaceRef } from '../model/project';
import { createShape, meshBody, bodyFromShape, shapeIsValid } from './kernel';
import type { SplitResult } from './protocol';

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

export function splitFace(body: Body, ref: FaceRef, profile: Body): SplitResult {
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
    if (area < 1e-6) throw new Error('Piirros ei osu valitulle pinnalle.');
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
    if (count <= faces.length)
      throw new Error('Rajaus ei jaa pintaa. Piirrä pienempi muoto tai ylitä pinnan reuna.');
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
