import { expect, it } from 'vitest';
import { facadeNoise, facadePixels } from './facade';
import { appearanceSchema, defaultAppearance } from '../model/materials';

it('keeps periodic values and derivatives continuous at both repeat boundaries', () => {
  for (const u of [-2.45, 0, 0.374, 1])
    for (const v of [0, 0.42, 1.61]) {
      expect(facadeNoise(u, v, 11, 7, 71)).toBeCloseTo(facadeNoise(u + 1, v - 1, 11, 7, 71), 12);
    }
  for (const v of [0.2, 0.43]) {
    const f = (u: number) => facadeNoise(u, v, 11, 7, 71),
      e = 1e-6;
    expect(Math.abs((f(e) - f(0)) / e - (f(0) - f(-e)) / e)).toBeLessThan(0.002);
  }
});
it('is deterministic, seedable, bounded and does not bake broad stains into normals', () => {
  const settings = defaultAppearance('facade-concrete').procedural!;
  const a = facadePixels(settings, 'concrete', 0.6, 32, 32);
  expect(facadePixels(settings, 'concrete', 0.6, 32, 32)).toEqual(a);
  const b = facadePixels({ ...settings, variation: 1, weathering: 1 }, 'concrete', 0.6, 32, 32);
  expect(b.normal).toEqual(a.normal);
  expect(b.color).not.toEqual(a.color);
  expect(facadePixels({ ...settings, seed: 99 }, 'concrete', 0.6, 32, 32).normal).not.toEqual(
    a.normal,
  );
  const flat = facadePixels({ ...settings, variation: 0, weathering: 0 }, 'plaster', 0, 32, 32);
  expect(flat.color.every((n) => n === 255)).toBe(true);
  for (let i = 0; i < flat.normal.length; i += 4)
    expect([...flat.normal.slice(i, i + 4)]).toEqual([128, 128, 255, 255]);
});
it('persists procedural settings without migrating existing saved appearances', () => {
  const a = defaultAppearance('facade-render-fine');
  expect(appearanceSchema.parse(a)).toEqual(a);
  expect(a.texture.width).toBe(12000);
  expect(defaultAppearance('concrete-raw').procedural).toBeUndefined();
  expect(() =>
    appearanceSchema.parse({ ...a, procedural: { ...a.procedural, detailSize: 0 } }),
  ).toThrow();
});
