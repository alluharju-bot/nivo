import { detailSourceShape } from './detailSource';
import {
  drawRectangle,
  drawCircle,
  drawEllipse,
  Plane,
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
import { add, sub, unit, dot, scale } from '../model/geometry';
import { faceBoundaries } from './boundaries';

export function exactBounds(shape: AnyShape): { min: Vec3; max: Vec3 } {
  const oc = getOC(),
    box = new oc.Bnd_Box();
  try {
    oc.BRepBndLib.AddOptimal(shape.wrapped, box, false, false);
    if (box.IsVoid()) throw new Error('Työstö poistaisi koko kappaleen.');
    const lo = box.CornerMin(),
      hi = box.CornerMax();
    try {
      return { min: [lo.X(), lo.Y(), lo.Z()], max: [hi.X(), hi.Y(), hi.Z()] };
    } finally {
      lo.delete();
      hi.delete();
    }
  } finally {
    box.delete();
  }
}

export function createShape(body: Body): AnyShape {
  bodySchema.parse(body);
  if (body.feature.type === 'brep') {
    const shape = deserializeShape(body.feature.data);
    try {
      const { min, max } = exactBounds(shape);
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
  if (body.feature.type === 'profile-extrusion') {
    const { profile, frame, distance } = body.feature;
    const plane = new Plane(add(body.origin, frame.origin), frame.u, frame.normal);
    try {
      let drawing;
      if (profile.kind === 'circle') drawing = drawCircle(profile.radius);
      else if (profile.kind === 'ellipse')
        drawing =
          profile.radiusX >= profile.radiusY
            ? drawEllipse(profile.radiusX, profile.radiusY)
            : drawEllipse(profile.radiusY, profile.radiusX).rotate(90);
      else if (profile.kind === 'rectangle')
        drawing = drawRectangle(profile.width, profile.depth).translate(
          profile.width / 2,
          profile.depth / 2,
        );
      else {
        const pen = draw(profile.points[0]);
        for (const p of profile.points.slice(1)) pen.lineTo(p);
        drawing = pen.close();
      }
      const sketch = drawing.sketchOnPlane(plane) as Sketch;
      return distance ? sketch.extrude(distance) : sketch.face();
    } finally {
      plane.delete();
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
    let normal = mesh.normals.slice(vertex * 3, vertex * 3 + 3) as Vec3;
    if (face.geomType === 'PLANE') {
      const exact = face.normalAt(),
        direction = unit(exact.toTuple());
      exact.delete();
      normal = dot(direction, normal) < 0 ? scale(direction, -1) : direction;
    }
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
  const detailEdges: NonNullable<BodyMesh['detailEdges']> = [];
  const seen = new Set<string>();
  const boxCorners = corners(body);
  const edges = shape.edges;
  try {
    for (const [index, edge] of edges.entries()) {
      detailEdges.push({ index, lines: edge.meshEdges({ tolerance: 0.15 }).lines });
      const a = edge.startPoint,
        b = edge.endPoint;
      const start = a.toTuple(),
        end = b.toTuple();
      a.delete();
      b.delete();
      if (edge.geomType === 'LINE')
        midpointsCAD.push(start.map((n, i) => (n + end[i]) / 2) as Vec3);
      else if (edge.geomType === 'CIRCLE' || edge.geomType === 'ELLIPSE') {
        const box = exactBounds(edge);
        midpointsCAD.push(box.min.map((n, i) => (n + box.max[i]) / 2) as Vec3);
      }
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
        if (body.feature.type === 'profile-extrusion') key = `profile:${coordinateKey}`;
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
    detailEdges,
    sourceDetailEdges: body.edgeTreatment
      ? (() => {
          const source = detailSourceShape(body),
            edges = source.edges;
          try {
            return edges.map((edge, index) => ({
              index,
              lines: edge.meshEdges({ tolerance: 0.15 }).lines,
            }));
          } finally {
            edges.forEach((edge) => edge.delete());
            source.delete();
          }
        })()
      : undefined,
    boundaries: faceBoundaries(shape, faces),
  };
}
/** Serialize exact geometry and retain only old vertex references that still exist. */
export function bodyFromShape(body: Body, shape: AnyShape, sources: Body[] = [body]): Body {
  if (!shapeIsValid(shape)) throw new Error('Työstö ei muodosta ehjää kappaletta.');
  const { min: origin, max } = exactBounds(shape),
    solids = shape.solids,
    solid = solids.length > 0;
  solids.forEach((s) => s.delete());
  if (solid && measureVolume(shape.asShape3D()) < 1e-7)
    throw new Error('Työstö poistaisi koko kappaleen.');
  const edges = shape.edges,
    points: Vec3[] = [],
    linearEdges: [Vec3, Vec3][] = [];
  try {
    for (const edge of edges) {
      const a = edge.startPoint,
        b = edge.endPoint;
      points.push(a.toTuple(), b.toTuple());
      if (edge.geomType === 'LINE')
        linearEdges.push([sub(a.toTuple(), origin), sub(b.toTuple(), origin)]);
      a.delete();
      b.delete();
    }
  } finally {
    edges.forEach((e) => e.delete());
  }
  const vertexRefs: Record<string, Vec3> = {};
  for (const source of sources) {
    const old = createShape(source);
    try {
      const candidates = [
        ...meshBody(source, old).verticesCAD.map((v) => ({ key: v.anchor.key, point: v.point })),
        ...Object.entries(source.vertexRefs ?? {}).map(([key, local]) => ({
          key,
          point: add(source.origin, local),
        })),
      ];
      for (const candidate of candidates) {
        const match = points.find((p) =>
          p.every((n, i) => Math.abs(n - candidate.point[i]) < 1e-5),
        );
        if (match)
          vertexRefs[source.id === body.id ? candidate.key : `${source.id}:${candidate.key}`] = sub(
            match,
            origin,
          );
      }
    } finally {
      old.delete();
    }
  }
  const local = shape.clone().translate(origin.map((n) => -n) as Vec3);
  try {
    return bodySchema.parse({
      ...body,
      origin,
      component: body.component
        ? { ...body.component, offset: sub(add(body.origin, body.component.offset), origin) }
        : undefined,
      edgeTreatment: undefined,
      textureFrame: {
        offset: sub(add(body.origin, body.textureFrame?.offset ?? [0, 0, 0]), origin),
        rotation: body.textureFrame?.rotation ?? [0, 0, 0, 1],
      },
      vertexRefs,
      linearEdges,
      feature: {
        type: 'brep',
        width: max[0] - origin[0],
        depth: max[1] - origin[1],
        height: max[2] - origin[2],
        data: local.serialize(),
        solid,
        topologyId: uid(),
      },
    });
  } finally {
    local.delete();
  }
}
export function pushPullFace(body: Body, ref: FaceRef, distance: number): Body {
  if (body.locked) throw new Error('Kappale on kiinnitetty. Vapauta se G-näppäimellä.');
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
      return bodySchema.parse({
        ...body,
        origin,
        component: body.component
          ? { ...body.component, offset: sub(add(body.origin, body.component.offset), origin) }
          : undefined,
        feature: { ...body.feature, height },
      });
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
        return bodySchema.parse({
          ...body,
          origin,
          component: body.component
            ? { ...body.component, offset: sub(add(body.origin, body.component.offset), origin) }
            : undefined,
          feature: { ...body.feature, [key]: size },
        });
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
    return bodyFromShape(body, result);
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
        purpose: 'model',
        locked: false,
        hidden: false,
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
