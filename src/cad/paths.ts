import {
  assembleWire,
  makeLine,
  cast,
  getOC,
  measureVolume,
  basicFaceExtrusion,
  Vector,
  type AnyShape,
} from 'replicad';
import { bodyFromShape, createShape, meshBody, shapeIsValid } from './kernel';
import {
  makeBody,
  corners,
  featureIsSolid,
  type Body,
  type Vec3,
  type FaceRef,
} from '../model/project';
import { dot, sub, scale } from '../model/geometry';
import { sketchFrame, frameV } from '../model/sketch';
import type { SplitResult } from './protocol';

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
        Math.abs(measureVolume(result.asShape3D()) - before.volume) >
          Math.max(1e-5, before.volume * 1e-8))
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
  bodies: Body[];
  affected: string[];
}

/** Extrude a planar sketch both ways through all supplied parts, preserving each part's identity. */
export function cutOpening(profile: Body, targets: Body[]): OpeningResult {
  if (featureIsSolid(profile.feature)) throw new Error('Valitse suljettu muoto ilman paksuutta.');
  const sketch = createShape(profile),
    faces = sketch.faces;
  let cutter: AnyShape | undefined;
  try {
    const metadata = meshBody(profile, sketch).faces;
    if (faces.length !== 1 || !metadata[0]?.planar)
      throw new Error('Leikkaa aukko tarvitsee yhden suljetun tasomuodon.');
    const { normal, center } = metadata[0];
    const frame = sketchFrame(center, normal),
      axes = [frame.u, frameV(frame)];
    const projected = (body: Body) =>
      axes.map((axis) => {
        const values = corners(body).map((p) => dot(p, axis));
        return [Math.min(...values), Math.max(...values)];
      });
    const limits = projected(profile);
    const eligible = targets.filter(
      (b) =>
        b.id !== profile.id &&
        featureIsSolid(b.feature) &&
        projected(b).every((range, i) => range[0] <= limits[i][1] && range[1] >= limits[i][0]),
    );
    const eligibleIds = new Set(eligible.map((b) => b.id));
    if (!eligible.length) return { bodies: targets, affected: [] };
    let min = Infinity,
      max = -Infinity;
    for (const body of eligible)
      for (const point of corners(body)) {
        const depth = dot(sub(point, center), normal);
        min = Math.min(min, depth - 1);
        max = Math.max(max, depth + 1);
      }
    const face = faces[0].clone().translate(scale(normal, min)),
      vector = new Vector(scale(normal, max - min));
    try {
      cutter = basicFaceExtrusion(face, vector);
    } finally {
      face.delete();
      vector.delete();
    }
    const affected: string[] = [],
      bodies: Body[] = [];
    for (const body of targets) {
      if (!eligibleIds.has(body.id)) {
        bodies.push(body);
        continue;
      }
      const source = createShape(body);
      let result: AnyShape | undefined;
      try {
        const before = measureVolume(source.asShape3D());
        result = source.asShape3D().cut(cutter.asShape3D());
        if (!shapeIsValid(result)) throw new Error('Aukko ei muodosta ehjää leikkausta.');
        const solids = result.solids,
          empty = solids.length === 0;
        solids.forEach((s) => s.delete());
        const volume = empty ? 0 : measureVolume(result.asShape3D());
        if (Math.abs(volume - before) < Math.max(1e-7, before * 1e-10)) bodies.push(body);
        else {
          if (body.locked)
            throw new Error(
              `Aukko osuu kiinnitettyyn osaan ”${body.name}”. Vapauta Hold tai poista osa kohteista.`,
            );
          affected.push(body.id);
          if (volume > 1e-7) bodies.push(bodyFromShape(body, result));
        }
      } finally {
        result?.delete();
        source.delete();
      }
    }
    return { bodies, affected };
  } finally {
    cutter?.delete();
    faces.forEach((f) => f.delete());
    sketch.delete();
  }
}
