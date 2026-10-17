import { beforeAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import init from 'replicad-opencascadejs';
import { setOC } from 'replicad';
import { makeProfileBody } from '../model/project';
import { sketchFrame } from '../model/sketch';
import { surfaceMesh } from './exchange';
import { fromBodyMesh, surfaceBody } from '../surface/mesh';
import { meshClosure } from '../exchange/mesh';
beforeAll(
  async () =>
    setOC(
      await init({
        wasmBinary: readFileSync(new URL(import.meta.resolve('replicad-opencascadejs/wasm'))),
      }),
    ),
  30000,
);
it('retessellates a round CAD part at a lower density without changing its exact source', () => {
  const body = makeProfileBody({ kind: 'circle', radius: 50 }, sketchFrame([1000, -2000, 25]), 80),
    original = JSON.stringify(body);
  const low = surfaceMesh(body, 2, 0.7),
    high = surfaceMesh(body, 0.15, 0.1);
  expect(low.triangles.length).toBeLessThan(high.triangles.length);
  const m = fromBodyMesh(body, low);
  expect(meshClosure(m.positions, m.indices).closed).toBe(true);
  expect(surfaceBody(body, m).feature.type).toBe('mesh');
  expect(JSON.stringify(body)).toBe(original);
});
it('rejects non-finite or excessive tessellation requests', () => {
  const body = makeProfileBody({ kind: 'circle', radius: 20 }, sketchFrame([0, 0, 0]), 10);
  expect(() => surfaceMesh(body, NaN, 0.3)).toThrow('rajoissa');
  expect(() => surfaceMesh(body, 30, 0.3)).toThrow('rajoissa');
});
