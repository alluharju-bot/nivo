import {
  loft,
  makeSolid,
  makeFace,
  getOC,
  cast,
  assembleWire,
  type AnyShape,
  type Wire,
  type Face,
  type Shape3D,
} from 'replicad';
import { bodyFromShape, createShape, meshBody, shapeIsValid } from './kernel';
import { featureIsSolid, makeBody, type Body } from '../model/project';

export interface ThroughShapesOptions {
  mode: 'sections' | 'sides';
  smooth: boolean;
  closeSides: boolean;
  solid: boolean;
  reverseIds: string[];
  name: string;
  tipHeight?: number;
}

/** Ordered wires are exact CAD inputs, including circles, lines and Bézier chains.
 * Inputs are read-only: a locked construction profile may safely guide a new part. */
export function throughShapes(profiles: Body[], options: ThroughShapesOptions) {
  if (
    profiles.length < (options.mode === 'sections' && options.tipHeight !== undefined ? 1 : 2) ||
    profiles.length > 24 ||
    new Set(profiles.map((p) => p.id)).size !== profiles.length
  )
    throw new Error('Valitse 2–24 erillistä muotoa pinnan järjestyksessä.');
  if (profiles.some((p) => featureIsSolid(p.feature)))
    throw new Error('Valitse viivoja tai tasomuotoja. Tilavuuskappale ei ole profiili.');
  if (
    options.tipHeight !== undefined &&
    (!Number.isFinite(options.tipHeight) ||
      Math.abs(options.tipHeight) < 0.1 ||
      Math.abs(options.tipHeight) > 100000)
  )
    throw new Error('Anna kärjen etäisyydeksi 0,1–100 000 mm. Miinus vaihtaa puolta.');
  if (options.mode === 'sides' && options.closeSides && profiles.length < 3)
    throw new Error('Ympäri sulkemiseen tarvitaan vähintään kolme sivukäyrää.');
  const shapes: AnyShape[] = [],
    wires: Wire[] = [],
    caps: Face[] = [];
  let surface: Shape3D | undefined, result: Shape3D | undefined;
  try {
    for (const body of profiles) {
      const shape = createShape(body);
      shapes.push(shape);
      const faces = shape.faces;
      try {
        if (faces.length > 1 || faces.some((f) => f.geomType !== 'PLANE'))
          throw new Error('Kukin profiili saa olla yksi viiva tai yksi tasopinta.');
        if (faces.length) {
          const boundaries = faces[0].wires;
          const count = boundaries.length;
          boundaries.forEach((w) => w.delete());
          if (count !== 1)
            throw new Error('Reiällinen profiili ei vielä sovi tähän prototyyppiin.');
          wires.push(faces[0].outerWire());
        } else {
          const paths = shape.wires;
          if (paths.length !== 1) {
            paths.forEach((w) => w.delete());
            throw new Error('Valitse yksi yhtenäinen viiva kerrallaan.');
          }
          wires.push(paths[0]);
        }
        if (options.reverseIds.includes(body.id)) {
          const previous = wires.pop()!;
          wires.push(previous.flipOrientation() as unknown as Wire);
          previous.delete();
        }
      } finally {
        faces.forEach((f) => f.delete());
      }
    }
    if (options.mode === 'sections') {
      const closed = wires[0].isClosed;
      if (wires.some((w) => w.isClosed !== closed))
        throw new Error('Poikkileikkausten tulee olla kaikki avoimia tai kaikki suljettuja.');
      if (options.solid && !closed)
        throw new Error('Umpikappale tarvitsee suljetut poikkileikkaukset.');
      let endPoint: import('../model/project').Vec3 | undefined;
      if (options.tipHeight !== undefined) {
        if (!closed) throw new Error('Kärkeen päättäminen tarvitsee suljetun tasoprofiilin.');
        const face = makeFace(wires.at(-1)!);
        const center = face.center,
          normal = face.normalAt();
        try {
          const last = profiles.at(-1)!;
          const direction =
            last.feature.type === 'profile-extrusion'
              ? last.feature.frame.normal
              : normal.toTuple();
          endPoint = center
            .toTuple()
            .map((n, i) => n + direction[i] * options.tipHeight!) as typeof endPoint;
        } finally {
          center.delete();
          normal.delete();
          face.delete();
        }
      }
      result = loft(wires, { ruled: !options.smooth, endPoint }, !options.solid);
    } else {
      if (wires.some((w) => w.isClosed))
        throw new Error(
          'Sivukäyrien tulee olla avoimia. Käytä ympyröille Poikkileikkaukset-tilaa.',
        );
      if (options.solid && !options.closeSides)
        throw new Error('Sulje sivut ympäri ennen päätyjen sulkemista.');
      surface = loft(
        options.closeSides ? [...wires, wires[0]] : wires,
        { ruled: !options.smooth },
        true,
      );
      if (options.solid) {
        // Sewing uses the surface's own free boundaries, never a separately sampled cap.
        // Its only closed boundaries are the top and bottom once the sides are sewn.
        const oc = getOC(),
          sewing = new oc.BRepBuilderAPI_Sewing(1e-6, true, true, true, false);
        let sewn: AnyShape | undefined;
        try {
          sewing.Add(surface.wrapped);
          sewing.Perform();
          sewn = cast(sewing.SewedShape());
          // The closed end wires are built from the cross-edges of the loft.
          const edges = surface.edges;
          try {
            const endpoints = wires.map((w) => {
              const a = w.startPoint,
                b = w.endPoint;
              try {
                return [a.toTuple(), b.toTuple()];
              } finally {
                a.delete();
                b.delete();
              }
            });
            for (const end of [0, 1]) {
              const points = endpoints.map((p) => p[end]);
              const rim = edges.filter((edge) => {
                const a = edge.startPoint,
                  b = edge.endPoint;
                try {
                  return [a.toTuple(), b.toTuple()].every((p) =>
                    points.some((q) => Math.hypot(...p.map((n, k) => n - q[k])) < 1e-5),
                  );
                } finally {
                  a.delete();
                  b.delete();
                }
              });
              const wire = assembleWire(rim);
              try {
                caps.push(makeFace(wire));
              } finally {
                wire.delete();
              }
            }
            const faces = sewn.faces;
            try {
              result = makeSolid([...faces, ...caps]);
            } finally {
              faces.forEach((f) => f.delete());
            }
          } finally {
            edges.forEach((e) => e.delete());
          }
        } finally {
          sewn?.delete();
          sewing.delete();
        }
      } else result = surface;
    }
    if (!shapeIsValid(result))
      throw new Error(
        'Profiilit risteävät tai pinta kiertyy. Vaihda järjestystä tai käännä käyrän suunta.',
      );
    const body = bodyFromShape(
      { ...makeBody(1, 1, 0), name: options.name.trim() || 'Muotojen läpi' },
      result,
      [],
    );
    if (options.solid && !featureIsSolid(body.feature))
      throw new Error('Päätyjä ei voitu sulkea. Kokeile pintaa tai tasomaisia päätyjä.');
    return { body, mesh: meshBody(body, result) };
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error(
      'Näistä profiileista ei syntynyt ehjää pintaa. Tarkista järjestys, suunta ja päätyjen tasomaisuus.',
    );
  } finally {
    if (result && result !== surface) result.delete();
    surface?.delete();
    caps.forEach((f) => f.delete());
    wires.forEach((w) => w.delete());
    shapes.forEach((s) => s.delete());
  }
}
