import { resolveAnchor } from '../model/guides';
import { paintSurface } from '../model/faceMaterials';
import { defaultAppearance } from '../model/materials';
import { beforeAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import init from 'replicad-opencascadejs';
import { setOC } from 'replicad';
import { makeBody, makeProfileBody, type Body } from '../model/project';
import { sketchFrame } from '../model/sketch';
import { editableDimensions } from '../model/editableDimensions';
import { changeDimension } from './editableDimensions';
import { createShape, meshBody, solidVolume, pushPullFace } from './kernel';
import { booleanBodies } from './operations';
import { detailEdges } from './details';
import { asComponent, synchronizeComponents } from '../model/components';
import { instantiateComponents } from './components';
import { freshProject } from '../model/project';
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
    return { mesh: meshBody(body, shape), volume: solidVolume(shape) };
  } finally {
    shape.delete();
  }
}
it('changes a primitive width from the original corner, leaving thickness unchanged', () => {
  const body = makeBody(100, 80, 4, [12, 18, 24]);
  const next = changeDimension(body, 'width', 92.25);
  expect(next.origin).toEqual(body.origin);
  expect(next.feature).toMatchObject({ width: 92.25, depth: 80, height: 4 });
  expect(body.feature.width).toBe(100);
});
it('changes circle diameter while fixing its exact centre and preserving extrusion parameters through Push/Pull', () => {
  const body = makeProfileBody({ kind: 'circle', radius: 6 }, sketchFrame([30, 40, 10]), 0);
  const face = inspect(body).mesh.faces[0];
  const solid = pushPullFace(body, face.ref, 20);
  expect(solid.feature.type).toBe('profile-extrusion');
  const next = changeDimension(solid, 'diameter', 14.2);
  expect(next.origin[0] + next.feature.width / 2).toBeCloseTo(30, 8);
  expect(next.origin[1] + next.feature.depth / 2).toBeCloseTo(40, 8);
  expect(next.feature.height).toBe(20);
  expect(inspect(next).volume).toBeCloseTo(Math.PI * 7.1 ** 2 * 20, 4);
  expect(editableDimensions(next).map((d) => d.key)).toEqual(['diameter', 'distance']);
});
it('changes a tilted profile in its drawing axes, preserving its starting point', () => {
  const body = makeProfileBody(
    { kind: 'rectangle', width: 20, depth: 10 },
    sketchFrame([5, 7, 9], [0, -1, 0]),
    3,
  );
  const next = changeDimension(body, 'width', 32);
  expect(next.feature.type).toBe('profile-extrusion');
  if (next.feature.type !== 'profile-extrusion' || body.feature.type !== 'profile-extrusion')
    throw Error();
  expect(next.feature.frame.origin.map((n, i) => n + next.origin[i])).toEqual([5, 7, 9]);
  expect(next.feature.profile).toEqual({ kind: 'rectangle', width: 32, depth: 10 });
  expect(next.feature.distance).toBe(3);
});
it('extends a cut plate without enlarging its hole', () => {
  const original = makeBody(100, 60, 10),
    cutter = makeProfileBody({ kind: 'circle', radius: 5 }, sketchFrame([30, 30, -1]), 12);
  const cut = booleanBodies([original], [cutter], 'cut')[0];
  const next = changeDimension(cut, 'width', 140);
  expect(next.feature.width).toBeCloseTo(140, 5);
  expect(inspect(next).volume).toBeCloseTo(140 * 60 * 10 - Math.PI * 25 * 10, 3);
  const cylinders = inspect(next).mesh.faces.flatMap((f) => (f.cylinder ? [f.cylinder] : []));
  expect(cylinders.some((c) => Math.abs(c.radius - 5) < 1e-6)).toBe(true);
});
it('edits an exact radius and preserves that radius while extending a treated plate', () => {
  const original = makeBody(100, 60, 10),
    m = inspect(original).mesh;
  const edge = m.detailEdges!.find((e) => Math.abs(e.lines[0] - e.lines[3]) > 99)!;
  const treated = detailEdges(original, [edge.index], 'fillet', 2).body;
  const changed = changeDimension(treated, 'detail', 3);
  expect(changed.edgeTreatment?.size).toBe(3);
  const extended = changeDimension(changed, 'width', 140);
  expect(extended.feature.width).toBeCloseTo(140, 5);
  expect(extended.edgeTreatment?.size).toBe(3);
});
it('rejects ambiguous ends and invalid dimensions without changing the source', () => {
  const circle = makeProfileBody({ kind: 'circle', radius: 6 }, sketchFrame([0, 0, 0]), 10);
  const cut = booleanBodies([circle], [makeBody(1, 1, 20, [0, 0, -1])], 'cut')[0];
  const snapshot = JSON.stringify(cut);
  expect(() => changeDimension(cut, 'width', 20)).toThrow('yksiselitteistä');
  expect(() => changeDimension(circle, 'diameter', -4)).toThrow();
  expect(() => changeDimension({ ...circle, locked: true }, 'diameter', 15)).toThrow('lukitus');
  expect(JSON.stringify(cut)).toBe(snapshot);
});
it('propagates a size edit to linked copies without moving their origins', async () => {
  const a = asComponent(makeBody(100, 60, 10)),
    b = asComponent(makeBody(100, 60, 10, [200, 0, 0]), a.component!.id);
  const before = { ...freshProject(), bodies: [a, b] };
  const next = await synchronizeComponents(
    before,
    { ...before, bodies: [changeDimension(a, 'width', 120), b] },
    (s, t) => Promise.resolve(instantiateComponents(s, t)),
  );
  expect(next.bodies[1].feature.width).toBeCloseTo(120, 5);
  expect(next.bodies[1].origin).toEqual(b.origin);
});
it('retains exact curve stations through repeated diameter and cap edits', () => {
  const body = makeProfileBody({ kind: 'circle', radius: 6 }, sketchFrame([30, 40, 10]), 0);
  const anchor = inspect(body).mesh.verticesCAD.find(
    (v) => Math.abs(v.point[0] - 30) < 1e-5 && Math.abs(v.point[1] - 46) < 1e-5,
  )!.anchor;
  const next = changeDimension(changeDimension(body, 'diameter', 20), 'diameter', 30);
  expect(resolveAnchor([next], anchor)).toEqual([30, 55, 10]);
  const solid = pushPullFace(next, inspect(next).mesh.faces[0].ref, 20);
  expect(resolveAnchor([solid], anchor)).toEqual([30, 55, 10]);
  const base = inspect(solid).mesh.faces.find((f) => f.normal[2] > 0.999)!;
  const extended = pushPullFace(solid, base.ref, 5);
  expect(resolveAnchor([extended], anchor)).toEqual([30, 55, 15]);
  for (const v of inspect(extended).mesh.verticesCAD)
    expect(resolveAnchor([extended], v.anchor)).toEqual(v.point);
  expect(extended.feature.height).toBe(25);
});
it('keeps the texture origin and painted caps when a profile is extruded or resized', () => {
  const body = paintSurface(
    makeProfileBody({ kind: 'circle', radius: 10 }, sketchFrame([0, 0, 0]), 0),
    defaultAppearance('walnut'),
    '#804020',
    0,
  );
  body.textureFrame = { offset: [10, 10, 0], rotation: [0, 0, 0, 1] };
  const solid = pushPullFace(body, inspect(body).mesh.faces[0].ref, 20);
  for (const face of inspect(solid).mesh.faces)
    expect(!!solid.faceMaterials?.[face.index]).toBe(Math.abs(face.normal[2]) > 0.999);
  const base = inspect(solid).mesh.faces.find((f) => f.normal[2] > 0.999)!;
  const extended = pushPullFace(solid, base.ref, 5);
  expect(extended.origin.map((n, i) => n + extended.textureFrame!.offset[i])).toEqual([0, 0, 0]);
  const flat = changeDimension(extended, 'distance', 0);
  expect(flat.faceMaterials?.[0]?.color).toBe('#804020');
});
it('box semantic corners continue to follow subsequent Push/Pull edits', () => {
  const original = makeBody(100, 80, 10);
  const anchor = inspect(original).mesh.verticesCAD.find((v) =>
    v.point.every((n, i) => n === [100, 80, 10][i]),
  )!.anchor;
  const resized = changeDimension(original, 'width', 120);
  const pulled = pushPullFace(resized, 'x:max', 10);
  expect(resolveAnchor([pulled], anchor)).toEqual([130, 80, 10]);
});
