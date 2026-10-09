import { beforeAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import init from 'replicad-opencascadejs';
import { setOC } from 'replicad';
import {
  makeBody,
  makeProfileBody,
  freshProject,
  parseProject,
  type Body,
  type Vec3,
} from '../model/project';
import { sketchFrame } from '../model/sketch';
import { throughPoints, sampleBezier } from '../model/bezier';
import { throughShapes, type ThroughShapesOptions } from './throughShapes';
import { bezierPath } from './modeling';
import { penPath } from './paths';
import { createShape, meshBody } from './kernel';
import { rotateBodies } from './transforms';
import { resolveAnchor } from '../model/guides';

beforeAll(
  async () =>
    setOC(
      await init({
        wasmBinary: readFileSync(new URL(import.meta.resolve('replicad-opencascadejs/wasm'))),
      }),
    ),
  30000,
);
const options: ThroughShapesOptions = {
  mode: 'sections',
  smooth: true,
  closeSides: false,
  solid: true,
  reverseIds: [],
  name: 'Loft',
};
const circle = (radius: number, z: number) =>
  makeProfileBody(
    { kind: 'circle', radius },
    sketchFrame([0, 0, z]),
    0,
    `R${radius}`,
    'construction',
  );
const mesh = (body: Body) => {
  const shape = createShape(body);
  try {
    return meshBody(body, shape);
  } finally {
    shape.delete();
  }
};

it('interpolates each clicked point, supports two-point lines and closes smoothly', () => {
  const pts: Vec3[] = [
    [0, 0, 0],
    [50, 20, 10],
    [60, 80, 30],
    [200, 100, 0],
  ];
  const controls = throughPoints(pts);
  expect(controls.filter((_, i) => i % 3 === 0)).toEqual(pts);
  expect(sampleBezier(throughPoints(pts.slice(0, 2)), 2)[1]).toEqual([25, 10, 5]);
  const closed = throughPoints(pts, true);
  expect(closed.at(-1)).toEqual(pts[0]);
  const curve = bezierPath(pts, 'Fit', false, 'smooth');
  expect(mesh(curve).faces).toHaveLength(0);
  expect(curve.curve?.mode).toBe('smooth');
});

it('outline circles have no face, exact quadrant anchors and curved reference edges', () => {
  const c = circle(48, -100),
    data = mesh(c);
  expect(data.faces).toHaveLength(0);
  for (const p of [
    [48, 0, -100],
    [0, 48, -100],
    [-48, 0, -100],
    [0, -48, -100],
  ])
    expect(
      data.verticesCAD.some((v) => Math.hypot(...v.point.map((n, i) => n - p[i])) < 1e-6),
    ).toBe(true);
  expect(data.curveEdges!.length).toBeGreaterThan(16);
  const custom = { ...c, curveSnaps: [0, 0.125, 0.25, 0.5, 0.75] };
  expect(
    mesh(custom).verticesCAD.some(
      (v) =>
        Math.abs(Math.abs(v.point[0]) - 48 / Math.SQRT2) < 1e-6 &&
        Math.abs(Math.abs(v.point[1]) - 48 / Math.SQRT2) < 1e-6,
    ),
  ).toBe(true);
  expect(parseProject(JSON.stringify({ ...freshProject(), bodies: [custom] })).bodies[0]).toEqual(
    custom,
  );
});

it('two circular wires make an exact conical solid and do not modify locked inputs', () => {
  const profiles = [{ ...circle(50, 0), locked: true }, circle(20, 200)],
    before = JSON.stringify(profiles);
  const result = throughShapes(profiles, options);
  expect(result.mesh.volume).toBeCloseTo(((Math.PI * 200) / 3) * (50 ** 2 + 50 * 20 + 20 ** 2), 2);
  expect(JSON.stringify(profiles)).toBe(before);
  const saved = parseProject(JSON.stringify({ ...freshProject(), bodies: [result.body] }))
    .bodies[0];
  expect(mesh(saved).volume).toBeCloseTo(result.mesh.volume, 4);
});

it('a single tilted circular section can end at a pointed cone in either direction', () => {
  const base = makeProfileBody(
    { kind: 'circle', radius: 40 },
    sketchFrame([100, -50, 30], [0, 1, 0]),
    0,
    'Base',
    'construction',
  );
  for (const height of [180, -180]) {
    const result = throughShapes([base], { ...options, tipHeight: height });
    expect(result.mesh.volume).toBeCloseTo((Math.PI * 40 ** 2 * 180) / 3, 3);
    expect(result.body.feature.depth).toBeCloseTo(180, 5);
  }
  expect(() => throughShapes([base], { ...options, tipHeight: 0 })).toThrow('etäisyydeksi');
});

it('lofts mixed closed sections and open straight/curved profiles into real CAD surfaces', () => {
  const rectangle = makeProfileBody(
    { kind: 'rectangle', width: 80, depth: 80 },
    sketchFrame([-40, -40, 0]),
  );
  expect(throughShapes([rectangle, circle(25, 100)], options).mesh.volume).toBeGreaterThan(0);
  const straight = penPath(
    [
      [0, 0, 0],
      [0, 0, 200],
    ],
    'Line',
  );
  const curved = bezierPath(
    [
      [80, 0, 0],
      [100, 30, 100],
      [80, 0, 200],
    ],
    'Curve',
    false,
    'smooth',
  );
  const result = throughShapes([straight, curved], { ...options, mode: 'sides', solid: false });
  expect(result.mesh.triangles.length).toBeGreaterThan(6);
  expect(result.body.feature.type === 'brep' && result.body.feature.solid).toBe(false);
});

it('four bottle side profiles form a closed surrounding skin, with optional end caps', () => {
  const profiles = [0, 1, 2, 3].map((i) => {
    const angle = (i * Math.PI) / 2;
    return bezierPath(
      [
        [50, 0],
        [58, 80],
        [42, 160],
        [25, 220],
      ].map(([r, z]) => [r * Math.cos(angle), r * Math.sin(angle), z] as Vec3),
      `Side ${i}`,
      false,
      'smooth',
    );
  });
  const skin = throughShapes(profiles, {
    ...options,
    mode: 'sides',
    closeSides: true,
    solid: false,
  });
  expect(skin.mesh.triangles.length).toBeGreaterThan(100);
  const solid = throughShapes(profiles, { ...options, mode: 'sides', closeSides: true });
  expect(solid.mesh.volume).toBeGreaterThan(500000);
});

it('rotation preserves editable curve points and additional snap stations', () => {
  const curve = {
    ...bezierPath(
      [
        [0, 0, 0],
        [50, 30, 0],
        [100, 0, 0],
      ],
      'Curve',
      false,
      'smooth',
    ),
    curveSnaps: [0, 0.125, 0.5, 1],
  };
  const rotated = rotateBodies([curve], [0, 0, 0], [0, 0, 1], 90)[0];
  expect(rotated.curveSnaps).toEqual(curve.curveSnaps);
  rotated.curve!.points[1].forEach((n, i) =>
    expect(n + rotated.origin[i]).toBeCloseTo([-30, 50, 0][i], 8),
  );
  for (const v of mesh(rotated).verticesCAD)
    expect(resolveAnchor([rotated], v.anchor)).toEqual(v.point);
});

it('rejects solids, duplicate inputs and incompatible open/closed profiles', () => {
  expect(() => throughShapes([circle(50, 0), makeBody(100, 100, 100)], options)).toThrow(
    'Tilavuuskappale',
  );
  const c = circle(50, 0);
  expect(() => throughShapes([c, c], options)).toThrow('erillistä');
  expect(() =>
    throughShapes(
      [
        c,
        penPath(
          [
            [0, 0, 50],
            [50, 0, 50],
          ],
          'Line',
        ),
      ],
      options,
    ),
  ).toThrow('avoimia');
});
