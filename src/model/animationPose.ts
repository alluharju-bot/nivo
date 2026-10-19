import { Matrix3, Matrix4, Vector3 } from 'three';
import type { BodyMesh, CadEdge } from '../cad/protocol';
import type { Body, Vec3, VertexAnchor } from './project';

/** CPU picking data only. Rendering keeps shared geometry and moves its matrices. */
export function animationPicking(
  bodies: Body[],
  meshes: BodyMesh[],
  matrices: Map<string, Matrix4>,
) {
  const changed = new Map<string, Body>();
  const byId = new Map(bodies.map((b) => [b.id, b]));
  const identity = new Matrix4();
  const posed = meshes.map((mesh) => {
    const matrix = matrices.get(mesh.id),
      source = byId.get(mesh.id);
    if (!matrix || !source || matrix.equals(identity)) return mesh;
    const normalMatrix = new Matrix3().getNormalMatrix(matrix);
    const point = (p: Vec3) => new Vector3(...p).applyMatrix4(matrix).toArray() as Vec3;
    const normal = (p: Vec3) =>
      new Vector3(...p).applyMatrix3(normalMatrix).normalize().toArray() as Vec3;
    const array = (values: number[], direction = false) => {
      const result: number[] = [];
      for (let i = 0; i < values.length; i += 3)
        result.push(...(direction ? normal : point)(values.slice(i, i + 3) as Vec3));
      return result;
    };
    const vertices = array(mesh.vertices),
      min: Vec3 = [Infinity, Infinity, Infinity],
      max: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < vertices.length; i++) {
      const axis = i % 3;
      min[axis] = Math.min(min[axis], vertices[i]);
      max[axis] = Math.max(max[axis], vertices[i]);
    }
    if (!vertices.length) return mesh;
    const anchor = (a: VertexAnchor, p: Vec3): VertexAnchor => ({
      ...a,
      local: p.map((v, i) => v - min[i]) as Vec3,
    });
    const edge = (e: CadEdge): CadEdge => {
      const start = point(e.start),
        end = point(e.end);
      return {
        ...e,
        start,
        end,
        from: anchor(e.from, start),
        to: anchor(e.to, end),
        circle: undefined,
      };
    };
    const normals = array(mesh.normals, true);
    changed.set(source.id, {
      ...source,
      origin: min,
      feature: {
        type: 'mesh',
        width: max[0] - min[0],
        depth: max[1] - min[1],
        height: max[2] - min[2],
        vertices: vertices.map((v, i) => v - min[i % 3]),
        triangles: mesh.triangles,
        normals,
        solid: true,
      },
    });
    return {
      ...mesh,
      vertices,
      normals,
      edges: array(mesh.edges),
      faces: mesh.faces.map((f) => ({
        ...f,
        center: point(f.center),
        normal: normal(f.normal),
        cylinder: undefined,
      })),
      verticesCAD: mesh.verticesCAD.map((v) => {
        const p = point(v.point);
        return { point: p, anchor: anchor(v.anchor, p) };
      }),
      midpointsCAD: mesh.midpointsCAD.map(point),
      edgesCAD: mesh.edgesCAD.map(edge),
      curveEdges: mesh.curveEdges?.map(edge),
      boundaries: mesh.boundaries.map((b) => ({ ...b, lines: array(b.lines) })),
    };
  });
  return { bodies: bodies.map((b) => changed.get(b.id) ?? b), meshes: posed };
}
