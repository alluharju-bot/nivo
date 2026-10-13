import { expect, test } from '@playwright/test';
import { build } from 'vite';
import { resolve } from 'node:path';

test('LED light importance reduces variance without adding energy', async ({ page }) => {
  const bundle = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      lib: {
        entry: resolve('tests/fixtures/light-importance-harness.ts'),
        name: 'NivoLightTest',
        formats: ['iife'],
      },
    },
  });
  const result = Array.isArray(bundle) ? bundle[0] : bundle;
  if (!('output' in result)) throw new Error('Missing fixture');
  const chunk = result.output.find((file) => file.type === 'chunk');
  if (!chunk || chunk.type !== 'chunk') throw new Error('Missing fixture');
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('about:blank');
  await page.addScriptTag({ content: chunk.code });
  const stats = await page.evaluate(() =>
    (
      window as unknown as { NivoLightTest: typeof import('./fixtures/light-importance-harness') }
    ).NivoLightTest.exerciseLightImportance(),
  );
  console.log(JSON.stringify(stats));
  expect(stats.weighted).toBeLessThan(stats.uniform * 0.6);
  expect(Math.abs(stats.weightedMean / stats.referenceMean - 1)).toBeLessThan(0.05);
  expect(Math.abs(stats.uniformMean / stats.referenceMean - 1)).toBeLessThan(0.1);
  expect(stats.error).toBe(0);
  expect(errors).toEqual([]);
});
