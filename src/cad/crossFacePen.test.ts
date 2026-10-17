import { beforeAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import init from 'replicad-opencascadejs';
import { setOC } from 'replicad';
import { makeBody, type Body, type Vec3 } from '../model/project';
import { createShape, meshBody, shapeIsValid, solidVolume, pushPullFace } from './kernel';
import { penPath, splitWithPath } from './paths';
import { prepareGeometry, commitGeometry } from './geometryEditing';

beforeAll(
  async () =>
    setOC(
      await init({
        wasmBinary: readFileSync(new URL(import.meta.resolve('replicad-opencascadejs/wasm'))),
      }),
    ),
  30000,
);

function inspect(body: Body) {
  const shape = createShape(body);
  try {
    expect(shapeIsValid(shape)).toBe(true);
    return { mesh: meshBody(body, shape), volume: solidVolume(shape) };
  } finally {
    shape.delete();
  }
}

it.each([false, true])(
  'divides across an existing diagonal in one stroke (reverse=%s)',
  (reverse) => {
    const initial = makeBody(200, 120, 40);
    const divided = splitWithPath(
      initial,
      'z:max',
      penPath(
        [
          [0, 0, 40],
          [200, 120, 40],
        ],
        'Diagonal',
      ),
    ).body;
    const before = inspect(divided);
    const path: Vec3[] = [
      [0, 30, 40],
      [200, 30, 40],
    ];
    if (reverse) path.reverse();
    const top = before.mesh.faces.filter((f) => f.normal[2] > 0.99);
    const result = splitWithPath(divided, top[reverse ? 1 : 0].ref, penPath(path, 'Crossing')).body;
    const after = inspect(result);
    const regions = after.mesh.faces.filter((f) => f.normal[2] > 0.99);
    expect(regions).toHaveLength(4);
    expect(
      after.mesh.verticesCAD.some(
        (v) => Math.hypot(v.point[0] - 50, v.point[1] - 30, v.point[2] - 40) < 1e-5,
      ),
    ).toBe(true);
    expect(after.volume).toBeCloseTo(before.volume, 5);
    const pulled = inspect(pushPullFace(result, regions[0].ref, -5));
    expect(pulled.volume).toBeLessThan(after.volume);
    expect(
      pulled.mesh.faces.filter((f) => f.normal[2] > 0.99 && Math.abs(f.center[2] - 40) < 1e-5),
    ).toHaveLength(3);
  },
);

it('does not project a stroke onto a different parallel surface', () => {
  const box = makeBody(200, 120, 40);
  const result = splitWithPath(
    box,
    'z:max',
    penPath(
      [
        [0, 30, 40],
        [200, 30, 40],
      ],
      'Top',
    ),
  ).body;
  const faces = inspect(result).mesh.faces;
  expect(faces.filter((f) => f.normal[2] > 0.99)).toHaveLength(2);
  expect(faces.filter((f) => f.normal[2] < -0.99)).toHaveLength(1);
});

it.each([false, true])(
  'crosses saved near-coplanar triangles without moving the surface (reverse=%s)',
  (reverse) => {
    const divided = splitWithPath(
      makeBody(200, 120, 40),
      'z:max',
      penPath(
        [
          [0, 0, 40],
          [200, 120, 40],
        ],
        'Diagonal',
      ),
    ).body;
    const g = prepareGeometry(divided);
    const body = commitGeometry(
      divided,
      g.points.map(([x, y, z]) => [x, y, x === 0 && y === 120 && z === 40 ? z + 4e-6 : z]),
    );
    const before = inspect(body),
      top = before.mesh.faces.filter((f) => f.normal[2] > 0.99);
    expect(top).toHaveLength(2);
    const points: Vec3[] = [
      [0, 30, 40 + 1e-6],
      [200, 30, 40],
    ];
    if (reverse) points.reverse();
    const result = splitWithPath(body, top[reverse ? 1 : 0].ref, penPath(points, 'Across'));
    const after = inspect(result.body);
    expect(after.mesh.faces.filter((f) => f.normal[2] > 0.99)).toHaveLength(4);
    expect(after.volume).toBeCloseTo(before.volume, 1);
  },
);
