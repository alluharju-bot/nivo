import {
  BoxGeometry,
  CircleGeometry,
  ExtrudeGeometry,
  LatheGeometry,
  Path,
  Shape,
  ShapeGeometry,
  Vector2,
  Vector3,
} from 'three';
import {
  readGeometry,
  mirrorMesh,
  primitiveMesh,
  type SurfaceMesh,
  surfaceBody,
} from '../../src/surface/mesh';
import { makeBody, freshProject, type Project } from '../../src/model/project';
import { defaultAppearance } from '../../src/model/materials';

export function combineSurfaces(meshes: SurfaceMesh[]): SurfaceMesh {
  const result: SurfaceMesh = { positions: [], normals: [], indices: [], faces: [] };
  for (const mesh of meshes) {
    const offset = result.positions.length / 3;
    result.positions.push(...mesh.positions);
    result.normals.push(...mesh.normals);
    result.indices.push(...mesh.indices.map((i) => i + offset));
    result.faces.push(...mesh.faces);
  }
  return result;
}
function ring(segments = 24) {
  const shape = new Shape();
  shape.absarc(0, 0, 20, 0, Math.PI * 2, false);
  const hole = new Path();
  hole.absarc(0, 0, 19.2, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const geometry = new ExtrudeGeometry(shape, {
    depth: 20,
    bevelEnabled: false,
    curveSegments: segments,
  });
  const mesh = readGeometry(geometry);
  geometry.dispose();
  return mesh;
}
function recess(segments = 24) {
  const shape = new Shape();
  shape.moveTo(-25, -20);
  shape.lineTo(25, -20);
  shape.lineTo(25, 20);
  shape.lineTo(-25, 20);
  shape.closePath();
  const hole = new Path();
  hole.absarc(0, 0, 11, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const top = new ShapeGeometry(shape, segments);
  top.translate(0, 0, 10);
  const outer = new BoxGeometry(50, 40, 10);
  outer.translate(0, 0, 5);
  const shell = readGeometry(outer),
    ids: number[] = [];
  for (let t = 0; t < shell.indices.length; t += 3)
    if (shell.normals[shell.indices[t] * 3 + 2] < 0.5) ids.push(...shell.indices.slice(t, t + 3));
  shell.indices = ids;
  shell.faces = ids.filter((_, i) => i % 3 === 0).map(() => 0);
  const wall = new LatheGeometry(
    [new Vector2(10, 4), new Vector2(10, 9), new Vector2(10.3, 9.7), new Vector2(11, 10)],
    segments * 2,
  );
  wall.rotateX(Math.PI / 2);
  const inner = readGeometry(wall);
  inner.normals = inner.normals.map((n) => -n);
  inner.indices = inner.indices.map(
    (_, i) => inner.indices[i - (i % 3) + (i % 3 === 0 ? 0 : 3 - (i % 3))],
  );
  const bottom = new CircleGeometry(10, segments * 2);
  bottom.translate(0, 0, 4);
  const mesh = combineSurfaces([shell, readGeometry(top), inner, readGeometry(bottom)]);
  const triangles: number[] = [];
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const ids = mesh.indices.slice(t, t + 3),
      [a, b, c] = ids.map((i) => new Vector3().fromArray(mesh.positions, i * 3));
    if (b.sub(a).cross(c.sub(a)).lengthSq() > 1e-12) triangles.push(...ids);
  }
  mesh.indices = triangles;
  mesh.faces = new Array(triangles.length / 3).fill(0);
  for (const g of [top, outer, wall, bottom]) g.dispose();
  return mesh;
}
export function surfaceTestModels() {
  const geometry = new BoxGeometry(40, 30, 20, 2, 2, 2),
    materials = readGeometry(geometry);
  materials.faces = materials.faces.map((_, t) => Math.floor(t / 8));
  geometry.dispose();
  const asymmetric = primitiveMesh('sphere', 20, 20, 16);
  asymmetric.positions = asymmetric.positions.map((n, i) =>
    i % 3 === 0 ? n + 0.2 * asymmetric.positions[i - (i % 3) + 2] : n,
  );
  // Inverse-transpose of the x += .2z shear.
  for (let i = 0; i < asymmetric.normals.length; i += 3) {
    const n = new Vector3().fromArray(asymmetric.normals, i);
    n.z -= 0.2 * n.x;
    n.normalize().toArray(asymmetric.normals, i);
  }
  return [
    {
      id: 'thin-shell',
      name: 'Ohut rengas · seinämä 0,8 mm',
      mesh: ring(),
      purpose: 'Läheiset sisä- ja ulkoseinämät, maalaus ja bake-kohdistus.',
    },
    {
      id: 'recess',
      name: 'Syvennys · pyöristetty aukko',
      mesh: recess(),
      purpose: 'Syvät pinnat, kaarevat UV-saumat ja AO.',
    },
    {
      id: 'mirrored',
      name: 'Peilattu kaareva muoto',
      mesh: mirrorMesh(asymmetric, 0, 0, false),
      purpose: 'Peilauksen normaalit, tangenttisuunnat ja UV-saumat.',
    },
    {
      id: 'materials',
      name: 'Kuusi materiaalia',
      mesh: materials,
      purpose: 'Pintakohtaisten värien, metallisuuden ja karheuden säilyminen.',
    },
  ];
}
export function surfaceTestProject(): Project {
  const project = freshProject();
  project.name = 'Verkko ja pinta · kovennustestit';
  project.bodies = surfaceTestModels().map((fixture, i) => {
    const source = makeBody(1, 1, 1, [i * 75, 0, 0], fixture.name);
    source.color = '#8eabc1';
    if (fixture.id === 'materials')
      source.faceMaterials = Object.fromEntries(
        ['#e85a44', '#47a4c0', '#f1c347', '#9370bc', '#58a16a', '#e6e5df'].map((color, k) => [
          k,
          {
            color,
            appearance: { ...defaultAppearance('matte'), roughness: k / 5, metalness: k % 2 },
          },
        ]),
      );
    const body = surfaceBody(source, fixture.mesh);
    body.name = fixture.name;
    body.surfaceWorkflow = undefined;
    return body;
  });
  return project;
}
