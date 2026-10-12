import { expect, test } from '@playwright/test';
import { build } from 'vite';
import { resolve } from 'node:path';
import type { exerciseTraceImage } from './fixtures/trace-image-harness';

test('real GPU retains coarse radiance, fully retires it and clears it for a new camera', async ({
  page,
}) => {
  // Build the actual module into an isolated browser fixture; no production
  // debug API, mocked renderer or second copy of the compositing shader.
  const bundle = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      lib: {
        entry: resolve('tests/fixtures/trace-image-harness.ts'),
        name: 'NivoTraceImageTest',
        formats: ['iife'],
      },
    },
  });
  const result = Array.isArray(bundle) ? bundle[0] : bundle;
  if (!('output' in result)) throw new Error('Expected fixture bundle');
  const chunk = result.output.find((file) => file.type === 'chunk');
  if (!chunk || chunk.type !== 'chunk') throw new Error('Missing fixture script');
  await page.goto('about:blank');
  await page.addScriptTag({ content: chunk.code });
  const pixels = await page.evaluate(() =>
    (
      window as unknown as {
        NivoTraceImageTest: { exerciseTraceImage: typeof exerciseTraceImage };
      }
    ).NivoTraceImageTest.exerciseTraceImage(),
  );
  expect(pixels.initial.pixel).toEqual([255, 0, 0, 255]);
  expect(pixels.first.pixel[0]).toBeGreaterThan(240);
  expect(pixels.first.pixel[2]).toBeGreaterThan(0);
  expect(pixels.first.pixel[2]).toBeLessThan(15);
  expect(pixels.halfway.pixel[0]).toBeCloseTo(128, 0);
  expect(pixels.halfway.pixel[2]).toBeCloseTo(128, 0);
  expect(pixels.complete.pixel).toEqual([0, 0, 255, 255]);
  expect(pixels.first.textures).toBe(3);
  expect(pixels.complete.textures).toBe(2);
  expect(pixels.converged).toEqual(pixels.complete);
  expect(pixels.secondUpgrade.pixel[2]).toBeGreaterThan(240);
  expect(pixels.secondUpgrade.pixel[0]).toBe(0);
  expect(pixels.filtered.pixel[1]).toBeCloseTo(128, 0);
  expect(pixels.filtered.pixel[2]).toBeCloseTo(128, 0);
  expect(pixels.cleared).toEqual({ ready: false, weight: 0, textures: 1 });
  expect(pixels.afterReset.pixel).toEqual([0, 0, 255, 255]);
  for (const sample of Object.values(pixels)) if ('error' in sample) expect(sample.error).toBe(0);
});
