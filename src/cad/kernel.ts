import {
  drawRectangle,
  draw,
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
import { bodySchema, corners, type Body, type FaceRef, type Vec3 } from '../model/project';
import type { BodyMesh, DrawingView, Projection, ProbeResult } from './protocol';

export function createShape(body: Body): AnyShape {
  bodySchema.parse(body);
  if (body.feature.type === 'union') {
    let result: Shape3D | undefined;
    try {
      for (const operand of body.feature.operands) {
        const part = createShape({
          ...body,
          feature: operand.feature,
          origin: operand.origin.map((n, i) => n + body.origin[i]) as Vec3,
        }).asShape3D();
        if (!result) result = part;
        else {
          const previous = result;
          try {
            result = previous.fuse(part);
          } finally {
            previous.delete();
            part.delete();
          }
        }
      }
      return result!;
    } catch (error) {
      result?.delete();
      throw error;
    }
  }
  const { width, depth, height } = body.feature;
  if (body.feature.type === 'polygon-extrusion') {
    const pen = draw(body.feature.points[0]);
    for (const point of body.feature.points.slice(1)) pen.lineTo(point);
    const sketch = pen.close().sketchOnPlane('XY') as Sketch;
    return (height ? sketch.extrude(height) : sketch.face()).translate(body.origin);
  }
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
  const faces = mesh.faceGroups.map((group, index) => {
    const vertex = mesh.triangles[group.start];
    const normal = mesh.normals.slice(vertex * 3, vertex * 3 + 3);
    const axis = normal.map(Math.abs).indexOf(Math.max(...normal.map(Math.abs)));
    const ref: FaceRef =
      body.feature.type !== 'rectangle-extrusion'
        ? `surface:${index}`
        : (`${['x', 'y', 'z'][axis]}:${normal[axis] >= 0 ? 'max' : 'min'}` as FaceRef);
    return { start: group.start, count: group.count, ref };
  });
  const verticesCAD: BodyMesh['verticesCAD'] = [];
  const midpointsCAD: Vec3[] = [];
  const seen = new Set<string>();
  const boxCorners = corners(body);
  const edges = shape.edges;
  try {
    for (const edge of edges) {
      const a = edge.startPoint,
        b = edge.endPoint;
      const start = a.toTuple(),
        end = b.toTuple();
      a.delete();
      b.delete();
      midpointsCAD.push(start.map((n, i) => (n + end[i]) / 2) as Vec3);
      for (const point of [start, end]) {
        const local = point.map((n, i) => n - body.origin[i]) as Vec3;
        const coordinateKey = local.map((n) => Math.round(n * 1e6) / 1e6).join(',');
        if (seen.has(coordinateKey)) continue;
        seen.add(coordinateKey);
        const corner = boxCorners.findIndex((p) =>
          p.every((n, i) => Math.abs(n - point[i]) < 1e-5),
        );
        let key =
          body.feature.type === 'rectangle-extrusion' && corner >= 0
            ? `corner:${corner}`
            : `vertex:${coordinateKey}`;
        if (body.feature.type === 'polygon-extrusion') {
          const index = body.feature.points.findIndex(
            (p) => Math.abs(p[0] - local[0]) < 1e-5 && Math.abs(p[1] - local[1]) < 1e-5,
          );
          if (index >= 0) key = `polygon:${index}:${Math.abs(local[2]) < 1e-5 ? 'bottom' : 'top'}`;
        }
        verticesCAD.push({ point, anchor: { bodyId: body.id, key, local } });
      }
    }
  } finally {
    edges.forEach((edge) => edge.delete());
  }
  return {
    id: body.id,
    vertices: mesh.vertices,
    triangles: mesh.triangles,
    normals: mesh.normals,
    edges: shape.meshEdges({ tolerance: 0.15 }).lines,
    faces,
    volume: body.feature.height ? measureVolume(shape.asShape3D()) : 0,
    verticesCAD,
    midpointsCAD,
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
