import type { AnyShape } from 'replicad';
import { featureIsSolid, uid, type Body } from '../model/project';
import { bodyFromShape, createShape, meshBody, shapeIsValid } from './kernel';
import { add, sub } from '../model/geometry';
import { detailSourceShape } from './detailSource';
import type { EdgeDetailResult } from './protocol';
import { filletPrism } from './prismFillet';
import { detailEdgeIndices } from './detailEdges';

export function detailEdges(
  body: Body,
  indices: number[],
  operation: 'fillet' | 'chamfer',
  size: number,
  editing = false,
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
  const shape = source ? detailSourceShape(body) : createShape(body),
    edges = shape.edges;
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
    const solid = shape.asShape3D();
    try {
      result =
        operation === 'fillet'
          ? solid.fillet(size, (finder) => finder.inList(chosen))
          : solid.chamfer(size, (finder) => finder.inList(chosen));
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
    return { body: next, mesh: meshBody(next, result) };
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
