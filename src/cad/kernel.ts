import {
  drawRectangle,
  deserializeShape,
  drawProjection,
  ProjectionCamera,
  getOC,
  makeBox,
  makeCompound,
  measureVolume,
  type AnyShape,
  type Shape3D,
  type Sketch,
} from 'replicad';
import { bodySchema, type Body, type FaceRef } from '../model/project';
import type { BodyMesh, DrawingView, Projection, ProbeResult } from './protocol';

export function createShape(body: Body): AnyShape {
  bodySchema.parse(body);
  const { width, depth, height } = body.feature;
  const sketch = drawRectangle(width, depth).sketchOnPlane('XY') as Sketch;
  const shape = height ? sketch.extrude(height) : sketch.face();
  return shape.translate([body.origin[0] + width / 2, body.origin[1] + depth / 2, body.origin[2]]);
}
export function shapeIsValid(shape: AnyShape): boolean {
  const check = new (getOC().BRepCheck_Analyzer)(shape.wrapped, true);
  try {
    return check.IsValid();
  } finally {
    check.delete();
  }
}
export function meshBody(body: Body, shape: AnyShape): BodyMesh {
  if (!shapeIsValid(shape)) throw new Error('Geometriasta ei syntynyt ehjää kappaletta.');
  const mesh = shape.mesh({ tolerance: 0.15, angularTolerance: 0.1 });
  const faces = mesh.faceGroups.map((group) => {
    const vertex = mesh.triangles[group.start];
    const normal = mesh.normals.slice(vertex * 3, vertex * 3 + 3);
    const axis = normal.map(Math.abs).indexOf(Math.max(...normal.map(Math.abs)));
    const ref = `${['x', 'y', 'z'][axis]}:${normal[axis] >= 0 ? 'max' : 'min'}` as FaceRef;
    return { start: group.start, count: group.count, ref };
  });
  return {
    id: body.id,
    vertices: mesh.vertices,
    triangles: mesh.triangles,
    normals: mesh.normals,
    edges: shape.meshEdges({ tolerance: 0.15 }).lines,
    faces,
    volume: body.feature.height ? measureVolume(shape.asShape3D()) : 0,
  };
}
export function projectShapes(shapes: AnyShape[], view: DrawingView): Projection {
  if (!shapes.length) return { visible: [], hidden: [], viewBox: [0, 0, 1, 1] };
  // Replicad's compound builder takes ownership of its input wrappers.
  const compound = makeCompound(shapes.map((shape) => shape.clone()));
  const camera =
    view === 'front'
      ? new ProjectionCamera([0, 0, 0], [0, -1, 0], [1, 0, 0])
      : view === 'right'
        ? new ProjectionCamera([0, 0, 0], [1, 0, 0], [0, 1, 0])
        : new ProjectionCamera([0, 0, 0], [0, 0, 1], [1, 0, 0]);
  try {
    const { visible, hidden } = drawProjection(compound, camera);
    const viewBox = visible.toSVGViewBox(0).split(/\s+/).map(Number) as Projection['viewBox'];
    if (viewBox.length !== 4 || !viewBox.every(Number.isFinite))
      throw new Error('Mittakuvan projektio epäonnistui.');
    return { visible: visible.toSVGPaths().flat(), hidden: hidden.toSVGPaths().flat(), viewBox };
  } finally {
    compound.delete();
    camera.delete();
  }
}
export function runProbe(): ProbeResult {
  const started = performance.now();
  const held: AnyShape[] = [];
  const keep = <T extends AnyShape>(shape: T): T => {
    held.push(shape);
    return shape;
  };
  try {
    const box = keep(drawRectangle(600, 400).sketchOnPlane('XY').extrude(18).asShape3D());
    const cutter = keep(makeBox([-50, -50, -1], [50, 50, 20]));
    const cut = keep(box.clone().cut(cutter.clone()));
    const fillet = keep(box.clone().fillet(2));
    const restored = keep(deserializeShape(box.serialize()));
    const front = projectShapes([box], 'front');
    const mesh = meshBody(
      {
        id: 'probe',
        name: 'Probe',
        kind: 'cad',
        color: '#ffffff',
        origin: [-300, -200, 0],
        feature: { type: 'rectangle-extrusion', width: 600, depth: 400, height: 18 },
      },
      box,
    );
    return {
      boxVolume: measureVolume(box),
      cutVolume: measureVolume(cut),
      filletVolume: measureVolume(fillet),
      restoredVolume: measureVolume(restored as Shape3D),
      valid: held.every(shapeIsValid),
      faceCount: new Set(mesh.faces.map((f) => f.ref)).size,
      frontPaths: front.visible.length,
      elapsedMs: performance.now() - started,
    };
  } finally {
    held.reverse().forEach((shape) => shape.delete());
  }
}
