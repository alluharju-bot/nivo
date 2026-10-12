import { expect, it } from 'vitest';
import { BoxGeometry, Matrix4 } from 'three';
import { bodySchema, uid, parseProject, freshProject } from '../model/project';
import { around, meshBody, meshClosure, transformMesh } from './mesh';
import { stlBinary } from './export';
import { resolveAnchor } from '../model/guides';
function box() {
  const geometry = new BoxGeometry(40, 20, 10);
  geometry.translate(20, 10, 5);
  return bodySchema.parse({
    id: uid(),
    kind: 'cad',
    name: 'STL',
    origin: [100, 200, -20],
    color: '#ffffff',
    feature: {
      type: 'mesh',
      width: 40,
      depth: 20,
      height: 10,
      vertices: [...geometry.attributes.position.array],
      normals: [...geometry.attributes.normal.array],
      triangles: [...geometry.index!.array],
      solid: true,
    },
  });
}
it('retains imported mesh coordinates, snaps and validity through rotation, scale and serialization', () => {
  const body = box(),
    geometry = meshBody(body);
  expect(meshClosure(geometry.vertices, geometry.triangles).closed).toBe(true);
  expect(resolveAnchor([body], geometry.verticesCAD[0].anchor)).toEqual(
    geometry.verticesCAD[0].point,
  );
  const moved = transformMesh(body, around(body.origin, new Matrix4().makeRotationZ(Math.PI / 2)));
  expect(moved.feature.width).toBeCloseTo(20);
  expect(moved.feature.depth).toBeCloseTo(40);
  expect(moved.origin[0]).toBeCloseTo(80);
  const scaled = transformMesh(moved, around(moved.origin, new Matrix4().makeScale(2, 1, 1)));
  expect(scaled.feature.width).toBeCloseTo(40);
  const restored = parseProject(JSON.stringify({ ...freshProject(), bodies: [scaled] }));
  expect(restored.bodies[0].feature).toEqual(scaled.feature);
  expect(meshClosure(meshBody(scaled).vertices, meshBody(scaled).triangles).closed).toBe(true);
});
it('exports millimetre STL preserving relative positions and centers the common bottom on the bed', () => {
  const mesh = meshBody(box()),
    data = new DataView(stlBinary([mesh], true));
  expect(data.getUint32(80, true)).toBe(12);
  const values: number[][] = [[], [], []];
  for (let triangle = 0; triangle < 12; triangle++)
    for (let point = 0; point < 3; point++)
      for (let axis = 0; axis < 3; axis++)
        values[axis].push(data.getFloat32(84 + triangle * 50 + 12 + point * 12 + axis * 4, true));
  expect(values.map((v) => [Math.min(...v), Math.max(...v)])).toEqual([
    [-20, 20],
    [-10, 10],
    [0, 10],
  ]);
  expect(meshClosure(mesh.vertices, mesh.triangles.slice(3)).closed).toBe(false);
});
