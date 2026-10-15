import { expect, test } from '@playwright/test';
import { build } from 'vite';
import { resolve } from 'node:path';

test('grazing surfaces do not stretch denoised lighting in perspective or orthographic views', async ({
  page,
}) => {
  const bundle = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      lib: {
        entry: resolve('tests/fixtures/denoise-surface-harness.ts'),
        name: 'SurfaceTest',
        formats: ['iife'],
      },
    },
  });
  const result = Array.isArray(bundle) ? bundle[0] : bundle;
  if (!('output' in result)) throw new Error('Missing fixture');
  const chunk = result.output.find((f) => f.type === 'chunk');
  if (!chunk || chunk.type !== 'chunk') throw new Error('Missing fixture');
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('about:blank');
  await page.addScriptTag({ content: chunk.code });
  const stats = await page.evaluate(() =>
    (
      window as unknown as {
        SurfaceTest: typeof import('./fixtures/denoise-surface-harness');
      }
    ).SurfaceTest.exerciseSurfaceDenoise(),
  );
  console.log(JSON.stringify(stats));
  for (const r of stats.results) {
    expect(r.anisotropy).toBeGreaterThan(0.8);
    expect(r.anisotropy).toBeLessThan(1.25);
    expect(r.rmse).toBeLessThan(0.06);
    expect(Math.abs(r.brightness - 1)).toBeLessThan(0.04);
  }
  expect(stats.error).toBe(0);
  expect(stats.edgeError).toBeLessThan(0.001);
  expect(stats.highlightContrast).toBeGreaterThan(0.9);
  expect(stats.shadowContrast).toBeGreaterThan(0.95);
  expect(errors).toEqual([]);
});
