import { beforeAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import init from 'replicad-opencascadejs';
import { setOC, measureArea, makeCompound, type Shape3D } from 'replicad';
import {
  freshProject,
  makeBody,
  makeProfileBody,
  parseProject,
  type Body,
  type Vec3,
} from '../model/project';
import { sketchFrame } from '../model/sketch';
import { bodyFromShape, createShape, meshBody, pushPullFace, solidVolume } from './kernel';
import { offsetFace, booleanBodies } from './operations';
import { removeSurfaceFaces } from './surfaces';
import { cutOpening, penPath } from './paths';
import { asComponent, synchronizeComponents } from '../model/components';
import { instantiateComponents } from './components';

beforeAll(async () => {
  setOC(
    await init({
      wasmBinary: readFileSync(new URL(import.meta.resolve('replicad-opencascadejs/wasm'))),
    }),
  );
}, 30000);

function inspect(body: Body) {
  const shape = createShape(body);
  const faces = shape.faces;
  try {
    return {
      mesh: meshBody(body, shape),
      area: measureArea(shape as Shape3D),
      volume: solidVolume(shape),
      areas: faces.map((face) => measureArea(face)),
    };
  } finally {
    faces.forEach((face) => face.delete());
    shape.delete();
  }
}
function rim(offsetDistance = -8, normal: Vec3 = [0, 0, 1]) {
  const circle = makeProfileBody({ kind: 'circle', radius: 100 }, sketchFrame([0, 0, 0], normal));
  const offset = offsetFace(circle, inspect(circle).mesh.faces[0].ref, offsetDistance);
  const ring =
    offsetDistance < 0
      ? offset.face
      : inspect(offset.body).mesh.faces.find((f) => f.ref !== offset.face)!.ref;
  return pushPullFace(offset.body, ring, 50);
}

it('Cut removes a zero-thickness centre from an 8 mm rim extruded 50 mm, with no volume change', () => {
  const body = rim(),
    before = inspect(body);
  const cutter = makeProfileBody({ kind: 'circle', radius: 100 }, sketchFrame([0, 0, 0]), 40);
  const result = booleanBodies([body], [cutter], 'cut');
  expect(result).toHaveLength(1);
  const after = inspect(result[0]);
  expect(after.volume).toBeCloseTo(before.volume, 5);
  expect(before.area - after.area).toBeCloseTo(Math.PI * 100 ** 2, 4);
  expect(after.mesh.faces).toHaveLength(4);
});

it.each([-8, 8])(
  'deletes the centre after a %i mm offset on an inclined plane, with round-trip and valid solid walls',
  (offset) => {
    const body = rim(offset, [0, Math.SQRT1_2, Math.SQRT1_2]),
      before = inspect(body);
    const centre = before.mesh.faces.find(
      (f) => Math.hypot(...f.center) < 1e-5 && before.areas[f.index] > 20000,
    )!;
    const [removed] = removeSurfaceFaces(body, [centre.ref]);
    const saved = parseProject(JSON.stringify({ ...freshProject(), bodies: [removed] })).bodies[0];
    const after = inspect(saved);
    expect(after.volume).toBeCloseTo(before.volume, 5);
    expect(before.area - after.area).toBeCloseTo(Math.PI * (offset < 0 ? 100 : 92) ** 2, 4);
    expect(after.mesh.faces).toHaveLength(before.mesh.faces.length - 1);
    expect(inspect(body).mesh.faces).toHaveLength(before.mesh.faces.length);
    expect(() => removeSurfaceFaces(saved, [after.mesh.faces[0].ref])).toThrow('umpinaista');
  },
);

it('deletes a disk before extrusion; its retained annulus extrudes as an open tube', () => {
  const circle = makeProfileBody({ kind: 'circle', radius: 100 }, sketchFrame([0, 0, 0]));
  const inset = offsetFace(circle, inspect(circle).mesh.faces[0].ref, 8);
  const [ring] = removeSurfaceFaces(inset.body, [inset.face]);
  expect(inspect(ring).area).toBeCloseTo(Math.PI * (100 ** 2 - 92 ** 2), 5);
  const tube = pushPullFace(ring, inspect(ring).mesh.faces[0].ref, 50);
  expect(inspect(tube).volume).toBeCloseTo(Math.PI * (100 ** 2 - 92 ** 2) * 50, 4);
  expect(inspect(tube).mesh.faces.filter((f) => f.planar)).toHaveLength(2);
  expect(inspect(tube).area).toBeCloseTo(
    2 * Math.PI * (100 ** 2 - 92 ** 2) + 2 * Math.PI * (100 + 92) * 50,
    4,
  );
  expect(removeSurfaceFaces(ring, [inspect(ring).mesh.faces[0].ref])).toEqual([]);
});

it('protects held objects and stale face selections, and retains independent drawing edges', () => {
  const circle = makeProfileBody({ kind: 'circle', radius: 20 }, sketchFrame([0, 0, 0]));
  const face = inspect(circle).mesh.faces[0].ref;
  expect(() => removeSurfaceFaces({ ...circle, locked: true }, [face])).toThrow('kiinnitetty');
  expect(() => removeSurfaceFaces(circle, ['surface:999'])).toThrow('uudelleen');
  const line = penPath(
    [
      [50, 0, 0],
      [60, 0, 0],
    ],
    'Viiva',
  );
  const compound = makeCompound([createShape(circle), createShape(line)]);
  try {
    const mixed = bodyFromShape(circle, compound, []);
    const [wire] = removeSurfaceFaces(mixed, [inspect(mixed).mesh.faces[0].ref]);
    expect(inspect(wire).mesh.faces).toHaveLength(0);
    expect(wire.feature).toMatchObject({ width: 10, solid: false });
  } finally {
    compound.delete();
  }
});

it('cuts a partial hole and a quick opening through the loose centre without changing wall volume', () => {
  const body = rim(),
    before = inspect(body);
  const cutter = makeProfileBody({ kind: 'circle', radius: 25 }, sketchFrame([0, 0, -5]), 40);
  const result = booleanBodies([body], [cutter], 'cut')[0];
  expect(before.area - inspect(result).area).toBeCloseTo(Math.PI * 25 ** 2, 4);
  expect(inspect(result).volume).toBeCloseTo(before.volume, 5);
  const profile = makeProfileBody({ kind: 'circle', radius: 100 }, sketchFrame([0, 0, 0]));
  const opening = cutOpening(profile, [body]);
  expect(opening.affected).toEqual([body.id]);
  expect(inspect(opening.bodies[0]).mesh.faces).toHaveLength(4);
  const miss = makeProfileBody({ kind: 'circle', radius: 25 }, sketchFrame([0, 0, 10]), 30);
  expect(booleanBodies([body], [miss], 'cut')[0]).toBe(body);
});

it('keeps remaining surfaces after the solid is removed and continues cutting further batches', () => {
  const circle = makeProfileBody({ kind: 'circle', radius: 100 }, sketchFrame([0, 0, 0]));
  const box = makeBody(10, 10, 10, [200, 0, 0]);
  const shape = makeCompound([createShape(circle), createShape(box)]);
  try {
    const mixed = bodyFromShape(circle, shape, []);
    const first = makeBody(30, 30, 30, [190, -10, -10]);
    const [flat] = booleanBodies([mixed], [first], 'cut');
    expect(flat.feature).toMatchObject({ solid: false });
    expect(inspect(flat).area).toBeCloseTo(Math.PI * 100 ** 2, 4);
    // Overlapping bounding boxes force sequential passes. The second pass must
    // still cut the surviving disk after the first removed the only solid.
    const next = makeBody(240, 240, 40, [-120, -120, -20]);
    expect(booleanBodies([mixed], [first, next], 'cut')).toEqual([]);
  } finally {
    shape.delete();
  }
});

it('propagates surface removal to linked copies without changing their placement', async () => {
  const body = asComponent(rim()),
    copy = { ...body, id: 'copy', origin: [400, 0, 0] as Vec3 };
  const project = { ...freshProject(), bodies: [body, copy] };
  const before = inspect(body);
  const centre = before.mesh.faces.find(
    (f) => Math.hypot(...f.center) < 1e-5 && before.areas[f.index] > 20000,
  )!;
  const [removed] = removeSurfaceFaces(body, [centre.ref]);
  const next = await synchronizeComponents(
    project,
    { ...project, bodies: [removed, copy] },
    async (source, targets) => instantiateComponents(source, targets),
  );
  expect(next.bodies[1].origin).toEqual(copy.origin);
  expect(inspect(next.bodies[1]).mesh.faces).toHaveLength(inspect(removed).mesh.faces.length);
  expect(inspect(next.bodies[1]).area).toBeCloseTo(inspect(removed).area, 5);
  expect(inspect(next.bodies[1]).volume).toBeCloseTo(inspect(body).volume, 5);
});
