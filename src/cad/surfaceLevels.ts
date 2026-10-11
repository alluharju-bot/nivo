import {
  loft,
  makeFace,
  makeSolid,
  deserializeShape,
  getOC,
  cast,
  measureArea,
  measureDistanceBetween,
  makeVertex,
  type AnyShape,
  type Wire,
  type Face,
} from 'replicad';
import { bodySchema, featureIsSolid, makeBody, type Body, type Vec3 } from '../model/project';
import { add, sub, scale, dot, unit } from '../model/geometry';
import {
  surfaceLevelsSchema,
  type SurfaceLevels,
  type SurfaceLevelOptions,
} from '../model/surfaceLevels';
import { bodyFromShape, createShape, meshBody, shapeIsValid } from './kernel';
import { isPlanarFace } from './planarity';
import { shapeVertexReferences } from './vertexReferences';

export interface SurfaceLevelsResult {
  body: Body;
  mesh: ReturnType<typeof meshBody>;
  bands: { min: number; max: number; rise: number }[];
}

/** Independent, exact closed boundaries. The recipe survives hidden/deleted sources. */
function profileRecipe(profiles: Body[]): SurfaceLevels {
  if (
    profiles.length < 2 ||
    profiles.length > 12 ||
    new Set(profiles.map((b) => b.id)).size !== profiles.length
  )
    throw new Error('Valitse 2–12 sisäkkäistä suljettua tasomuotoa ulkoa sisään.');
  const boundaries: SurfaceLevels['boundaries'] = [];
  let normal: Vec3 = [0, 0, 1],
    origin: Vec3 = [0, 0, 0];
  for (const [i, body] of profiles.entries()) {
    if (featureIsSolid(body.feature))
      throw new Error('Valitse paksuudettomia tasomuotoja tai suljettuja ääriviivoja.');
    const shape = createShape(body),
      faces = shape.faces;
    let wire: Wire | undefined, face: Face | undefined;
    try {
      if (faces.length > 1)
        throw new Error('Valitse yksi yhtenäinen tasomuoto kullekin rajaukselle.');
      if (faces.length) {
        const wires = faces[0].wires,
          count = wires.length;
        wires.forEach((w) => w.delete());
        if (count !== 1)
          throw new Error(
            'Lähtömuodon tulee olla reiätön. Valitse aukko omana sisimpänä rajauksenaan.',
          );
        wire = faces[0].outerWire();
      } else {
        const wires = shape.wires;
        if (wires.length !== 1) {
          wires.forEach((w) => w.delete());
          throw new Error('Valitse yksi suljettu ääriviiva.');
        }
        wire = wires[0];
      }
      if (!wire.isClosed) throw new Error('Rajauksen tulee olla suljettu.');
      face = makeFace(wire);
      if (!isPlanarFace(face)) throw new Error('Rajauksen tulee olla tasomainen.');
      const n = face.normalAt(),
        p = wire.startPoint;
      try {
        const direction = unit(n.toTuple());
        if (!i) {
          normal = direction;
          // Horizontal sketches may be drawn from underneath. Positive height
          // follows the positive dominant world axis, not wire winding order.
          const dominant = normal.reduce(
            (a, v, k) => (Math.abs(v) > Math.abs(normal[a]) ? k : a),
            0,
          );
          if (normal[dominant] < 0) normal = scale(normal, -1);
          origin = p.toTuple();
        }
        if (Math.abs(dot(direction, normal)) < 1 - 1e-6)
          throw new Error('Rajauksien tasojen tulee olla samansuuntaisia.');
        const z = dot(sub(p.toTuple(), origin), normal);
        wire = wire.translate(scale(normal, -z));
        boundaries.push({ name: body.name, wire: wire.serialize(), height: z });
      } finally {
        n.delete();
        p.delete();
      }
    } finally {
      face?.delete();
      wire?.delete();
      faces.forEach((f) => f.delete());
      shape.delete();
    }
  }
  return { normal, boundaries, baseDepth: 0, openCenter: true };
}

/** Common-plane containment must be exact: overlapping or touching boundaries
 * must never turn into a silently folded surface. */
function bandArea(outer: Wire, inner: Wire) {
  if (measureDistanceBetween(outer, inner) < 0.01)
    throw new Error('Rajaukset koskettavat tai leikkaavat toisiaan. Jätä niiden väliin tilaa.');
  const a = makeFace(outer),
    b = makeFace(inner),
    oc = getOC();
  const common = new oc.BRepAlgoAPI_Common(a.wrapped, b.wrapped);
  let overlap: AnyShape | undefined;
  try {
    common.Build();
    overlap = cast(common.Shape());
    const innerArea = measureArea(b),
      outerArea = measureArea(a);
    if (
      outerArea <= innerArea ||
      Math.abs(measureArea(overlap.asShape3D()) - innerArea) > Math.max(0.01, innerArea * 1e-7)
    )
      throw new Error(
        'Valitse rajaukset sisäkkäin ulkoa sisään. Sisempi rajaus ei mahdu edellisen sisään.',
      );
    return outerArea - innerArea;
  } finally {
    overlap?.delete();
    common.delete();
    a.delete();
    b.delete();
  }
}

export function surfaceLevels(
  profiles: Body[],
  options: SurfaceLevelOptions,
  existing?: Body,
): SurfaceLevelsResult {
  if (existing?.locked)
    throw new Error('Kappale on kiinnitetty. Vapauta se ennen korkeuksien muokkaamista.');
  const saved = existing?.feature.type === 'brep' ? existing.feature.surfaceLevels : undefined;
  if (existing && !saved) throw new Error('Tällä osalla ei ole muokattavia korkeusrajauksia.');
  const recipe = saved ?? profileRecipe(profiles);
  if (options.heights.length !== recipe.boundaries.length)
    throw new Error('Anna korkeus jokaiselle rajaukselle.');
  const parsed = surfaceLevelsSchema.safeParse({
    ...recipe,
    ...options,
    boundaries: recipe.boundaries.map((b, i) => ({ ...b, height: options.heights[i] })),
  });
  if (!parsed.success) throw new Error('Tarkista rajauksien korkeudet ja pohjan syvyys.');
  const config = parsed.data,
    normal = config.normal;
  if (config.baseDepth > 0 && config.boundaries.some((b) => b.height + config.baseDepth < 0.1))
    throw new Error('Pohja on liian lähellä pintaa. Lisää pohjan syvyyttä tai nosta rajausta.');
  const owned: AnyShape[] = [],
    faces: Face[] = [];
  const keep = <T extends AnyShape>(s: T): T => {
    owned.push(s);
    return s;
  };
  try {
    const flat = config.boundaries.map((b) => {
      const shape = keep(deserializeShape(b.wire));
      const wires = shape.wires;
      try {
        if (wires.length !== 1 || !wires[0].isClosed)
          throw new Error('Tallennettu rajaus ei ole ehjä suljettu viiva.');
        return keep(wires[0].clone().translate(existing?.origin ?? [0, 0, 0]));
      } finally {
        wires.forEach((w) => w.delete());
      }
    });
    const areas = flat.slice(1).map((inner, i) => bandArea(flat[i], inner));
    const raised = flat.map((w, i) =>
      keep(w.clone().translate(scale(normal, config.boundaries[i].height))),
    );
    const bands: SurfaceLevelsResult['bands'] = [];
    for (let i = 0; i < raised.length - 1; i++) {
      const rise = config.boundaries[i + 1].height - config.boundaries[i].height;
      const band = keep(
        Math.abs(rise) < 1e-8
          ? makeFace(raised[i], [raised[i + 1]])
          : loft([raised[i], raised[i + 1]], { ruled: true }, true),
      );
      if (!shapeIsValid(band)) throw new Error('Näistä rajauksista ei synny ehjää pintaa.');
      const mesh = band.mesh({ tolerance: 0.1, angularTolerance: 0.1 });
      let projected = 0,
        min = Infinity,
        max = 0;
      for (let j = 0; j < mesh.triangles.length; j += 3) {
        const p = mesh.triangles
          .slice(j, j + 3)
          .map((k) => mesh.vertices.slice(k * 3, k * 3 + 3) as Vec3);
        const u = sub(p[1], p[0]),
          v = sub(p[2], p[0]);
        const cross: Vec3 = [
          u[1] * v[2] - u[2] * v[1],
          u[2] * v[0] - u[0] * v[2],
          u[0] * v[1] - u[1] * v[0],
        ];
        const area = Math.hypot(...cross),
          plan = Math.abs(dot(cross, normal));
        if (area < 1e-10) continue;
        projected += plan / 2;
        const slope =
          (100 * Math.sqrt(Math.max(0, area * area - plan * plan))) / Math.max(plan, 1e-10);
        min = Math.min(min, slope);
        max = Math.max(max, slope);
      }
      // Detect folds/overlap in the projection, including incompatible seam
      // correspondence. This is a surface, not a twisting pipe between profiles.
      if (Math.abs(projected - areas[i]) > Math.max(1, areas[i] * 0.003) || max > 10000)
        throw new Error(
          'Pinta taittuu näillä rajauksilla. Käytä yksinkertaisempia sisäkkäisiä muotoja.',
        );
      bands.push({ min: Number.isFinite(min) ? min : 0, max, rise });
      faces.push(...band.faces);
    }
    if (!config.openCenter) faces.push(makeFace(raised.at(-1)!));
    if (config.baseDepth > 0) {
      const bottomOuter = keep(flat[0].clone().translate(scale(normal, -config.baseDepth)));
      const bottomInner = config.openCenter
        ? keep(flat.at(-1)!.clone().translate(scale(normal, -config.baseDepth)))
        : undefined;
      faces.push(makeFace(bottomOuter, bottomInner ? [bottomInner] : []));
      for (const pair of [
        [raised[0], bottomOuter],
        ...(bottomInner ? [[raised.at(-1)!, bottomInner]] : []),
      ]) {
        const wall = keep(loft(pair, { ruled: true }, true));
        faces.push(...wall.faces);
      }
    }
    let result: AnyShape;
    if (config.baseDepth > 0) result = keep(makeSolid(faces));
    else {
      const oc = getOC(),
        sewing = new oc.BRepBuilderAPI_Sewing(1e-6, true, true, true, false);
      try {
        faces.forEach((f) => sewing.Add(f.wrapped));
        sewing.Perform();
        result = keep(cast(sewing.SewedShape()));
      } finally {
        sewing.delete();
      }
    }
    if (!shapeIsValid(result))
      throw new Error('Korkeudet eivät muodosta ehjää pintaa. Edellinen malli säilyi.');
    const base = existing ?? {
      ...makeBody(1, 1, 0),
      color: profiles[0].color,
      appearance: profiles[0].appearance,
      material: profiles[0].material,
    };
    const body = bodyFromShape(
      { ...base, name: options.name.trim() || 'Korkeuspinta' },
      result,
      existing ? [existing] : [],
    );
    if (body.feature.type !== 'brep') throw new Error('Pinnan tallennus epäonnistui.');
    if (existing && saved) {
      const old = keep(createShape(existing));
      const references = [
        ...shapeVertexReferences(existing, old),
        ...Object.entries(existing.vertexRefs ?? {}).map(([key, local]) => ({
          key,
          point: add(existing.origin, local),
        })),
      ];
      const actual = shapeVertexReferences(body, result).map((v) => v.point);
      const start = flat[0].startPoint,
        referencePlane = start.toTuple();
      start.delete();
      const mapped = new Map<string, Vec3 | undefined>();
      for (const { key, point } of references) {
        if (body.vertexRefs?.[key]) continue;
        const token = point.map((n) => Math.round(n * 1e6)).join(',');
        if (!mapped.has(token)) {
          const height = dot(sub(point, referencePlane), normal);
          const onPlane = makeVertex(sub(point, scale(normal, height)));
          let moved: Vec3 | undefined;
          try {
            for (const [i, wire] of flat.entries()) {
              const onTop = Math.abs(height - saved.boundaries[i].height) < 1e-5;
              const onBase =
                saved.baseDepth > 0 &&
                config.baseDepth > 0 &&
                Math.abs(height + saved.baseDepth) < 1e-5 &&
                (i === 0 || (i === flat.length - 1 && saved.openCenter && config.openCenter));
              if ((!onTop && !onBase) || measureDistanceBetween(onPlane, wire) > 1e-5) continue;
              const target = add(
                point,
                scale(normal, (onTop ? config.boundaries[i].height : -config.baseDepth) - height),
              );
              moved = actual.find((p) => Math.hypot(...sub(p, target)) < 1e-5);
              if (moved) break;
            }
          } finally {
            onPlane.delete();
          }
          mapped.set(token, moved);
        }
        const target = mapped.get(token);
        if (target) (body.vertexRefs ??= {})[key] = sub(target, body.origin);
      }
    }
    body.feature.surfaceLevels = {
      ...config,
      boundaries: flat.map((wire, i) => {
        const local = wire.clone().translate(scale(body.origin, -1));
        try {
          return { ...config.boundaries[i], wire: local.serialize() };
        } finally {
          local.delete();
        }
      }),
    };
    return { body: bodySchema.parse(body), mesh: meshBody(body, result), bands };
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error('Rajauksista ei syntynyt ehjää pintaa. Tarkista sisäkkäisyys ja korkeudet.');
  } finally {
    faces.forEach((f) => f.delete());
    owned.reverse().forEach((s) => s.delete());
  }
}
