import type { AnyShape } from 'replicad';
import { featureIsSolid, type Body } from '../model/project';
import { bodyFromShape, createShape, meshBody, shapeIsValid } from './kernel';
import type { EdgeDetailResult } from './protocol';

export function detailEdges(
  body: Body,
  indices: number[],
  operation: 'fillet' | 'chamfer',
  size: number,
): EdgeDetailResult {
  if (body.locked)
    throw new Error('Kappale on kiinnitetty. Vapauta Hold ennen reunojen muokkaamista.');
  if (!featureIsSolid(body.feature))
    throw new Error(
      'Anna osalle ensin paksuus. Viiste ja pyöristys tarvitsevat tilavuuskappaleen.',
    );
  if (!Number.isFinite(size) || size < 0.1 || size > 100000)
    throw new Error('Anna mitta väliltä 0,1–100 000 mm.');
  const shape = createShape(body),
    edges = shape.edges;
  let result: AnyShape | undefined;
  try {
    if (!indices.length || indices.some((i) => !Number.isInteger(i) || i < 0 || i >= edges.length))
      throw new Error('Valitse vähintään yksi kappaleen reuna.');
    const chosen = [...new Set(indices)].map((i) => edges[i]);
    const solid = shape.asShape3D();
    result =
      operation === 'fillet'
        ? solid.fillet(size, (finder) => finder.inList(chosen))
        : solid.chamfer(size, (finder) => finder.inList(chosen));
    if (!shapeIsValid(result)) throw new Error('Reunakäsittely ei muodosta ehjää kappaletta.');
    const next = bodyFromShape(body, result);
    if (!featureIsSolid(next.feature))
      throw new Error('Reunakäsittely kadottaisi kappaleen tilavuuden.');
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
