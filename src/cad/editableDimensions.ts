import {
  editableDimensions,
  resizePrimitive,
  type DimensionKey,
} from '../model/editableDimensions';
import { type Body } from '../model/project';
import { createShape, meshBody, pushPullFace, shapeIsValid } from './kernel';
import { detailEdges } from './details';
import { primitiveFaceMaterials } from './faceMaterials';
import { preservePrimitiveReferences } from './vertexReferences';

export function changeDimension(body: Body, key: DimensionKey, value: number): Body {
  if (body.locked) throw new Error('Vapauta osan lukitus ennen mitan muuttamista.');
  const field = editableDimensions(body).find((d) => d.key === key);
  if (
    !field ||
    !Number.isFinite(value) ||
    Math.abs(value) > 100000 ||
    (!field.signed && value < 0) ||
    (Math.abs(value) < 0.1 && !(field.zero && value === 0))
  )
    throw new Error('Tälle mitalle ei voi käyttää annettua arvoa.');
  if (Math.abs(field.value - value) < 1e-8) return body;
  if (key === 'detail' && body.edgeTreatment)
    return detailEdges(body, body.edgeTreatment.indices, body.edgeTreatment.operation, value, true)
      .body;
  const primitive = resizePrimitive(body, key, value);
  if (primitive) {
    const shape = createShape(primitive);
    try {
      if (!shapeIsValid(shape)) throw new Error('Mitoista ei muodostu ehjää osaa.');
      // Topology is unchanged within a solid. A surface becoming solid needs face mapping.
      const previous = createShape(body);
      try {
        primitive.faceMaterials = primitiveFaceMaterials(body, primitive, previous, shape);
        return preservePrimitiveReferences(body, primitive, previous);
      } finally {
        previous.delete();
      }
    } finally {
      shape.delete();
    }
  }
  const axis = ['width', 'depth', 'height'].indexOf(key);
  if (axis < 0) throw new Error('Tämän osan mittaa ei voi muuttaa suoraan.');
  const shape = createShape(body);
  try {
    const mesh = meshBody(body, shape);
    const end = body.origin[axis] + field.value;
    const candidates = mesh.faces.filter(
      (f) => f.planar && f.normal[axis] > 1 - 1e-8 && Math.abs(f.center[axis] - end) < 1e-5,
    );
    if (candidates.length !== 1)
      throw new Error(
        'Ulkomitalla ei ole yksiselitteistä päätypintaa. Valitse muokattava pinta Push/Pullilla tai reuna geometriavalinnalla.',
      );
    const next = pushPullFace(body, candidates[0].ref, value - field.value);
    if (
      Math.abs(next.feature[(['width', 'depth', 'height'] as const)[axis]] - value) > 1e-4 ||
      Math.abs(next.origin[axis] - body.origin[axis]) > 1e-4
    )
      throw new Error('Pinnan muutos ei toteuta annettua kokonaismittaa. Alkuperäinen osa säilyi.');
    return next;
  } finally {
    shape.delete();
  }
}
