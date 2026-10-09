import {
  makeSphere,
  loft,
  asPnt,
  Edge,
  assembleWire,
  makeFace,
  makePolygon,
  cast,
  getOC,
  measureVolume,
  type AnyShape,
} from 'replicad';
import { bodyFromShape, createShape, shapeIsValid } from './kernel';
import { makeBody, uid, featureIsSolid, corners, type Body, type Vec3 } from '../model/project';
import { add, sub, scale, dot, unit } from '../model/geometry';
import { cross } from '../model/transforms';
import { throughPoints } from '../model/bezier';

/** Keep the control arrays and builders scoped; only the returned CAD edge owns geometry. */
export function makeBezierCurve(points: Vec3[]): Edge {
  const oc = getOC(),
    array = new oc.NCollection_Array1_gp_Pnt(1, points.length);
  let curve: InstanceType<typeof oc.Geom_BezierCurve> | undefined;
  let builder: InstanceType<typeof oc.BRepBuilderAPI_MakeEdge> | undefined;
  try {
    points.forEach((point, i) => {
      const p = asPnt(point);
      try {
        array.SetValue(i + 1, p);
      } finally {
        p.delete();
      }
    });
    curve = new oc.Geom_BezierCurve(array);
    builder = new oc.BRepBuilderAPI_MakeEdge(curve);
    return new Edge(builder.Edge());
  } finally {
    builder?.delete();
    curve?.delete();
    array.delete();
  }
}

export function sphereBody(center: Vec3, radius: number, name: string): Body {
  if (
    !Number.isFinite(radius) ||
    radius < 0.05 ||
    radius > 50000 ||
    center.some((n) => !Number.isFinite(n) || Math.abs(n) + radius > 100000)
  )
    throw new Error('Pallon halkaisijan tulee olla 0,1–100 000 mm ja pallon sallituissa rajoissa.');
  const shape = makeSphere(radius).translate(center);
  try {
    return bodyFromShape({ ...makeBody(1, 1, 1), name }, shape, []);
  } finally {
    shape.delete();
  }
}

export function bezierPath(
  input: Vec3[],
  name: string,
  closed = false,
  mode: 'smooth' | 'bezier' = 'bezier',
  outline = false,
): Body {
  if (
    input.length < 2 ||
    input.length > (mode === 'smooth' ? 100 : 301) ||
    input.some((p) => p.some((n) => !Number.isFinite(n) || Math.abs(n) > 100000))
  )
    throw new Error(
      mode === 'smooth'
        ? 'Valitse 2–100 käyräpistettä sallituissa mitoissa.'
        : 'Tarkista Bézier-käyrän ohjauspisteet.',
    );
  const points = mode === 'smooth' ? throughPoints(input, closed) : input;
  if (
    points.length < 4 ||
    points.length > 301 ||
    (points.length - 1) % 3 ||
    points.some((p) => p.some((n) => !Number.isFinite(n) || Math.abs(n) > 100000))
  )
    throw new Error(
      'Bézier-kaari tarvitsee alku- ja loppupisteen sekä kaksi ohjauspistettä. Jatka seuraavaa kaarta kolmella pisteellä.',
    );
  const edges: Edge[] = [];
  let wire: AnyShape | undefined, face: AnyShape | undefined;
  try {
    for (let i = 0; i + 3 < points.length; i += 3)
      edges.push(makeBezierCurve(points.slice(i, i + 4)));
    wire = assembleWire(edges);
    if (closed) {
      if (Math.hypot(...sub(points[0], points.at(-1)!)) > 1e-5)
        throw new Error('Sulje käyrä palaamalla alkupisteeseen.');
      if (!outline) face = makeFace(wire as ReturnType<typeof assembleWire>);
    }
    const body = bodyFromShape(
      { ...makeBody(1, 1, 0), name, purpose: closed ? 'model' : 'drawing' },
      face ?? wire,
      [],
    );
    return { ...body, curve: { points: input.map((p) => sub(p, body.origin)), mode, closed } };
  } finally {
    face?.delete();
    wire?.delete();
    edges.forEach((e) => e.delete());
  }
}

export interface KnifeRay {
  origin: Vec3;
  direction: Vec3;
}
export interface KnifeResult {
  bodies: Body[];
  affected: string[];
  pieces: string[];
  replacements: Record<string, string[]>;
}
/** Split with the actual view rays. Perspective cuts meet at the camera eye, orthographic cuts are parallel. */
export function knifeBodies(targets: Body[], rays: KnifeRay[], curveNormal?: Vec3): KnifeResult {
  if (
    rays.length < 2 ||
    rays.length > 129 ||
    rays.some(
      (r) =>
        [...r.origin, ...r.direction].some((n) => !Number.isFinite(n)) ||
        Math.abs(Math.hypot(...r.direction) - 1) > 1e-5,
    )
  )
    throw new Error('Piirrä veitselle vähintään kahden pisteen reitti (enintään 128 osuutta).');
  if (targets.some((b) => b.locked))
    throw new Error('Vapauta kappaleen lukitus ennen leikkaamista.');
  const shapes: AnyShape[] = [],
    tools: AnyShape[] = [];
  const replacements: Record<string, string[]> = {};
  const bodies: Body[] = [],
    affected: string[] = [],
    pieces: string[] = [];
  try {
    let reach = 1;
    for (const body of targets) {
      const box = {
        min: body.origin,
        max: add(body.origin, [body.feature.width, body.feature.depth, body.feature.height]),
      };
      for (const ray of rays)
        reach = Math.max(
          reach,
          Math.hypot(...sub(box.min, ray.origin)),
          Math.hypot(...sub(box.max, ray.origin)),
        );
    }
    reach = reach * 2 + 100;
    if (curveNormal) {
      if (
        rays.length !== 4 ||
        curveNormal.some((n) => !Number.isFinite(n)) ||
        Math.abs(Math.hypot(...curveNormal) - 1) > 1e-5 ||
        rays.some((r) => dot(r.direction, curveNormal) < 1e-5)
      )
        throw new Error('Kaarevan veitsen näkymä ei ole kelvollinen. Aloita reitti uudelleen.');
      const depth = Math.min(
        ...targets.flatMap((b) => corners(b).map((p) => dot(sub(p, rays[0].origin), curveNormal))),
      );
      const distances = [Math.max(0.01, depth * 0.5), reach];
      const wires: ReturnType<typeof assembleWire>[] = [];
      try {
        for (const distance of distances) {
          const points = rays.map((r) =>
            add(r.origin, scale(r.direction, distance / dot(r.direction, curveNormal))),
          );
          const edge = makeBezierCurve(points);
          try {
            wires.push(assembleWire([edge]));
          } finally {
            edge.delete();
          }
        }
        tools.push(loft(wires, { ruled: true }, true));
      } finally {
        wires.forEach((w) => w.delete());
      }
    }
    for (let i = 1; !curveNormal && i < rays.length; i++) {
      const a = rays[i - 1],
        b = rays[i];
      const points = [
        add(a.origin, scale(a.direction, 0.001)),
        add(a.origin, scale(a.direction, reach)),
        add(b.origin, scale(b.direction, reach)),
        add(b.origin, scale(b.direction, 0.001)),
      ];
      if (Math.hypot(...cross(sub(points[1], points[0]), sub(points[2], points[0]))) < 1e-7)
        continue;
      tools.push(makePolygon(points));
    }
    if (!tools.length) throw new Error('Veitsen viiva on liian lyhyt.');
    for (let index = 0; index < targets.length; index++) {
      const source = targets[index];
      const boxCorners = corners(source);
      const intersects =
        !!curveNormal ||
        rays.slice(1).some((b, i) => {
          const a = rays[i];
          const baseline = sub(add(b.origin, b.direction), a.origin);
          const n = unit(cross(a.direction, baseline));
          const values = boxCorners.map((p) => dot(sub(p, a.origin), n));
          return Math.min(...values) < -1e-6 && Math.max(...values) > 1e-6;
        });
      if (!featureIsSolid(source.feature) || !intersects) {
        bodies.push(source);
        continue;
      }
      const shape = createShape(source);
      shapes.push(shape);
      const splitter = new (getOC().BRepAlgoAPI_Splitter)();
      let result: AnyShape | undefined;
      try {
        const args = splitter.Arguments(),
          cutters = splitter.Tools();
        try {
          args.Append(shape.wrapped);
          tools.forEach((t) => cutters.Append(t.wrapped));
          splitter.SetArguments(args);
          splitter.SetTools(cutters);
        } finally {
          args.delete();
          cutters.delete();
        }
        splitter.SetNonDestructive(true);
        splitter.Build();
        result = cast(splitter.Shape());
        const solids = result.solids,
          originalSolids = shape.solids;
        try {
          if (solids.length <= originalSolids.length) {
            bodies.push(source);
            continue;
          }
          const before = measureVolume(shape.asShape3D()),
            total = solids.reduce((sum, s) => sum + measureVolume(s), 0);
          if (!shapeIsValid(result) || Math.abs(before - total) > Math.max(1e-4, before * 1e-7))
            throw new Error('Veitsen leikkaus ei säilyttänyt ehjiä osia. Muutos peruttiin.');
          solids.sort((a, b) => measureVolume(b) - measureVolume(a));
          replacements[source.id] = [];
          for (let j = 0; j < solids.length; j++) {
            const next = bodyFromShape(
              {
                ...source,
                id: j ? uid() : source.id,
                name: `${source.name.slice(0, 110)} · ${j + 1}`,
                component: undefined,
              },
              solids[j],
              [source],
            );
            bodies.push(next);
            pieces.push(next.id);
            replacements[source.id].push(next.id);
          }
          affected.push(source.id);
        } finally {
          solids.forEach((s) => s.delete());
          originalSolids.forEach((s) => s.delete());
        }
      } finally {
        result?.delete();
        splitter.delete();
        shape.delete();
        shapes.pop();
      }
    }
    return { bodies, affected, pieces, replacements };
  } finally {
    shapes.forEach((s) => s.delete());
    tools.forEach((s) => s.delete());
  }
}
