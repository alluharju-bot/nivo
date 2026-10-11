import { beforeAll, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import init from 'replicad-opencascadejs';
import { setOC } from 'replicad';
import { freshProject, makeBody, makeProfileBody, parseProject, type Body } from '../model/project';
import { defaultAppearance } from '../model/materials';
import { paintSurface, faceMaterialBody } from '../model/faceMaterials';
import { createShape, meshBody, pushPullFace } from './kernel';
import { sketchFrame } from '../model/sketch';
import { offsetFace } from './operations';
import { removeSurfaceFaces } from './surfaces';
import { rotateBodies } from './transforms';
import { scaleBodies } from './scaling';
import { asComponent, synchronizeComponents } from '../model/components';
import { instantiateComponents } from './components';

vi.mock('brepjs-opencascade/src/brepjs_single.wasm?url', () => ({
  default: `${process.cwd()}/node_modules/brepjs-opencascade/src/brepjs_single.wasm`,
}));
beforeAll(
  async () =>
    setOC(
      await init({
        wasmBinary: readFileSync(new URL(import.meta.resolve('replicad-opencascadejs/wasm'))),
      }),
    ),
  30000,
);
const finish = defaultAppearance('walnut');
function mesh(body: Body) {
  const shape = createShape(body);
  try {
    return meshBody(body, shape);
  } finally {
    shape.delete();
  }
}

it('paints one face, survives file round-trip, and whole-body paint clears old face finishes', () => {
  const body = makeBody(100, 80, 40),
    top = mesh(body).faces.find((f) => f.ref === 'z:max')!;
  const painted = paintSurface(body, finish, '#804020', top.index);
  const saved = parseProject(JSON.stringify({ ...freshProject(), bodies: [painted] })).bodies[0];
  expect(saved.color).toBe(body.color);
  expect(faceMaterialBody(saved, top.index).appearance).toEqual(finish);
  expect(faceMaterialBody(saved, top.index).color).toBe('#804020');
  expect(faceMaterialBody(saved, mesh(body).faces.find((f) => f.ref === 'x:max')!.index)).toBe(
    saved,
  );
  expect(paintSurface(saved, defaultAppearance('oak'), '#ffffff').faceMaterials).toBeUndefined();
});

it('offset children inherit the painted surface and push/pull carries paint to the moving cap', () => {
  const body = makeBody(100, 80, 40),
    top = mesh(body).faces.find((f) => f.ref === 'z:max')!;
  const painted = paintSurface(body, finish, '#804020', top.index);
  const inset = offsetFace(painted, top.ref, 10);
  const upper = mesh(inset.body).faces.filter((f) => f.center[2] > 39.99);
  expect(upper).toHaveLength(2);
  for (const face of upper) expect(inset.body.faceMaterials?.[face.index]?.color).toBe('#804020');
  const pulled = pushPullFace(inset.body, inset.face, 20);
  const cap = mesh(pulled).faces.find((f) => Math.abs(f.center[2] - 60) < 1e-5)!;
  expect(cap).toBeDefined();
  expect(pulled.faceMaterials?.[cap.index]?.color).toBe('#804020');
  expect(
    mesh(pulled)
      .faces.filter((f) => pulled.faceMaterials?.[f.index])
      .every((f) => Math.abs(f.normal[2]) > 0.999),
  ).toBe(true);
});

it('extruding a painted 2D profile preserves its cap material without painting an arbitrary side', () => {
  const body = paintSurface(makeBody(100, 80, 0), finish, '#804020', 0);
  const solid = pushPullFace(body, mesh(body).faces[0].ref, 20);
  const painted = mesh(solid).faces.filter((f) => solid.faceMaterials?.[f.index]);
  expect(painted.some((f) => Math.abs(f.center[2] - 20) < 1e-5)).toBe(true);
  expect(painted.every((f) => Math.abs(f.normal[2]) > 0.999)).toBe(true);
});

it('rotation, affine scaling and linked instances retain the chosen finish', async () => {
  let body = asComponent(makeBody(100, 80, 40));
  const top = mesh(body).faces.find((f) => f.ref === 'z:max')!;
  body = paintSurface(body, finish, '#804020', top.index);
  const rotated = rotateBodies([body], [0, 0, 0], [1, 0, 0], 90)[0];
  expect(rotated.faceMaterials?.[top.index]?.color).toBe('#804020');
  expect(mesh(rotated).faces.find((f) => f.index === top.index)!.normal[1]).toBeCloseTo(-1);
  const scaled = (await scaleBodies([rotated], [0, 0, 0], [2, 1, 0.5]))[0];
  const face = mesh(scaled).faces.find((f) => scaled.faceMaterials?.[f.index])!;
  expect(face.normal[1]).toBeCloseTo(-1);
  const sibling = { ...body, id: 'copy', origin: [200, 0, 0] as [number, number, number] };
  const project = { ...freshProject(), bodies: [body, sibling] };
  const changed = {
    ...project,
    bodies: [paintSurface(body, defaultAppearance('oak'), '#abcdef', top.index), sibling],
  };
  const synced = await synchronizeComponents(project, changed, async (source, targets) =>
    instantiateComponents(source, targets),
  );
  expect(synced.bodies[1].faceMaterials?.[top.index]?.color).toBe('#abcdef');
});

it('deleting a painted surface drops its material instead of moving it to a neighbouring face', () => {
  const circle = makeProfileBody({ kind: 'circle', radius: 100 }, sketchFrame([0, 0, 0]));
  const inset = offsetFace(circle, mesh(circle).faces[0].ref, 8);
  const target = mesh(inset.body).faces.find((f) => f.ref === inset.face)!;
  const painted = paintSurface(inset.body, finish, '#804020', target.index);
  const [remaining] = removeSurfaceFaces(painted, [target.ref]);
  expect(remaining.faceMaterials).toBeUndefined();
});
