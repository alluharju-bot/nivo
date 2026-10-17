import { exportSTEP, importSTEP, type AnyShape } from 'replicad';
import { bodyFromShape, createShape, shapeIsValid, meshBody } from './kernel';
import { meshBody as importedMesh } from '../exchange/mesh';
import { makeBody, type Body } from '../model/project';

export function surfaceMesh(body: Body, tolerance: number, angle: number) {
  if (
    !Number.isFinite(tolerance) ||
    tolerance < 0.02 ||
    tolerance > 20 ||
    !Number.isFinite(angle) ||
    angle < 0.05 ||
    angle > 1
  )
    throw new Error('Verkkotarkkuus ei ole sallituissa rajoissa.');
  if (body.feature.type === 'mesh') return importedMesh(body);
  const shape = createShape(body);
  try {
    return meshBody(body, shape, shape.mesh({ tolerance, angularTolerance: angle }));
  } finally {
    shape.delete();
  }
}

export async function readStep(data: ArrayBuffer, name: string): Promise<Body[]> {
  const shape = await importSTEP(new Blob([data]));
  const solids: AnyShape[] = [];
  try {
    if (!shapeIsValid(shape)) throw new Error('STEP-tiedostosta ei syntynyt ehjää geometriaa.');
    solids.push(...shape.solids);
    const parts = solids.length ? solids : [shape];
    if (parts.length > 10000) throw new Error('STEP sisältää yli 10 000 osaa.');
    return parts.map((part, index) =>
      bodyFromShape(
        makeBody(1, 1, 1, [0, 0, 0], parts.length === 1 ? name : `${name} ${index + 1}`),
        part,
        [],
      ),
    );
  } finally {
    solids.forEach((s) => s.delete());
    shape.delete();
  }
}
export async function writeStep(bodies: Body[]): Promise<Blob> {
  const shapes: AnyShape[] = [];
  try {
    for (const body of bodies) shapes.push(createShape(body));
    return exportSTEP(
      shapes.map((shape, i) => ({ shape, name: bodies[i].name, color: bodies[i].color })),
      { unit: 'MM', modelUnit: 'MM' },
    );
  } finally {
    shapes.forEach((s) => s.delete());
  }
}

export function printMeshes(
  bodies: Body[],
  tolerance: number,
): import('../exchange/export').ExportMesh[] {
  if (![0.02, 0.05, 0.15].includes(tolerance)) throw new Error('Valitse viennin tarkkuus.');
  return bodies.map((body) => {
    const shape = createShape(body);
    try {
      const mesh = shape.mesh({ tolerance, angularTolerance: tolerance === 0.15 ? 0.1 : 0.05 });
      return { id: body.id, vertices: mesh.vertices, triangles: mesh.triangles };
    } finally {
      shape.delete();
    }
  });
}
