import { shapeEdges, shapeFaces } from './topology';
import type { AnyShape } from 'replicad';
import { corners, featureIsSolid, type Body, type Vec3 } from '../model/project';
import { sub } from '../model/geometry';

/** Shared with the snap mesh: reference identity must not depend on tessellation. */
export function cadVertex(body: Body, point: Vec3, boxCorners = corners(body)) {
  const local = sub(point, body.origin);
  const coordinateKey = local.map((n) => Math.round(n * 1e6) / 1e6).join(',');
  const corner = boxCorners.findIndex((p) => p.every((n, i) => Math.abs(n - point[i]) < 1e-5));
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
  return { point, anchor: { bodyId: body.id, key, local } };
}

/** Retain old vertex/curve-station references without triangulating the old solid. */
export function shapeVertexReferences(body: Body, shape: AnyShape) {
  const vertices = new Map<string, { key: string; point: Vec3 }>();
  const edges = shapeEdges(shape),
    boxCorners = corners(body);
  let curved = false;
  try {
    for (const edge of edges) {
      curved ||= edge.geomType !== 'LINE';
      for (const end of [edge.startPoint, edge.endPoint]) {
        const vertex = cadVertex(body, end.toTuple(), boxCorners);
        end.delete();
        vertices.set(vertex.anchor.key, { key: vertex.anchor.key, point: vertex.point });
      }
    }
  } finally {
    edges.forEach((edge) => edge.delete());
  }
  if (!featureIsSolid(body.feature) && (curved || body.curveSnaps)) {
    const faces = shapeFaces(shape),
      wires = shape.wires;
    try {
      if (faces.length <= 1 && wires.length === 1)
        for (const t of body.curveSnaps ?? [0, 0.25, 0.5, 0.75, 1]) {
          const p = wires[0].pointAt(t),
            point = p.toTuple();
          p.delete();
          if ([...vertices.values()].some((v) => Math.hypot(...sub(v.point, point)) < 1e-6))
            continue;
          const local = sub(point, body.origin);
          const key =
            body.feature.type === 'brep'
              ? `brep:${body.feature.topologyId}:${local.join(',')}`
              : `profile:${local.join(',')}`;
          vertices.set(key, { key, point });
        }
    } finally {
      faces.forEach((face) => face.delete());
      wires.forEach((wire) => wire.delete());
    }
  }
  return [...vertices.values()];
}
