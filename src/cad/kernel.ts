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
  basicFaceExtrusion,
  Vector,
  makePolygon,
  type AnyShape,
  type Shape3D,
  type Sketch,
} from 'replicad';
import {
  bodySchema,
  corners,
  featureIsSolid,
  validatePlanarPolygon,
  uid,
  type Body,
  type FaceRef,
  type Vec3,
} from '../model/project';
import type { BodyMesh, DrawingView, Projection, ProbeResult } from './protocol';

export function createShape(body: Body): AnyShape {
  bodySchema.parse(body);
  if (body.feature.type === 'brep') {
    const shape = deserializeShape(body.feature.data);
    try {
      const box = shape.boundingBox;
      const [min, max] = box.bounds;
      box.delete();
      const sizes = [body.feature.width, body.feature.depth, body.feature.height];
      if (min.some((n) => Math.abs(n) > 1e-4) || max.some((n, i) => Math.abs(n - sizes[i]) > 1e-4))
        throw new Error('CAD-kappaleen mitat eivät vastaa tallennettua geometriaa.');
      const solids = shape.solids;
      const solid = solids.length > 0;
      solids.forEach((s) => s.delete());
      if (solid !== body.feature.solid)
        throw new Error('CAD-kappaleen tyyppi ei vastaa geometriaa.');
      return shape.translate(body.origin);
    } catch (error) {
      shape.delete();
      throw error;
    }
  }
  if (body.feature.type === 'planar-polygon') {
    validatePlanarPolygon(body.feature.points);
    return makePolygon(body.feature.points).translate(body.origin);
  }
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
  const cadFaces = shape.faces;
  const faces = mesh.faceGroups.map((group) => {
    const index = cadFaces.findIndex((f) => f.hashCode === group.faceId);
    if (index < 0) throw new Error('Pinnan topologiaa ei löytynyt.');
    const face = cadFaces[index],
      center = face.center;
    const vertex = mesh.triangles[group.start];
    const normal = mesh.normals.slice(vertex * 3, vertex * 3 + 3);
    const axis = normal.map(Math.abs).indexOf(Math.max(...normal.map(Math.abs)));
    const ref: FaceRef =
      body.feature.type !== 'rectangle-extrusion'
        ? `surface:${index}`
        : (`${['x', 'y', 'z'][axis]}:${normal[axis] >= 0 ? 'max' : 'min'}` as FaceRef);
    const result = {
      start: group.start,
      count: group.count,
      ref,
      index,
      normal: normal as Vec3,
      center: center.toTuple(),
      planar: face.geomType === 'PLANE',
    };
    center.delete();
    return result;
  });
  cadFaces.forEach((f) => f.delete());
  const verticesCAD: BodyMesh['verticesCAD'] = [];
  const midpointsCAD: Vec3[] = [];
  const edgesCAD: BodyMesh['edgesCAD'] = [];
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
        if (body.feature.type === 'planar-polygon')
          key = `point:${body.feature.points.findIndex((p) => p.every((n, i) => Math.abs(n - local[i]) < 1e-5))}`;
        if (body.feature.type === 'brep') key = `brep:${body.feature.topologyId}:${coordinateKey}`;
        verticesCAD.push({ point, anchor: { bodyId: body.id, key, local } });
      }
      if (edge.geomType === 'LINE') {
        const from = verticesCAD.find((v) =>
          v.point.every((n, i) => Math.abs(n - start[i]) < 1e-5),
        )?.anchor;
        const to = verticesCAD.find((v) =>
          v.point.every((n, i) => Math.abs(n - end[i]) < 1e-5),
        )?.anchor;
        if (from && to) edgesCAD.push({ start, end, from, to });
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
    volume: featureIsSolid(body.feature) ? measureVolume(shape.asShape3D()) : 0,
    verticesCAD,
    midpointsCAD,
    edgesCAD,
  };
}
export function pushPullFace(body: Body, ref: FaceRef, distance: number): Body {
  if (!Number.isFinite(distance) || Math.abs(distance) < 0.1 || Math.abs(distance) > 100000)
    throw new Error('Anna pinnan siirtymä väliltä −100 000…100 000 mm (vähintään 0,1 mm).');
  const shape = createShape(body);
  const faces = shape.faces;
  let prism: AnyShape | undefined, result: AnyShape | undefined;
  try {
    const target = meshBody(body, shape).faces.find((f) => f.ref === ref);
    if (!target || !target.planar) throw new Error('Valitse tasomainen pinta.');
    if (
      body.feature.type === 'polygon-extrusion' &&
      Math.abs(target.normal[2]) > 0.999 &&
      (body.feature.height > 0 || distance > 0)
    ) {
      const height = body.feature.height + distance;
      if (height < 0.1) throw new Error('Pursotus poistaisi koko kappaleen.');
      const origin = [...body.origin] as Vec3;
      if (target.normal[2] < 0) origin[2] -= distance;
      return bodySchema.parse({ ...body, origin, feature: { ...body.feature, height } });
    }
    // Keep a box parametric so its semantic corner anchors survive all six face edits.
    if (
      body.feature.type === 'rectangle-extrusion' &&
      ref.includes(':') &&
      !ref.startsWith('surface')
    ) {
      const i = ['x', 'y', 'z'].indexOf(ref[0]),
        key = (['width', 'depth', 'height'] as const)[i];
      const min = ref.endsWith('min');
      if (body.feature.height > 0 || (i === 2 && distance > 0)) {
        const size = body.feature[key] + distance;
        if (size < 0.1) throw new Error('Pursotus poistaisi koko kappaleen.');
        const origin = [...body.origin] as Vec3;
        if (min) origin[i] -= distance;
        return bodySchema.parse({ ...body, origin, feature: { ...body.feature, [key]: size } });
      }
    }
    const vector = new Vector(target.normal.map((n) => n * distance) as Vec3);
    try {
      prism = basicFaceExtrusion(faces[target.index], vector);
    } finally {
      vector.delete();
    }
    result = featureIsSolid(body.feature)
      ? distance > 0
        ? shape.asShape3D().fuse(prism.asShape3D())
        : shape.asShape3D().cut(prism.asShape3D())
      : prism.clone();
    if (!shapeIsValid(result) || measureVolume(result.asShape3D()) < 1e-7)
      throw new Error('Pursotus ei muodosta ehjää tilavuuskappaletta.');
    // Current tools create straight-edged planar solids: use CAD endpoints, not float32 display vertices.
    const resultEdges = result.edges,
      vertices: Vec3[] = [];
    try {
      for (const edge of resultEdges) {
        const a = edge.startPoint,
          b = edge.endPoint;
        vertices.push(a.toTuple(), b.toTuple());
        a.delete();
        b.delete();
      }
    } finally {
      resultEdges.forEach((e) => e.delete());
    }
    if (!vertices.length) throw new Error('Pursotus poistaisi koko kappaleen.');
    const origin = [0, 1, 2].map((i) => Math.min(...vertices.map((p) => p[i]))) as Vec3;
    const sizes = [0, 1, 2].map((i) => Math.max(...vertices.map((p) => p[i])) - origin[i]);
    result = result.translate(origin.map((n) => -n) as Vec3);
    return bodySchema.parse({
      ...body,
      origin,
      feature: {
        type: 'brep',
        width: sizes[0],
        depth: sizes[1],
        height: sizes[2],
        data: result.serialize(),
        solid: true,
        topologyId: uid(),
      },
    });
  } finally {
    result?.delete();
    prism?.delete();
    faces.forEach((f) => f.delete());
    shape.delete();
  }
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
