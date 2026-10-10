import {
  cast,
  getOC,
  makeFace,
  makeCompound,
  measureArea,
  type AnyShape,
  type Shape3D,
  Wire,
} from 'replicad';
import { featureIsSolid, uid, type Body, type FaceRef, type Vec3 } from '../model/project';
import { dot, sub } from '../model/geometry';
import {
  createShape,
  meshBody,
  bodyFromShape,
  shapeIsValid,
  exactBounds,
  solidVolume,
} from './kernel';
import type { SplitResult } from './protocol';
import { cutShapes } from './cut';

/** Positive offsets inset a face; negative offsets extend a surface's outer boundary. */
function withOffset<T>(
  body: Body,
  ref: FaceRef,
  distance: number,
  use: (offset: AnyShape, source: AnyShape) => T,
): T {
  if (body.locked) throw new Error('Kappale on kiinnitetty. Vapauta se G-näppäimellä.');
  if (!Number.isFinite(distance) || Math.abs(distance) < 0.1 || Math.abs(distance) > 100000)
    throw new Error('Anna offset väliltä −100 000…100 000 mm (vähintään 0,1 mm).');
  if (distance < 0 && featureIsSolid(body.feature))
    throw new Error('Offset ulospäin tarvitsee 2D-muodon ilman paksuutta.');
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
      // Extending the outer boundary must not fill or resize existing holes.
      if (distance < 0 && i > 0) {
        wires.push(wire.clone());
        continue;
      }
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
    const originalArea = measureArea(face);
    if (
      !shapeIsValid(inset) ||
      area < 1e-6 ||
      (distance > 0 ? area >= originalArea - 1e-6 : area <= originalArea + 1e-6)
    )
      throw new Error('Offset ei sovi tälle pinnalle. Kokeile pienempää mittaa.');
    return use(inset, shape);
  } catch (error) {
    if (error instanceof Error && /Offset|Sisennys/.test(error.message)) throw error;
    throw new Error('Offsetiä ei voi muodostaa. Kokeile pienempää mittaa tai toista tasopintaa.');
  } finally {
    inset?.delete();
    wires.forEach((wire) => wire.delete());
    sourceWires.forEach((wire) => wire.delete());
    faces.forEach((face) => face.delete());
    shape.delete();
  }
}

export function offsetFace(body: Body, ref: FaceRef, distance: number): SplitResult {
  return withOffset(body, ref, distance, (offset, source) => {
    if (distance > 0) return splitFace(body, ref, bodyFromShape(body, offset, []));
    // Keep the boolean's face partitions: the original surface and the new rim
    // must remain individually push/pullable. Do not simplify this union.
    const fuse = new (getOC().BRepAlgoAPI_Fuse)(source.wrapped, offset.wrapped);
    let shape: AnyShape | undefined;
    try {
      shape = cast(fuse.Shape());
      const next = bodyFromShape(body, shape);
      const restored = createShape(next),
        faces = restored.faces;
      try {
        const mesh = meshBody(next, restored);
        for (const candidate of mesh.faces) {
          const common = new (getOC().BRepAlgoAPI_Common)(
            faces[candidate.index].wrapped,
            source.wrapped,
          );
          let overlap: AnyShape | undefined;
          try {
            overlap = cast(common.Shape());
            if (measureArea(overlap as Shape3D) < 1e-6) return { body: next, face: candidate.ref };
          } finally {
            overlap?.delete();
            common.delete();
          }
        }
        throw new Error('Offset ei muodosta uutta ulkokehää. Kokeile toista mittaa.');
      } finally {
        faces.forEach((face) => face.delete());
        restored.delete();
      }
    } finally {
      shape?.delete();
      fuse.delete();
    }
  });
}
export function offsetOutline(body: Body, ref: FaceRef, distance: number): number[] {
  return withOffset(body, ref, distance, (offset) => offset.meshEdges({ tolerance: 0.15 }).lines);
}

/** Exact coplanar union, including arcs and holes. Shared/internal borders disappear. */
export function mergePlanarBodies(bodies: Body[]): Body {
  if (bodies.length < 2) throw new Error('Valitse vähintään kaksi tasomuotoa.');
  if (bodies.some((b) => b.locked))
    throw new Error('Vapauta kiinnitetyt muodot ennen yhdistämistä.');
  if (bodies.some((b) => featureIsSolid(b.feature)))
    throw new Error(
      'Yhdistä muodot tarvitsee 2D-muodot ilman paksuutta. Tilavuuskappaleille käytä Join-toimintoa.',
    );
  const shapes: AnyShape[] = [];
  let result: AnyShape | undefined;
  try {
    let plane: { normal: Vec3; center: Vec3 } | undefined;
    for (const body of bodies) {
      const shape = createShape(body);
      shapes.push(shape);
      const mesh = meshBody(body, shape);
      if (!mesh.faces.length)
        throw new Error('Sulje viiva ensin pinnaksi. Yhdistä muodot tarvitsee pinta-alueet.');
      for (const face of mesh.faces) {
        plane ??=
          body.feature.type === 'profile-extrusion'
            ? { center: face.center, normal: body.feature.frame.normal }
            : face;
        if (
          !face.planar ||
          Math.abs(Math.abs(dot(face.normal, plane.normal)) - 1) > 1e-6 ||
          Math.abs(dot(sub(face.center, plane.center), plane.normal)) > 1e-5
        )
          throw new Error('Yhdistä muodot: kaikkien muotojen pitää olla samalla tasolla.');
      }
      // Circles and rectangles may face opposite ways on the same plane.
      // Align them before fusing, otherwise OCCT keeps the shared seam.
      const faces = shape.faces;
      let aligned: AnyShape;
      try {
        aligned = makeCompound(
          mesh.faces.map((f) =>
            dot(f.normal, plane!.normal) < 0
              ? faces[f.index].flipOrientation()
              : faces[f.index].clone(),
          ),
        );
      } finally {
        faces.forEach((f) => f.delete());
      }
      shapes.push(aligned);
      if (!result) result = aligned.clone();
      else {
        const fuse = new (getOC().BRepAlgoAPI_Fuse)(result.wrapped, aligned.wrapped);
        try {
          fuse.SimplifyResult(true, true);
          const next = cast(fuse.Shape());
          result.delete();
          result = next;
        } finally {
          fuse.delete();
        }
      }
    }
    return bodyFromShape(
      {
        ...bodies[0],
        id: uid(),
        name: 'Yhdistetty muoto',
        component: undefined,
        penRegion: undefined,
      },
      result!,
      bodies,
    );
  } finally {
    result?.delete();
    shapes.forEach((s) => s.delete());
  }
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
        Math.abs(solidVolume(result) - mesh.volume) > Math.max(1e-5, mesh.volume * 1e-8))
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
  const all = [...targets, ...tools];
  if (operation === 'join' && all.length < 2)
    throw new Error('Valitse vähintään kaksi yhdistettävää osaa tai tasomuotoa.');
  if (operation === 'cut' && (!targets.length || !tools.length))
    throw new Error('Valitse vähintään yksi kohde ja yksi työstökappale.');
  if (new Set(all.map((b) => b.id)).size !== all.length)
    throw new Error('Kappale ei voi olla yhtä aikaa kohde ja työstökappale.');
  if (operation === 'join') {
    if (all.some((b) => b.locked)) throw new Error('Vapauta kiinnitetyt osat ennen yhdistämistä.');
    if (all.every((b) => !featureIsSolid(b.feature))) return [mergePlanarBodies(all)];
    if (all.some((b) => !featureIsSolid(b.feature)))
      throw new Error(
        'Yhdistä keskenään joko tasomuotoja tai tilavuuskappaleita. Anna tasomuodoille ensin paksuus, jos yhdistät ne tilavuuskappaleeseen.',
      );
  }
  if (all.some((b) => !featureIsSolid(b.feature)))
    throw new Error(
      'Cut tarvitsee tilavuuskappaleet. Anna luonnokselle ensin paksuus tai käytä Leikkaa aukko -toimintoa.',
    );
  const held: AnyShape[] = [];
  const keep = <T extends AnyShape>(s: T) => {
    held.push(s);
    return s;
  };
  try {
    if (operation === 'join') {
      let result = keep(createShape(all[0]).asShape3D());
      for (const body of all.slice(1))
        result = keep(result.fuse(keep(createShape(body).asShape3D())));
      return [bodyFromShape({ ...all[0], component: undefined }, result, all)];
    }
    const cutters = tools.map((b) => keep(createShape(b).asShape3D()));
    return targets.flatMap((body) => {
      const source = keep(createShape(body).asShape3D());
      const before = solidVolume(source);
      const result = keep(cutShapes(source, cutters));
      if (!shapeIsValid(result)) throw new Error('Leikkaus ei muodosta ehjää kappaletta.');
      const solids = result.solids,
        hasSolids = solids.length > 0;
      solids.forEach((s) => s.delete());
      const volume = hasSolids ? solidVolume(result) : 0;
      if (volume < 1e-7) return [];
      if (Math.abs(volume - before) < Math.max(1e-7, before * 1e-12)) return [body];
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
