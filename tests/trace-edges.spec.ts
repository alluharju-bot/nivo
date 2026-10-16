import { expect, test } from '@playwright/test';
import { build } from 'vite';
import { resolve } from 'node:path';
test('camera coverage stays crisp and denoising preserves diagonal silhouette antialiasing', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.text().includes('GL_INVALID'))
      errors.push(message.text());
  });
  const bundle = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      lib: {
        entry: resolve('tests/fixtures/trace-edges-harness.ts'),
        name: 'Edges',
        formats: ['iife'],
      },
    },
  });
  const result = Array.isArray(bundle) ? bundle[0] : bundle;
  if (!('output' in result)) throw Error();
  const chunk = result.output.find((c) => c.type === 'chunk')!;
  await page.goto('about:blank');
  await page.addScriptTag({ content: chunk.code });
  const results = await page.evaluate(() =>
    (
      window as unknown as { Edges: typeof import('./fixtures/trace-edges-harness') }
    ).Edges.exerciseTraceEdges(),
  );
  console.log(JSON.stringify(results));
  expect(errors).toEqual([]);
  const legacy = results[0],
    production = results[1];
  expect(production.rawError).toBeLessThan(legacy.rawError * 0.5);
  expect(production.filteredError).toBeLessThan(0.015);
  expect(production.filteredError).toBeLessThanOrEqual(production.rawError + 0.003);
  const noisy = results[2];
  expect(noisy.filteredError).toBeLessThan(noisy.rawError * 0.65);
  // Allow texture-filter interpolation rounding below one 8-bit step.
  for (const r of results) {
    expect(r.scaleError).toBeLessThan(0.003);
    expect(r.error).toBe(0);
    expect(r.opacityError).toBe(0);
    for (const error of Object.values(r.errors)) expect(error).toBe(0);
  }
});
