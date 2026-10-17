import {
  assembleWire,
  makeCircle,
  makePolygon,
  getOC,
  cast,
  isShape3D,
  measureVolume,
  type AnyShape,
  type Wire,
  type Shape3D,
} from 'replicad';
import { bodyFromShape, createShape, meshBody, shapeIsValid } from './kernel';
import { featureIsSolid, makeBody, type Body, type Vec3 } from '../model/project';
import { sketchFrame, fromUV, cross } from '../model/sketch';
import { add, scale, unit } from '../model/geometry';

export interface SweepOptions {
  profile: 'circle' | 'rectangle';
  width: number;
  height: number;
  wall: number;
  rotation: number;
  name: string;
}

/** A read-only path may be locked. Only the newly created independent part is changed. */
export function sweepPath(path: Body, options: SweepOptions) {
  if (featureIsSolid(path.feature))
    throw new Error('Valitse viiva, käyrä tai tasomuodon ulkoreuna poluksi.');
  const { width, height, wall, rotation } = options;
  if (
    ![width, height, wall, rotation].every(Number.isFinite) ||
    width < 0.1 ||
    width > 100000 ||
    height < 0.1 ||
    height > 100000 ||
    wall < 0 ||
    Math.abs(rotation) > 360000
  )
    throw new Error('Anna profiilin mitat 0,1–100 000 mm ja seinämä vähintään nollana.');
  if (wall && wall * 2 >= Math.min(width, options.profile === 'circle' ? width : height))
    throw new Error('Seinämän tulee olla pienempi kuin puolet profiilin pienimmästä mitasta.');
  const owned: AnyShape[] = [];
  try {
    const source = createShape(path);
    owned.push(source);
    const faces = source.faces;
    let spine: Wire;
    try {
      if (faces.length > 1) throw new Error('Valitse yksi yhtenäinen viiva tai yksi tasomuoto.');
      if (faces.length) spine = faces[0].outerWire();
      else {
        const wires = source.wires;
        owned.push(...wires);
        if (wires.length !== 1) throw new Error('Polun tulee olla yksi yhtenäinen viiva.');
        spine = wires[0];
      }
      if (faces.length) owned.push(spine);
    } finally {
      faces.forEach((f) => f.delete());
    }
    if (spine.length < 0.1) throw new Error('Polku on liian lyhyt.');
    const start = spine.startPoint,
      tangent = spine.tangentAt(0);
    let origin: Vec3, normal: Vec3;
    try {
      origin = start.toTuple();
      normal = unit(tangent.toTuple());
    } finally {
      start.delete();
      tangent.delete();
    }
    const frame = sketchFrame(origin, normal),
      angle = (rotation * Math.PI) / 180;
    frame.u = add(scale(frame.u, Math.cos(angle)), scale(cross(normal, frame.u), Math.sin(angle)));
    const profile = (inset: number) => {
      let wire: Wire;
      if (options.profile === 'circle') {
        const edge = makeCircle(width / 2 - inset, origin, normal);
        try {
          wire = assembleWire([edge]);
        } finally {
          edge.delete();
        }
      } else {
        const w = width / 2 - inset,
          h = height / 2 - inset;
        const face = makePolygon(
          [
            [-w, -h],
            [w, -h],
            [w, h],
            [-w, h],
          ].map((p) => fromUV(p as [number, number], frame)),
        );
        try {
          wire = face.outerWire();
        } finally {
          face.delete();
        }
      }
      owned.push(wire);
      return wire;
    };
    const extrude = (wire: Wire): Shape3D => {
      const oc = getOC(),
        builder = new oc.BRepOffsetAPI_MakePipeShell(spine.wrapped);
      try {
        // Parallel transport (the default) avoids Frenet flips at straight/inflection points.
        builder.SetTransitionMode(oc.BRepBuilderAPI_TransitionMode.BRepBuilderAPI_RightCorner);
        builder.Add(wire.wrapped, false, false);
        builder.Build();
        if (!builder.MakeSolid()) throw new Error('Polun mutka on liian tiukka tälle profiilille.');
        const shape = cast(builder.Shape());
        owned.push(shape);
        if (!isShape3D(shape)) throw new Error('Polusta ei syntynyt suljettua kappaletta.');
        return shape;
      } finally {
        builder.delete();
      }
    };
    let result = extrude(profile(0));
    if (wall > 0) {
      const inner = extrude(profile(wall));
      result = result.cut(inner);
      owned.push(result);
    }
    const solids = result.solids;
    try {
      if (solids.length !== 1 || !shapeIsValid(result) || measureVolume(result) <= 1e-8)
        throw new Error(
          'Polku tai profiili leikkaa itsensä. Pienennä profiilia tai loivenna mutkia.',
        );
    } finally {
      solids.forEach((s) => s.delete());
    }
    const body = bodyFromShape(
      { ...makeBody(1, 1, 1), name: options.name.trim().slice(0, 120) || 'Polkua pitkin' },
      result,
      [],
    );
    return { body, mesh: meshBody(body, result) };
  } catch (error) {
    if (error instanceof Error && /[äö]|Polku|Valitse|Seinämän|Anna/.test(error.message))
      throw error;
    throw new Error(
      'Profiilia ei voitu kuljettaa polkua pitkin. Kokeile pienempää profiilia tai loivempia mutkia.',
    );
  } finally {
    owned.reverse().forEach((s) => s.delete());
  }
}
