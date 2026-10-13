import { beforeAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import init from 'replicad-opencascadejs';
import { setOC } from 'replicad';
import { makeBody, makeProfileBody, parseProject, freshProject, type Body } from '../model/project';
import { bodyFromShape, createShape, meshBody, pushPullFace } from './kernel';
import { detailEdges, removeEdgeTreatment } from './details';
import { rotateBodies } from './transforms';
import { offsetFace, booleanBodies } from './operations';
import { CadBuildCache } from './buildCache';
import { defaultAppearance } from '../model/materials';
import { sketchFrame } from '../model/sketch';
import { asComponent, synchronizeComponents } from '../model/components';
import { instantiateComponents } from './components';

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
    return meshBody(body, shape);
  } finally {
    shape.delete();
  }
}

it.each(['fillet', 'chamfer'] as const)(
  'resizes the complete treated board end without leaving a %s rim',
  (operation) => {
    const original = makeBody(100, 80, 18, [30, 40, 50]);
    const all = Array.from({ length: 12 }, (_, i) => i);
    const rounded = detailEdges(original, all, operation, 2);
    for (const axis of [0, 1, 2])
      for (const sign of [-1, 1])
        for (const distance of [-5, 10]) {
          const face = rounded.mesh.faces.find((f) => f.planar && f.normal[axis] * sign > 0.999)!;
          const result = pushPullFace(rounded.body, face.ref, distance);
          const sizeKey = (['width', 'depth', 'height'] as const)[axis];
          const origin = [...original.origin] as Body['origin'];
          if (sign < 0) origin[axis] -= distance;
          const expected = detailEdges(
            {
              ...original,
              origin,
              feature: { ...original.feature, [sizeKey]: original.feature[sizeKey] + distance },
            },
            all,
            operation,
            2,
          );
          expect(inspect(result).volume).toBeCloseTo(expected.mesh.volume, 3);
          expect(inspect(result).faces).toHaveLength(expected.mesh.faces.length);
          expect(result.edgeTreatment?.size).toBe(2);
        }
  },
  30000,
);

it(
  'retains an end finish, stock dimensions, source edges and cache after rotated BRep resizing and reopening',
  { timeout: 30000 },
  () => {
    const base = makeBody(120, 80, 18);
    const shape = createShape(base);
    const brep = bodyFromShape(base, shape);
    shape.delete();
    const rounded = detailEdges(brep, [0, 1, 2], 'fillet', 2).body;
    const face = inspect(rounded).faces.find((f) => f.planar && f.normal[0] > 0.99)!;
    rounded.faceMaterials = {
      [face.index]: { color: '#ab6543', appearance: defaultAppearance('walnut') },
    };
    const rotated = rotateBodies([rounded], [10, 20, 30], [1, 2, 3], 37)[0];
    const target = inspect(rotated).faces.find((f) => f.index === face.index)!;
    const cache = new CadBuildCache();
    try {
      const result = pushPullFace(rotated, target.ref, 25, cache);
      const restored = JSON.parse(JSON.stringify(result)) as Body;
      const mesh = cache.build([restored])[0].mesh;
      expect(mesh.stock?.dimensions).toEqual([145, 80, 18]);
      expect(mesh.faces).toHaveLength(inspect(rotated).faces.length);
      expect(Object.values(restored.faceMaterials ?? {})).toContainEqual({
        color: '#ab6543',
        appearance: defaultAppearance('walnut'),
      });
      const secondTarget = mesh.faces.find(
        (f) => f.planar && f.normal.every((n, i) => Math.abs(n - target.normal[i]) < 1e-6),
      )!;
      const second = pushPullFace(restored, secondTarget.ref, -15, cache);
      expect(inspect(second).stock?.dimensions).toEqual([130, 80, 18]);
      expect(
        detailEdges(second, second.edgeTreatment!.indices, 'fillet', 1, true).mesh.volume,
      ).toBeGreaterThan(inspect(second).volume);
    } finally {
      cache.dispose();
    }
  },
);

it(
  'still makes a local pocket in an explicitly inset treated face and protects the source on failure',
  { timeout: 30000 },
  () => {
    const rounded = detailEdges(
      makeBody(100, 80, 18),
      Array.from({ length: 12 }, (_, i) => i),
      'fillet',
      2,
    );
    const top = rounded.mesh.faces.find((f) => f.planar && f.normal[2] > 0.99)!;
    const inset = offsetFace(rounded.body, top.ref, 10);
    const pocket = pushPullFace(inset.body, inset.face, -5);
    expect(pocket.feature.height).toBeCloseTo(18, 5);
    expect(inspect(pocket).volume).toBeLessThan(rounded.mesh.volume);
    const before = JSON.stringify(rounded.body);
    expect(() => pushPullFace({ ...rounded.body, locked: true }, top.ref, -2)).toThrow(
      'kiinnitetty',
    );
    expect(() => pushPullFace(rounded.body, top.ref, -17)).toThrow();
    expect(JSON.stringify(rounded.body)).toBe(before);
  },
);

it(
  'moves painted roundovers with the end while preserving stationary curved finishes',
  { timeout: 30000 },
  () => {
    const rounded = detailEdges(
      makeBody(100, 80, 18),
      Array.from({ length: 12 }, (_, i) => i),
      'fillet',
      2,
    );
    const top = rounded.mesh.faces.find((f) => f.planar && f.normal[2] > 0.99)!;
    const curved = (upper: boolean) =>
      rounded.mesh.faces.find(
        (f) =>
          !f.planar &&
          Array.from({ length: f.count }, (_, i) => rounded.mesh.triangles[f.start + i]).every(
            (v) =>
              upper
                ? rounded.mesh.vertices[v * 3 + 2] >= 16 - 1e-5
                : rounded.mesh.vertices[v * 3 + 2] <= 2 + 1e-5,
          ),
      )!;
    const up = curved(true),
      down = curved(false);
    expect(up).toBeDefined();
    expect(down).toBeDefined();
    const body = {
      ...rounded.body,
      faceMaterials: {
        [up.index]: { color: '#123456', appearance: defaultAppearance('paint-solid') },
        [down.index]: { color: '#abcdef', appearance: defaultAppearance('paint-solid') },
      },
    };
    const result = pushPullFace(body, top.ref, 10);
    const mesh = inspect(result);
    for (const [color, upper] of [
      ['#123456', true],
      ['#abcdef', false],
    ] as const) {
      const painted = mesh.faces.filter((f) => result.faceMaterials?.[f.index]?.color === color);
      expect(painted.length).toBeGreaterThan(0);
      for (const f of painted) {
        expect(f.planar).toBe(false);
        expect(upper ? f.center[2] > 26 : f.center[2] < 2).toBe(true);
      }
    }
  },
);

it(
  'preserves curved boundaries and through-holes when moving a treated end',
  { timeout: 30000 },
  () => {
    const cylinder = makeProfileBody({ kind: 'circle', radius: 30 }, sketchFrame([0, 0, 0]), 60);
    const perforated = booleanBodies(
      [makeBody(100, 80, 18)],
      [makeProfileBody({ kind: 'circle', radius: 5 }, sketchFrame([50, 40, 0]), 18)],
      'cut',
    )[0];
    for (const base of [cylinder, perforated]) {
      const indices = inspect(base)
        .detailEdges!.filter((e) => base === cylinder || e.lines.length === 6)
        .map((e) => e.index);
      const detailed = detailEdges(base, indices, 'fillet', 2);
      const top = detailed.mesh.faces.find((f) => f.planar && f.normal[2] > 0.99)!;
      const result = pushPullFace(detailed.body, top.ref, 10);
      expect(result.feature.height).toBeCloseTo(base.feature.height + 10, 5);
      expect(inspect(result).faces).toHaveLength(detailed.mesh.faces.length);
      const cap = inspect(result).faces.find((f) => f.planar && f.normal[2] > 0.99)!;
      const restored = pushPullFace(result, cap.ref, -10);
      expect(inspect(restored).volume).toBeCloseTo(detailed.mesh.volume, 3);
    }
  },
);

it(
  'propagates the resized end and editable treatment to a rotated linked copy',
  { timeout: 30000 },
  async () => {
    const first = detailEdges(
      asComponent(makeBody(100, 80, 18)),
      Array.from({ length: 12 }, (_, i) => i),
      'fillet',
      2,
    );
    const copy = rotateBodies(
      [{ ...first.body, id: 'copy', origin: [300, 0, 0] }],
      [300, 0, 0],
      [0, 0, 1],
      90,
    )[0];
    const before = { ...freshProject(), bodies: [first.body, copy] };
    const face = first.mesh.faces.find((f) => f.planar && f.normal[0] < -0.99)!;
    const changed = pushPullFace(first.body, face.ref, -10);
    const after = await synchronizeComponents(
      before,
      { ...before, bodies: [changed, copy] },
      async (s, t) => instantiateComponents(s, t),
    );
    expect(inspect(after.bodies[1]).volume).toBeCloseTo(inspect(changed).volume, 3);
    inspect(after.bodies[1]).stock!.dimensions.forEach((n, i) =>
      expect(n).toBeCloseTo([90, 80, 18][i], 10),
    );
    expect(after.bodies[1].edgeTreatment?.size).toBe(2);
    expect(after.bodies[1].component?.rotation).toEqual(copy.component?.rotation);
    expect(
      detailEdges(after.bodies[1], after.bodies[1].edgeTreatment!.indices, 'fillet', 1, true).mesh
        .volume,
    ).toBeGreaterThan(inspect(after.bodies[1]).volume);
  },
);

it.skipIf(!process.env.NIVO_AUDIT_MODEL)(
  'resizes the private project cabinet covers without a rim',
  () => {
    const project = parseProject(readFileSync(process.env.NIVO_AUDIT_MODEL!, 'utf8'));
    const bodies = project.bodies.filter((b) =>
      /^(Korkean kaapin oikea peite|Vasen peite)$/.test(b.name),
    );
    expect(bodies.length).toBeGreaterThan(0);
    for (const body of bodies) {
      const before = inspect(body);
      for (const normal of [
        [1, 0, 0],
        [0, 0, 1],
      ]) {
        const face = before.faces.find(
          (f) => f.planar && f.normal.every((n, i) => Math.abs(n - normal[i]) < 1e-6),
        )!;
        const result = pushPullFace({ ...body, locked: false }, face.ref, -5);
        const after = inspect(result);
        expect(after.faces).toHaveLength(before.faces.length);
        expect(after.volume).toBeLessThan(before.volume);
        expect(result.edgeTreatment?.size).toBe(body.edgeTreatment?.size);
        const axis = normal[0] ? 'width' : 'height';
        expect(result.feature[axis]).toBeCloseTo(body.feature[axis] - 5, 4);
      }
    }
  },
  30000,
);

it(
  'moves a 45 mm profile corner together with a subsequent 2 mm roundover and removes both in order',
  { timeout: 30000 },
  () => {
    const base = makeBody(200, 18, 600);
    const corner = inspect(base).detailEdges!.find(
      (e) =>
        e.lines.length === 6 &&
        Math.abs(e.lines[0] - 200) < 1e-5 &&
        Math.abs(e.lines[2] - 600) < 1e-5 &&
        Math.abs(e.lines[4] - e.lines[1]) > 17,
    )!;
    expect(corner).toBeDefined();
    const large = detailEdges(base, [corner.index], 'fillet', 45);
    const smallEdges = large.mesh
      .detailEdges!.filter((e) => e.lines.every((v, i) => i % 3 !== 1 || Math.abs(v) < 1e-5))
      .map((e) => e.index);
    const small = detailEdges(large.body, smallEdges, 'fillet', 2);
    expect(small.body.edgeTreatment?.previous).toHaveLength(1);
    for (const axis of [0, 2]) {
      const top = small.mesh.faces.find((f) => f.planar && f.normal[axis] > 0.99)!;
      const resized = pushPullFace(small.body, top.ref, 30);
      const mesh = inspect(resized);
      expect(mesh.faces).toHaveLength(small.mesh.faces.length);
      expect(resized.feature[axis === 0 ? 'width' : 'height']).toBeCloseTo(
        (axis === 0 ? 200 : 600) + 30,
        4,
      );
      expect(resized.edgeTreatment?.previous?.[0].size).toBe(45);
      const moved = rotateBodies([resized], [0, 0, 0], [1, 2, 3], 31)[0];
      const restored = parseProject(JSON.stringify({ ...freshProject(), bodies: [moved] }))
        .bodies[0];
      const one = removeEdgeTreatment(restored);
      expect(one.edgeTreatment?.size).toBe(45);
      const plain = removeEdgeTreatment(one);
      expect(plain.edgeTreatment).toBeUndefined();
      expect(inspect(plain).faces).toHaveLength(6);
      expect(inspect(plain).volume).toBeCloseTo((axis === 0 ? 230 * 600 : 200 * 630) * 18, 2);
    }
  },
);

it(
  'recovers a legacy 45 mm corner only after proving the entire original solid',
  { timeout: 30000 },
  () => {
    const base = makeBody(200, 18, 600);
    const corner = inspect(base).detailEdges!.find(
      (e) =>
        e.lines.length === 6 &&
        Math.abs(e.lines[0] - 200) < 1e-5 &&
        Math.abs(e.lines[2] - 600) < 1e-5 &&
        Math.abs(e.lines[4] - e.lines[1]) > 17,
    )!;
    const large = detailEdges(base, [corner.index], 'fillet', 45);
    const legacy = { ...large.body, edgeTreatment: undefined };
    const smallEdges = large.mesh
      .detailEdges!.filter((e) => e.lines.every((v, i) => i % 3 !== 1 || Math.abs(v) < 1e-5))
      .map((e) => e.index);
    const small = detailEdges(legacy, smallEdges, 'fillet', 2);
    const removed = removeEdgeTreatment(small.body);
    expect(removed.edgeTreatment?.size).toBeCloseTo(45, 5);
    expect(inspect(removeEdgeTreatment(removed)).volume).toBeCloseTo(200 * 18 * 600, 3);
    const top = small.mesh.faces.find((f) => f.planar && f.normal[2] > 0.99)!;
    const resized = pushPullFace(small.body, top.ref, 30);
    expect(resized.edgeTreatment?.previous?.[0].size).toBeCloseTo(45, 5);
    expect(inspect(resized).faces).toHaveLength(small.mesh.faces.length);
    const rotated = rotateBodies([legacy], [0, 0, 0], [1, 2, 3], 31)[0];
    expect(inspect(removeEdgeTreatment(rotated)).volume).toBeCloseTo(200 * 18 * 600, 3);
    const holed = booleanBodies([legacy], [makeBody(20, 30, 20, [50, -5, 300])], 'cut')[0];
    expect(() => removeEdgeTreatment(holed)).toThrow('ei voitu erottaa');
  },
);
