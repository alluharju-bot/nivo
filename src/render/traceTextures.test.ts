import { expect, it } from 'vitest';
import { traceTexturePlan } from './traceTextures';
import { defaultAppearance, findPreset, materialPresets, surfaceDepth } from '../model/materials';

it('allocates a shared 512 px PBR material once rather than once per part', () => {
  expect(traceTexturePlan([512, 512, 512], 256)).toMatchObject({
    count: 3,
    size: 512,
    layers: 3,
    bytes: 6 * 1024 * 1024,
  });
});
it('keeps atlases within 128 MiB and the device array layer limit', () => {
  expect(traceTexturePlan(Array(200).fill(2048), 256).bytes).toBeLessThanOrEqual(128 * 1024 * 1024);
  expect(traceTexturePlan([2048, 2048, 2048], 256).size).toBe(2048);
  expect(traceTexturePlan([2048, 2048, 2048], 256, 512).size).toBe(512);
  expect(traceTexturePlan([], 256).size).toBe(1);
  expect(() => traceTexturePlan(Array(257).fill(512), 256)).toThrow('257 eri materiaalikuvaa');
});
it('preserves a detailed wood image amongst smaller maps without growing the budget', () => {
  const plan = traceTexturePlan([2048, ...Array(38).fill(512)], 256);
  expect(plan.tiles[0].size).toBe(2048);
  expect(plan.tiles.slice(1).every((tile) => tile.size === 512)).toBe(true);
  expect(plan.bytes).toBeLessThanOrEqual(128 * 1024 * 1024);
  for (const a of plan.tiles)
    for (const b of plan.tiles) {
      if (a === b || a.layer !== b.layer) continue;
      expect(
        a.x + a.size <= b.x || b.x + b.size <= a.x || a.y + a.size <= b.y || b.y + b.size <= a.y,
      ).toBe(true);
    }
});
it('reduces data maps before color detail when the memory budget is exhausted', () => {
  const plan = traceTexturePlan(
    [
      { size: 2048, priority: 4 },
      { size: 2048, priority: 1 },
      { size: 2048, priority: 1 },
      ...Array(38).fill(512),
    ],
    256,
  );
  expect(plan.tiles[0].size).toBe(2048);
  expect(plan.tiles[1].size).toBeLessThan(2048);
  expect(plan.tiles[2].size).toBeLessThan(2048);
  expect(plan.bytes).toBeLessThanOrEqual(128 * 1024 * 1024);
  expect(() => traceTexturePlan([512], 0)).toThrow('ei tue');
});
it('gives building finishes physical scale and distinguishable relief and sheen', () => {
  expect(surfaceDepth(findPreset('gypsum-rough'))).toBeGreaterThan(
    surfaceDepth(findPreset('gypsum-smooth')),
  );
  expect(findPreset('concrete-troweled').roughness).toBeLessThan(
    findPreset('concrete-raw').roughness,
  );
  expect(surfaceDepth(findPreset('concrete-troweled'))).toBeLessThan(
    surfaceDepth(findPreset('concrete-raw')),
  );
  expect(defaultAppearance('tile-white-gloss').texture).toMatchObject({ width: 300, height: 600 });
  expect(defaultAppearance('tile-terracotta').texture).toMatchObject({ width: 200, height: 200 });
  expect(materialPresets.filter((p) => p.category === 'Laatat')).toHaveLength(4);
  expect(defaultAppearance('tile-wall-small').texture).toMatchObject({ width: 100, height: 200 });
});
