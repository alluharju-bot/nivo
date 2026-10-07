import { expect, it } from 'vitest';
import { traceTexturePlan } from './traceTextures';
import { defaultAppearance, findPreset, materialPresets, surfaceDepth } from '../model/materials';

it('allocates a shared 512 px PBR material once rather than once per part', () => {
  expect(traceTexturePlan(3, 512, 256)).toEqual({ count: 3, size: 512, bytes: 3 * 1024 * 1024 });
});
it('keeps atlases within 128 MiB and the device array layer limit', () => {
  expect(traceTexturePlan(200, 2048, 256).bytes).toBeLessThanOrEqual(128 * 1024 * 1024);
  expect(traceTexturePlan(3, 2048, 256).size).toBe(1024);
  expect(traceTexturePlan(0, 0, 256).size).toBe(1);
  expect(() => traceTexturePlan(257, 512, 256)).toThrow('257 eri materiaalikuvaa');
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
