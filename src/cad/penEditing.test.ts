import { beforeAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import init from 'replicad-opencascadejs';
import { setOC, measureArea } from 'replicad';
import {
  makeBody,
  makeProfileBody,
  freshProject,
  parseProject,
  type Body,
  type Vec3,
} from '../model/project';
import { sketchFrame } from '../model/sketch';
import { booleanBodies, splitFace } from './operations';
import { bezierPath } from './modeling';
import { penPath } from './paths';
import { fillPenRegions } from './penRegions';
import { addSurfaceRegions } from './surfaces';
import { createShape, meshBody, pushPullFace, solidVolume } from './kernel';
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

function basin() {
  return booleanBodies([makeBody(200, 140, 80)], [makeBody(180, 120, 80, [10, 10, 10])], 'cut')[0];
}
function ledge(reverse = false) {
  const points: Vec3[] = [
    [50, 10, 80],
    [50, 70, 80],
    [150, 70, 80],
    [150, 10, 80],
  ];
  const curve = bezierPath(reverse ? points.reverse() : points, 'Kaari');
  const line = penPath(
    [
      [150, 10, 80],
      [50, 10, 80],
    ],
    'Takareuna',
  );
  return fillPenRegions(line, [curve], [], 'stroke').bodies;
}
function inspect(body: Body) {
  const shape = createShape(body);
  const faces = shape.faces,
    solids = shape.solids;
  try {
    return {
      mesh: meshBody(body, shape),
      volume: solidVolume(shape),
      areas: faces.map((f) => measureArea(f)),
      solids: solids.length,
    };
  } finally {
    faces.forEach((f) => f.delete());
    solids.forEach((s) => s.delete());
    shape.delete();
  }
}

it.each([false, true])(
  'adds a closed curved surface over a basin hole and extrudes it into the same solid (reverse=%s)',
  (reverse) => {
    const body = basin(),
      before = inspect(body),
      regions = ledge(reverse);
    const added = addSurfaceRegions(body, regions, [0, 0, 1])!;
    expect(added.body.id).toBe(body.id);
    const roundTrip = parseProject(JSON.stringify({ ...freshProject(), bodies: [added.body] }))
      .bodies[0];
    const surface = inspect(roundTrip);
    expect(surface.volume).toBeCloseTo(before.volume, 5);
    expect(surface.mesh.faces).toHaveLength(before.mesh.faces.length + 1);
    const newFace = surface.mesh.faces.find((f) => f.ref === added.face)!;
    expect(newFace.center[1]).toBeGreaterThan(10);
    const area = surface.areas[newFace.index];
    const pulled = inspect(pushPullFace(roundTrip, added.face, -20));
    expect(pulled.volume).toBeCloseTo(before.volume + area * 20, 4);
    expect(pulled.solids).toBe(1);
    // Reusing the same boundary must never add coincident faces.
    expect(addSurfaceRegions(added.body, regions)).toBeUndefined();
    expect(inspect(body).mesh.faces).toHaveLength(before.mesh.faces.length);
  },
);

it('trims existing rim surfaces and enclosed volumes out of an added region', () => {
  const body = basin(),
    before = inspect(body);
  const profile = makeProfileBody(
    { kind: 'rectangle', width: 100, depth: 40 },
    sketchFrame([50, 0, 80]),
  );
  const added = addSurfaceRegions(body, [profile])!;
  const after = inspect(added.body);
  const face = after.mesh.faces.find((f) => f.ref === added.face)!;
  expect(after.areas[face.index]).toBeCloseTo(100 * 30, 5);
  expect(after.volume).toBeCloseTo(before.volume, 5);
  const hidden = makeProfileBody(
    { kind: 'rectangle', width: 20, depth: 20 },
    sketchFrame([50, 50, 5]),
  );
  expect(addSurfaceRegions(body, [hidden])).toBeUndefined();
  expect(() => addSurfaceRegions({ ...body, locked: true }, [profile])).toThrow('Hold');
});

it('keeps new surfaces in the component and propagates them to linked instances', async () => {
  const body = asComponent(basin());
  const copy: Body = { ...body, id: 'copy', origin: [400, 0, 0] };
  const project = { ...freshProject(), bodies: [body, copy] };
  const added = addSurfaceRegions(body, ledge())!;
  const next = await synchronizeComponents(
    project,
    { ...project, bodies: [added.body, copy] },
    async (source, targets) => instantiateComponents(source, targets),
  );
  expect(next.bodies[1].origin).toEqual(copy.origin);
  expect(next.bodies[1].component).toEqual(copy.component);
  expect(inspect(next.bodies[1]).mesh.faces).toHaveLength(inspect(added.body).mesh.faces.length);
  expect(inspect(next.bodies[1]).volume).toBeCloseTo(inspect(body).volume, 5);
});

it('does not regenerate an old pocket cover when a new stroke joins its drawing network', () => {
  const body = makeBody(300, 200, 40);
  const profile = makeProfileBody(
    { kind: 'rectangle', width: 40, depth: 60 },
    sketchFrame([20, 20, 40]),
  );
  const split = splitFace(body, 'z:max', profile);
  const recessed = pushPullFace(split.body, split.face, -10);
  const outline = penPath(
    [
      [20, 20, 40],
      [60, 20, 40],
      [60, 80, 40],
      [20, 80, 40],
      [20, 20, 40],
    ],
    'Vanha rajaus',
  );
  const stroke = penPath(
    [
      [60, 20, 40],
      [300, 20, 40],
    ],
    'Uusi viiva',
  );
  // The old loop is connected, but this stroke does not create or divide it.
  const regions = fillPenRegions(stroke, [outline], [], 'stroke');
  const added = addSurfaceRegions(recessed, regions.bodies, [0, 0, 1]);
  expect(
    added?.face,
    'An unrelated old drawing must not put a sheet over a finished recess',
  ).toBeUndefined();
  expect(regions.bodies).toHaveLength(0);
});
