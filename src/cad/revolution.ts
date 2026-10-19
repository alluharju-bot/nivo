import {
  deserializeShape,
  makeFace,
  makeAx1,
  getOC,
  cast,
  type AnyShape,
  type Wire,
} from 'replicad';
import { bodySchema, featureIsSolid, makeBody, type Body, type Vec3 } from '../model/project';
import { add, sub, scale, unit } from '../model/geometry';
import { revolutionSchema, type RevolutionOptions } from '../model/revolution';
import { createShape, bodyFromShape, meshBody, shapeIsValid } from './kernel';
import { isPlanarFace } from './planarity';

/** The saved profile and axis share the result's local frame; sources may be removed. */
export function revolveProfile(
  profile: Body | undefined,
  options: RevolutionOptions,
  existing?: Body,
) {
  if (existing?.locked) throw new Error('Vapauta osan lukitus ennen pyöräytyksen muokkaamista.');
  const saved = existing?.feature.type === 'brep' ? existing.feature.revolution : undefined;
  if (!profile && !saved) throw new Error('Valitse profiiliksi viiva tai tasomuoto.');
  if (profile && featureIsSolid(profile.feature)) throw new Error('Valitse paksuudeton profiili.');
  if (!options.axis.every(Number.isFinite) || Math.hypot(...options.axis) < 1e-8)
    throw new Error('Valitse kelvollinen pyöräytysakseli.');
  const owned: AnyShape[] = [];
  const keep = <T extends AnyShape>(s: T): T => {
    owned.push(s);
    return s;
  };
  try {
    const source = keep(
      profile ? createShape(profile) : deserializeShape(saved!.profile).translate(existing!.origin),
    );
    const faces = source.faces;
    owned.push(...faces);
    let input: AnyShape;
    let solid: boolean;
    if (faces.length) {
      if (faces.length !== 1 || !isPlanarFace(faces[0]))
        throw new Error('Valitse yksi tasomainen profiili.');
      input = faces[0];
      solid = true;
    } else {
      const wires = source.wires;
      owned.push(...wires);
      if (wires.length !== 1) throw new Error('Profiilin tulee olla yksi yhtenäinen viiva.');
      const wire: Wire = wires[0];
      solid = wire.isClosed;
      input = solid ? keep(makeFace(wire)) : wire;
      if (solid && !isPlanarFace(input as import('replicad').Face))
        throw new Error('Suljetun profiilin tulee olla tasomainen.');
    }
    const parsed = revolutionSchema.safeParse({
      ...options,
      axis: unit(options.axis),
      solid,
      profile: input.serialize(),
      profileName: profile?.name ?? saved!.profileName,
    });
    if (!parsed.success)
      throw new Error(
        'Anna pyöräytyskulma väliltä −360…360° (vähintään 0,01°) ja kelvollinen akseli.',
      );
    const config = parsed.data;
    const ax = makeAx1(config.origin, config.axis);
    const builder = new (getOC().BRepPrimAPI_MakeRevol)(
      input.wrapped,
      ax,
      (config.angle * Math.PI) / 180,
      false,
    );
    let result: AnyShape;
    try {
      if (!builder.IsDone())
        throw new Error('Profiilia ei voitu pyöräyttää. Tarkista akseli ja profiili.');
      result = keep(cast(builder.Shape()));
    } finally {
      builder.delete();
      ax.delete();
    }
    if (!shapeIsValid(result))
      throw new Error('Pyöräytys leikkaa itsensä. Tarkista profiili ja akseli.');
    const body = bodyFromShape(
      { ...(existing ?? makeBody(1, 1, 1)), name: options.name.trim() || 'Pyöräytys' },
      result,
      [],
    );
    const resultFaces = result.faces;
    const faceCount = resultFaces.length;
    resultFaces.forEach((f) => f.delete());
    if (body.feature.type !== 'brep' || (solid && !body.feature.solid) || !faceCount)
      throw new Error('Pyöräytyksestä ei syntynyt kelvollista pintaa tai kappaletta.');
    const local = keep(input.clone().translate(scale(body.origin, -1)));
    const curve = profile?.curve ?? (!profile ? saved?.curve : undefined);
    body.feature.revolution = {
      ...config,
      origin: sub(config.origin, body.origin),
      profile: local.serialize(),
      curve: curve
        ? {
            ...curve,
            points: curve.points.map((p) =>
              sub(add(profile?.origin ?? existing!.origin, p), body.origin),
            ),
          }
        : undefined,
    };
    return { body: bodySchema.parse(body), mesh: meshBody(body, result) };
  } catch (e) {
    if (e instanceof Error && /[äö]|Valitse|Anna|Profiili|Suljetun/.test(e.message)) throw e;
    throw new Error(
      'Profiilia ei voitu pyöräyttää. Tarkista ettei profiili leikkaa itseään tai ylitä akselia.',
    );
  } finally {
    owned.reverse().forEach((s) => s.delete());
  }
}

export function transformRevolution(
  source: Body,
  result: Body,
  transform: (s: AnyShape) => AnyShape,
  point: (p: Vec3) => Vec3,
  direction: (v: Vec3) => Vec3,
) {
  const recipe = source.feature.type === 'brep' ? source.feature.revolution : undefined;
  if (!recipe || result.feature.type !== 'brep') return;
  let profile = deserializeShape(recipe.profile).translate(source.origin);
  try {
    profile = transform(profile).translate(scale(result.origin, -1));
    result.feature.revolution = {
      ...recipe,
      profile: profile.serialize(),
      origin: sub(point(add(source.origin, recipe.origin)), result.origin),
      axis: unit(direction(recipe.axis)),
      curve: recipe.curve
        ? {
            ...recipe.curve,
            points: recipe.curve.points.map((p) =>
              sub(point(add(source.origin, p)), result.origin),
            ),
          }
        : undefined,
    };
  } finally {
    profile.delete();
  }
}

export function restoreRevolutionProfile(body: Body): Body {
  const recipe = body.feature.type === 'brep' ? body.feature.revolution : undefined;
  if (!recipe) throw new Error('Osalla ei ole tallennettua pyöräytysprofiilia.');
  const shape = deserializeShape(recipe.profile).translate(body.origin);
  try {
    const result = bodyFromShape(
      { ...makeBody(1, 1, 1), name: `${body.name} · profiili`.slice(0, 120) },
      shape,
      [],
    );
    result.curve = recipe.curve
      ? {
          ...recipe.curve,
          points: recipe.curve.points.map((p) => sub(add(body.origin, p), result.origin)),
        }
      : undefined;
    return bodySchema.parse(result);
  } finally {
    shape.delete();
  }
}
