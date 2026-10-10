import { Quaternion, Vector3 } from 'three';
import { corners, type Body, type FaceRef, type Vec3 } from '../model/project';
import type { BodyMesh, CadEdge } from './protocol';
import { cadVertex } from './vertexReferences';

/** A rigid rotation preserves tessellation error and topology traversal order.
 * Rebuild ownership/face references when a primitive becomes a BRep. */
export function rotateMesh(
  mesh: BodyMesh,
  body: Body,
  pivot: Vec3,
  axis: Vec3,
  angle: number,
): BodyMesh {
  const q = new Quaternion().setFromAxisAngle(
    new Vector3(...axis).normalize(),
    (angle * Math.PI) / 180,
  );
  const origin = new Vector3(...pivot),
    boxCorners = corners(body);
  const point = (p: Vec3) =>
    new Vector3(...p).sub(origin).applyQuaternion(q).add(origin).toArray() as Vec3;
  const vertex = (p: Vec3) => cadVertex(body, p, boxCorners);
  const normal = (n: Vec3) => new Vector3(...n).applyQuaternion(q).toArray() as Vec3;
  const triples = (values: number[], fn: (p: Vec3) => Vec3) => {
    const out = new Array<number>(values.length);
    for (let i = 0; i < values.length; i += 3) {
      const p = fn([values[i], values[i + 1], values[i + 2]]);
      out[i] = p[0];
      out[i + 1] = p[1];
      out[i + 2] = p[2];
    }
    return out;
  };
  const refs = new Map(mesh.faces.map((f) => [f.ref, `surface:${f.index}` as FaceRef]));
  const edge = (e: CadEdge): CadEdge => {
    const start = point(e.start),
      end = point(e.end);
    return {
      ...e,
      start,
      end,
      from: vertex(start).anchor,
      to: vertex(end).anchor,
      circle: e.circle
        ? { ...e.circle, center: point(e.circle.center), normal: normal(e.circle.normal) }
        : undefined,
    };
  };
  return {
    ...mesh,
    id: body.id,
    vertices: triples(mesh.vertices, point),
    normals: triples(mesh.normals, normal),
    edges: triples(mesh.edges, point),
    faces: mesh.faces.map((f) => ({
      ...f,
      ref: refs.get(f.ref)!,
      center: point(f.center),
      normal: normal(f.normal),
    })),
    verticesCAD: mesh.verticesCAD.map((v) => vertex(point(v.point))),
    midpointsCAD: mesh.midpointsCAD.map(point),
    edgesCAD: mesh.edgesCAD.map(edge),
    curveEdges: mesh.curveEdges?.map(edge),
    boundaries: mesh.boundaries.map((b) => ({
      faces: b.faces.map((ref) => refs.get(ref)!) as [FaceRef, FaceRef],
      lines: triples(b.lines, point),
    })),
    detailEdges: mesh.detailEdges?.map((e) => ({ ...e, lines: triples(e.lines, point) })),
    sourceDetailEdges: mesh.sourceDetailEdges?.map((e) => ({
      ...e,
      lines: triples(e.lines, point),
    })),
  };
}
