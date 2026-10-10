import { shapeEdges } from './topology';
import { cast, getOC, type AnyShape } from 'replicad';
import { featureIsSolid, uid, type Body } from '../model/project';
import { bodyFromShape, createShape, meshBody, shapeIsValid } from './kernel';
import { add, sub } from '../model/geometry';
import { detailSourceShape } from './detailSource';
import type { EdgeDetailResult } from './protocol';
import { filletPrism } from './prismFillet';
import { detailEdgeIndices } from './detailEdges';
import type { TransformCache } from './buildCache';

export function detailEdges(
  body: Body,
  indices: number[],
  operation: 'fillet' | 'chamfer',
  size: number,
  editing = false,
  cache?: TransformCache,
): EdgeDetailResult {
  if (body.locked)
    throw new Error('Kappale on kiinnitetty. Vapauta Hold ennen reunojen muokkaamista.');
  if (!featureIsSolid(body.feature))
    throw new Error(
      'Anna osalle ensin paksuus. Viiste ja pyöristys tarvitsevat tilavuuskappaleen.',
    );
  if (!Number.isFinite(size) || size < 0.1 || size > 100000)
    throw new Error('Anna mitta väliltä 0,1–100 000 mm.');
  const source = editing ? body.edgeTreatment : undefined;
  const shape = source ? detailSourceShape(body) : (cache?.shape(body) ?? createShape(body)),
    edges = shapeEdges(shape);
  let result: AnyShape | undefined;
  try {
    if (!indices.length || indices.some((i) => !Number.isInteger(i) || i < 0 || i >= edges.length))
      throw new Error('Valitse vähintään yksi kappaleen reuna.');
    const eligible = detailEdgeIndices(shape, edges);
    const selected = [...new Set(indices)].filter((index) => eligible.has(index));
    if (!selected.length)
      throw new Error(
        'Valitse taitosreuna. Sileän pinnan saumassa ei ole pyöristettävää tai viistettävää kulmaa.',
      );
    const chosen = selected.map((i) => edges[i]);
    try {
      // The exact edges are already known. Do not enumerate/filter every edge again.
      const oc = getOC();
      const builder =
        operation === 'fillet'
          ? new oc.BRepFilletAPI_MakeFillet(shape.wrapped, oc.ChFi3d_FilletShape.ChFi3d_Rational)
          : new oc.BRepFilletAPI_MakeChamfer(shape.wrapped);
      try {
        chosen.forEach((edge) => builder.Add(size, edge.wrapped));
        const raw = builder.Shape();
        try {
          result = cast(raw);
        } finally {
          raw.delete();
        }
      } finally {
        builder.delete();
      }
      if (!shapeIsValid(result)) {
        result.delete();
        result = undefined;
      }
    } catch {
      result?.delete();
      result = undefined;
      // Exact prismatic limit below; never silently reduce the radius.
    }
    if (!result && operation === 'fillet') result = filletPrism(shape, chosen, size);
    if (!result) throw new Error('Reunakäsittely epäonnistui.');
    if (!shapeIsValid(result)) throw new Error('Reunakäsittely ei muodosta ehjää kappaletta.');
    const next = bodyFromShape(body, result);
    if (!featureIsSolid(next.feature))
      throw new Error('Reunakäsittely kadottaisi kappaleen tilavuuden.');
    next.edgeTreatment = {
      id: source?.id ?? uid(),
      source: source?.source ?? body.feature,
      offset: sub(add(body.origin, source?.offset ?? [0, 0, 0]), next.origin),
      rotation: source?.rotation ?? [0, 0, 0, 1],
      indices: selected,
      operation,
      size,
    };
    const mesh = meshBody(next, result);
    cache?.prepare(next, result, mesh);
    return { body: next, mesh };
  } catch (error) {
    if (error instanceof Error && /Valitse/.test(error.message)) throw error;
    throw new Error(
      `${operation === 'fillet' ? 'Pyöristystä' : 'Viistettä'} ei voi tehdä näillä reunoilla ja tällä mitalla. Pienennä mittaa tai valitse vähemmän reunoja. Alkuperäinen osa säilyi.`,
    );
  } finally {
    result?.delete();
    edges.forEach((edge) => edge.delete());
    shape.delete();
  }
}

export function removeEdgeTreatment(body: Body): Body {
  if (body.locked) throw new Error('Vapauta Hold ennen reunakäsittelyn poistamista.');
  if (!body.edgeTreatment) return body;
  const shape = detailSourceShape(body);
  try {
    return bodyFromShape(body, shape);
  } finally {
    shape.delete();
  }
}
