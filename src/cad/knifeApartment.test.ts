import { beforeAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import init from 'replicad-opencascadejs';
import { setOC, measureVolume } from 'replicad';
import { parseProject, type Vec3 } from '../model/project';
import { createShape, shapeIsValid } from './kernel';
import { knifeBodies, type KnifeRay } from './modeling';
beforeAll(
  async () =>
    setOC(
      await init({
        wasmBinary: readFileSync(new URL(import.meta.resolve('replicad-opencascadejs/wasm'))),
      }),
    ),
  30000,
);
it.skipIf(!process.env.NIVO_APARTMENT_MODEL)(
  'private apartment knife audit',
  () => {
    const p = parseProject(readFileSync(process.env.NIVO_APARTMENT_MODEL!, 'utf8'));
    const body = p.bodies.find((b) => b.name === 'Kerrostalo')!;
    const shape = createShape(body);
    const solids = shape.solids;
    const before = solids.reduce((sum, s) => sum + measureVolume(s), 0);
    solids.forEach((s) => s.delete());
    shape.delete();
    const [x, y, z] = body.origin,
      w = body.feature.width,
      d = body.feature.depth,
      h = body.feature.height;
    const ray = (a: Vec3, direction: Vec3): KnifeRay => ({ origin: a, direction });
    const cases: KnifeRay[][] = [
      [
        ray([x + w * 0.4, y - 1000, z + h + 1000], [0, 1, 0]),
        ray([x + w * 0.4, y - 1000, z - 1000], [0, 1, 0]),
      ],
      [
        ray([x - 1000, y - 1000, z + h * 0.7], [0, 1, 0]),
        ray([x + w + 1000, y - 1000, z + h * 0.3], [0, 1, 0]),
      ],
      [
        ray([x - 1000, y - 1000, z + h * 0.6], [0, 1, 0]),
        ray([x + w * 0.5, y - 1000, z + h * 0.3], [0, 1, 0]),
        ray([x + w + 1000, y - 1000, z + h * 0.55], [0, 1, 0]),
      ],
    ];
    cases.push(
      Array.from({ length: 31 }, (_, i) =>
        ray(
          [x - 1000 + ((w + 2000) * i) / 30, y - 1000, z + h * (0.45 + 0.12 * Math.sin(i * 0.7))],
          [0, 1, 0],
        ),
      ),
    );
    const errors: string[] = [];
    for (let i = 0; i < cases.length; i++)
      try {
        const result = knifeBodies([body], cases[i]);
        let after = 0;
        for (const part of result.bodies) {
          const cut = createShape(part),
            solids = cut.solids;
          try {
            expect(shapeIsValid(cut)).toBe(true);
            after += solids.reduce((n, s) => n + measureVolume(s), 0);
          } finally {
            solids.forEach((s) => s.delete());
            cut.delete();
          }
        }
        expect(Math.abs(after - before) / before).toBeLessThan(1e-7);
        expect(result.affected).toHaveLength(1);
      } catch (e) {
        errors.push(String(e));
      }
    expect(errors).toEqual([]);
  },
  180000,
);
