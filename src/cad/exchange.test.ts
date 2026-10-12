import { beforeAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import init from 'replicad-opencascadejs';
import { setOC } from 'replicad';
import { makeBody } from '../model/project';
import { readStep, writeStep, printMeshes } from './exchange';
import { meshClosure } from '../exchange/mesh';
import { stlBinary } from '../exchange/export';
import { bodyFromShape, createShape, solidVolume } from './kernel';

beforeAll(
  async () =>
    setOC(
      await init({
        wasmBinary: readFileSync(new URL(import.meta.resolve('replicad-opencascadejs/wasm'))),
      }),
    ),
  30000,
);
it('round trips distinct solids through STEP with exact millimetre placement and printable STL', async () => {
  const bodies = [makeBody(180, 120, 60, [-50, 100, -4]), makeBody(40, 30, 3, [10, 20, 60])];
  const step = await writeStep(bodies),
    restored = await readStep(await step.arrayBuffer(), 'Kotelo');
  expect(restored).toHaveLength(2);
  expect(restored.map((b) => b.origin)).toEqual(bodies.map((b) => b.origin));
  for (let i = 0; i < bodies.length; i++) {
    const shape = createShape(restored[i]);
    try {
      expect(solidVolume(shape)).toBeCloseTo(
        bodies[i].feature.width * bodies[i].feature.depth * bodies[i].feature.height,
        4,
      );
    } finally {
      shape.delete();
    }
  }
  const meshes = printMeshes(restored, 0.05);
  expect(meshes.every((m) => meshClosure(m.vertices, m.triangles).closed)).toBe(true);
  expect(new DataView(stlBinary(meshes)).getUint32(80, true)).toBe(24);
}, 30000);
