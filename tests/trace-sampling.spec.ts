import { expect, test } from '@playwright/test';
import { build } from 'vite';
import { resolve } from 'node:path';

test('sampling converges without repeating screen-space noise blocks', async ({ page }) => {
  const bundle = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      lib: {
        entry: resolve('tests/fixtures/trace-sampling-harness.ts'),
        name: 'NivoSamplingTest',
        formats: ['iife'],
      },
    },
  });
  const result = Array.isArray(bundle) ? bundle[0] : bundle;
  if (!('output' in result)) throw new Error('Missing fixture');
  const chunk = result.output.find((file) => file.type === 'chunk');
  if (!chunk || chunk.type !== 'chunk') throw new Error('Missing fixture');
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('about:blank');
  await page.addScriptTag({ content: chunk.code });
  const resultStats = await page.evaluate(() =>
    (
      window as unknown as { NivoSamplingTest: typeof import('./fixtures/trace-sampling-harness') }
    ).NivoSamplingTest.exerciseTraceSampling(),
  );
  console.log(JSON.stringify({ resultStats, errors }));
  const legacy = resultStats.find((s) => s.mode === 'legacy')!;
  const independent = resultStats.find((s) => s.mode === 'independent')!;
  const production = resultStats.find((s) => s.mode === 'production')!;
  // Reproduce the old defect as a control, then test actual production setup.
  expect(legacy.checkpoints.every((c) => c.correlation64 > 0.99)).toBe(true);
  for (const c of production.checkpoints) {
    expect(Math.abs(c.correlation64)).toBeLessThan(0.05);
    expect(Math.abs(c.mean - 1)).toBeLessThan(0.02);
  }
  expect(production.checkpoints[2].rmse).toBeLessThan(production.checkpoints[0].rmse * 0.15);
  expect(production.checkpoints[2].rmse).toBeLessThan(independent.checkpoints[2].rmse * 0.3);
  for (const s of resultStats) expect(s.error).toBe(0);
  expect(errors).toEqual([]);
});
