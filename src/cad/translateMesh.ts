import type { BodyMesh } from './protocol';
import type { Vec3, VertexAnchor } from '../model/project';

/** Repeated CAD parts share topology. Positions and anchor ownership remain per-part. */
export function translateMesh(mesh: BodyMesh, id: string, delta: Vec3): BodyMesh {
  const point = (p: Vec3) => p.map((n, i) => n + delta[i]) as Vec3;
  const positions = (values: number[]) => values.map((n, i) => n + delta[i % 3]);
  const anchor = (a: VertexAnchor) => ({ ...a, bodyId: id });
  return {
    ...mesh,
    id,
    vertices: positions(mesh.vertices),
    edges: positions(mesh.edges),
    faces: mesh.faces.map((face) => ({ ...face, center: point(face.center) })),
    verticesCAD: mesh.verticesCAD.map((v) => ({ point: point(v.point), anchor: anchor(v.anchor) })),
    midpointsCAD: mesh.midpointsCAD.map(point),
    edgesCAD: mesh.edgesCAD.map((edge) => ({
      ...edge,
      start: point(edge.start),
      end: point(edge.end),
      from: anchor(edge.from),
      to: anchor(edge.to),
    })),
    curveEdges: mesh.curveEdges?.map((edge) => ({
      ...edge,
      circle: edge.circle ? { ...edge.circle, center: point(edge.circle.center) } : undefined,
      start: point(edge.start),
      end: point(edge.end),
      from: anchor(edge.from),
      to: anchor(edge.to),
    })),
    boundaries: mesh.boundaries.map((boundary) => ({
      ...boundary,
      lines: positions(boundary.lines),
    })),
    sourceDetailEdges: mesh.sourceDetailEdges?.map((edge) => ({
      ...edge,
      lines: positions(edge.lines),
    })),
    detailEdges: mesh.detailEdges?.map((edge) => ({ ...edge, lines: positions(edge.lines) })),
  };
}
