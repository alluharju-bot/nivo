import {
  assembleWire,
  makeLine,
  cast,
  getOC,
  measureArea,
  type AnyShape,
  type Shape3D,
} from 'replicad';
import { bodyFromShape, createShape, meshBody, shapeIsValid, solidVolume } from './kernel';
import { makeBody, featureIsSolid, type Body, type Vec3, type FaceRef } from '../model/project';
import { add, dot, sub, scale, axisVector } from '../model/geometry';
import {
  openingOffsets,
  openingAngles,
  singleOpening,
  type OpeningPattern,
} from '../model/openingPattern';
import { rotateBodies } from './transforms';
import { rotateVector } from '../model/transforms';
import { openingCutter } from './openingCutter';
import type { BodyMesh, SplitResult } from './protocol';
import { splitFace } from './operations';
import { cutShapes, cutResultState } from './cut';

/** An open pen path is exact wire geometry, never an implicitly closed face. */
export function penPath(points: Vec3[], name: string): Body {
  if (
    points.length < 2 ||
    points.length > 1000 ||
    points.some((p) => p.some((n) => !Number.isFinite(n) || Math.abs(n) > 100000))
  )
    throw new Error('Viivaan tarvitaan vähintään kaksi sallittua pistettä.');
  const edges = [];
  try {
    for (let i = 1; i < points.length; i++) {
      if (Math.hypot(...sub(points[i], points[i - 1])) < 1e-6) continue;
      edges.push(makeLine(points[i - 1], points[i]));
    }
    if (!edges.length) throw new Error('Viivan pisteet ovat samassa kohdassa.');
    const wire = assembleWire(edges);
    try {
      return bodyFromShape({ ...makeBody(1, 1, 0), name, purpose: 'drawing' }, wire, []);
    } finally {
      wire.delete();
    }
  } finally {
    edges.forEach((e) => e.delete());
  }
}

/** Split a face with a clipped open wire; a dangling line remains a separate drawing. */
export function splitWithPath(body: Body, ref: FaceRef, path: Body): SplitResult {
  if (body.locked) throw new Error('Vapauta kappaleen Hold ennen pinnan jakamista.');
  const shape = createShape(body),
    wire = createShape(path),
    faces = shape.faces;
  const oc = getOC(),
    splitter = new oc.BRepAlgoAPI_Splitter();
  let clipped: AnyShape | undefined, result: AnyShape | undefined;
  try {
    const before = meshBody(body, shape),
      target = before.faces.find((f) => f.ref === ref);
    if (!target?.planar) throw new Error('Viivalla jakaminen tarvitsee tasopinnan.');
    const points = meshBody(path, wire).verticesCAD;
    if (points.some((p) => Math.abs(dot(sub(p.point, target.center), target.normal)) > 1e-5))
      throw new Error('Viivan tulee olla jaettavan pinnan tasossa.');
    const common = new oc.BRepAlgoAPI_Common(faces[target.index].wrapped, wire.wrapped);
    try {
      clipped = cast(common.Shape());
    } finally {
      common.delete();
    }
    const args = splitter.Arguments(),
      tools = splitter.Tools();
    try {
      args.Append(shape.wrapped);
      tools.Append(clipped.wrapped);
      splitter.SetArguments(args);
      splitter.SetTools(tools);
    } finally {
      args.delete();
      tools.delete();
    }
    splitter.SetNonDestructive(true);
    splitter.Build();
    result = cast(splitter.Shape());
    const resultFaces = result.faces,
      count = resultFaces.length;
    resultFaces.forEach((f) => f.delete());
    if (count <= faces.length) return { body, face: ref, unchanged: true };
    if (
      !shapeIsValid(result) ||
      (featureIsSolid(body.feature) &&
        Math.abs(solidVolume(result) - before.volume) > Math.max(1e-5, before.volume * 1e-8))
    )
      throw new Error('Pinnan jakaminen ei säilyttänyt ehjää kappaletta. Muutos peruttiin.');
    const next = bodyFromShape(body, result),
      nextMesh = meshBody(next, result);
    const region = nextMesh.faces.find(
      (f) =>
        f.planar &&
        dot(f.normal, target.normal) > 0.99999 &&
        Math.abs(dot(sub(f.center, target.center), target.normal)) < 1e-5,
    );
    if (!region) throw new Error('Jaettua pintaa ei voitu tunnistaa.');
    return { body: next, face: region.ref };
  } finally {
    result?.delete();
    clipped?.delete();
    splitter.delete();
    faces.forEach((f) => f.delete());
    wire.delete();
    shape.delete();
  }
}

export interface OpeningResult {
  lastProfile: Body;
  bodies: Body[];
  affected: string[];
  normal: Vec3;
  meshes: BodyMesh[];
  cutters: BodyMesh[];
}

/** Explicitly apply a separate sketch to coplanar supporting faces. No automatic joining. */
export function divideSurfaces(profile: Body, targets: Body[]): SplitResult[] {
  if (featureIsSolid(profile.feature))
    throw new Error('Pinnan jakamiseen tarvitaan viiva tai tasomuoto.');
  const sketch = createShape(profile);
  const results: SplitResult[] = [];
  try {
    const drawing = meshBody(profile, sketch);
    if (drawing.faces.length > 1 || drawing.faces.some((f) => !f.planar))
      throw new Error('Valitse tasomainen piirros.');
    for (const body of targets) {
      if (body.id === profile.id || !featureIsSolid(body.feature)) continue;
      if (body.locked) throw new Error('Vapauta kappaleen Hold ennen pinnan jakamista.');
      // Reject distant parts before building exact CAD geometry.
      if (
        body.origin.some((n, i) => {
          const key = (['width', 'depth', 'height'] as const)[i];
          return (
            n > profile.origin[i] + profile.feature[key] + 1e-5 ||
            n + body.feature[key] < profile.origin[i] - 1e-5
          );
        })
      )
        continue;
      const shape = createShape(body),
        faces = shape.faces;
      try {
        const candidates = meshBody(body, shape).faces.filter(
          (face) =>
            face.planar &&
            (drawing.faces.length
              ? Math.abs(dot(face.normal, drawing.faces[0].normal)) > 0.99999 &&
                Math.abs(dot(sub(drawing.faces[0].center, face.center), face.normal)) < 1e-5
              : drawing.verticesCAD.every(
                  (v) => Math.abs(dot(sub(v.point, face.center), face.normal)) < 1e-5,
                )),
        );
        // Refresh topology after each split: a drawing can cross several already divided faces.
        let next = body,
          selected: FaceRef | undefined;
        for (const candidate of candidates) {
          const currentShape = createShape(next),
            currentFaces = currentShape.faces;
          try {
            const currentFace = meshBody(next, currentShape).faces.find(
              (f) =>
                f.planar &&
                Math.hypot(...sub(f.center, candidate.center)) < 1e-5 &&
                dot(f.normal, candidate.normal) > 0.99999,
            );
            if (!currentFace) continue;
            if (drawing.faces.length) {
              const common = new (getOC().BRepAlgoAPI_Common)(
                currentFaces[currentFace.index].wrapped,
                sketch.wrapped,
              );
              let overlap: AnyShape | undefined;
              try {
                overlap = cast(common.Shape());
                const area = measureArea(overlap as Shape3D),
                  own = measureArea(currentFaces[currentFace.index]);
                if (area < 1e-6 || own - area < Math.max(1e-5, own * 1e-8)) continue;
              } finally {
                overlap?.delete();
                common.delete();
              }
            }
            const result = drawing.faces.length
              ? splitFace(next, currentFace.ref, profile)
              : splitWithPath(next, currentFace.ref, profile);
            if (!result.unchanged) {
              next = result.body;
              selected = result.face;
            }
          } finally {
            currentFaces.forEach((f) => f.delete());
            currentShape.delete();
          }
        }
        if (selected) results.push({ body: next, face: selected });
      } finally {
        faces.forEach((f) => f.delete());
        shape.delete();
      }
    }
    return results;
  } finally {
    sketch.delete();
  }
}

/** Extrude a planar sketch both ways through all supplied parts, preserving each part's identity. */
export function cutOpening(
  profile: Body,
  targets: Body[],
  options: OpeningPattern = singleOpening,
): OpeningResult {
  const shape = createShape(profile);
  let offsets: Vec3[];
  let normal: Vec3;
  try {
    const faces = meshBody(profile, shape).faces;
    if (faces.length !== 1 || !faces[0].planar)
      throw new Error('Leikkaa aukko tarvitsee yhden suljetun tasomuodon.');
    normal =
      profile.feature.type === 'profile-extrusion' ? profile.feature.frame.normal : faces[0].normal;
    offsets = options.radial ? [] : openingOffsets(options, normal);
  } finally {
    shape.delete();
  }
  const affected = new Set<string>();
  const cutters: BodyMesh[] = [];
  const angles = options.radial ? openingAngles(options) : [];
  const profiles = options.radial
    ? angles.map(
        (angle) =>
          rotateBodies(
            [profile],
            options.radial!.pivot,
            axisVector(options.radial!.axis),
            angle,
          )[0],
      )
    : offsets.map((offset) => ({ ...profile, origin: add(profile.origin, offset) }));
  let lastProfile = profile;
  const prepared: { shape: AnyShape; eligible: Set<string> }[] = [];
  try {
    for (const [index, placed] of profiles.entries()) {
      if (placed.origin.some((n) => Math.abs(n) > 100000))
        throw new Error('Aukkosarja ylittää sallitun sijaintialueen.');
      const direction = options.radial
        ? rotateVector(normal, axisVector(options.radial.axis), angles[index])
        : normal;
      const cutter = openingCutter(placed, targets, options.depth, direction);
      if (cutter) {
        prepared.push(cutter);
        cutters.push({
          ...meshBody(placed, cutter.shape),
          volume: solidVolume(cutter.shape),
          id: `opening:${cutters.length}`,
        });
      }
      if (index === profiles.length - 1) {
        // CAD circles can have the opposite face orientation to their drawing plane.
        // Preserve the intended inward cut direction when a repeated profile is a BRep.
        const shape = createShape(placed),
          faces = shape.faces;
        try {
          const face = meshBody(placed, shape).faces[0];
          if (dot(face.normal, direction) < 0) {
            const aligned = faces[0].flipOrientation();
            try {
              lastProfile = bodyFromShape(placed, aligned, []);
            } finally {
              aligned.delete();
            }
          } else lastProfile = placed;
        } finally {
          faces.forEach((f) => f.delete());
          shape.delete();
        }
      }
    }
    const bodies = targets.flatMap((body) => {
      const tools = prepared
        .filter((cutter) => cutter.eligible.has(body.id))
        .map((cutter) => cutter.shape);
      if (!tools.length) return [body];
      const source = createShape(body);
      let result: AnyShape | undefined;
      try {
        result = cutShapes(source, tools);
        if (!shapeIsValid(result)) throw new Error('Aukko ei muodosta ehjää leikkausta.');
        const { empty, changed } = cutResultState(source, result);
        if (!changed) return [body];
        if (body.locked)
          throw new Error(
            `Aukko osuu kiinnitettyyn osaan ”${body.name}”. Vapauta Hold tai poista osa kohteista.`,
          );
        affected.add(body.id);
        return empty ? [] : [bodyFromShape(body, result)];
      } finally {
        result?.delete();
        source.delete();
      }
    });
    const meshes = bodies
      .filter((b) => affected.has(b.id))
      .map((body) => {
        const shape = createShape(body);
        try {
          return meshBody(body, shape);
        } finally {
          shape.delete();
        }
      });
    return {
      bodies,
      affected: [...affected],
      normal,
      meshes,
      cutters,
      lastProfile,
    };
  } finally {
    prepared.forEach((cutter) => cutter.shape.delete());
  }
}

/** Preserve a planar region before push/pull removes it, so its cut can be repeated. */
export function faceProfile(body: Body, ref: FaceRef): Body {
  const shape = createShape(body),
    faces = shape.faces;
  try {
    const face = meshBody(body, shape).faces.find((f) => f.ref === ref && f.planar);
    if (!face) throw new Error('Aukkosarja tarvitsee tasopinnan.');
    return bodyFromShape({ ...makeBody(1, 1, 0), name: 'Aukon muoto' }, faces[face.index]);
  } finally {
    faces.forEach((f) => f.delete());
    shape.delete();
  }
}
