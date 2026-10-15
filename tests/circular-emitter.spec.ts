import { expect, test } from '@playwright/test';
import { build } from 'vite';
import { resolve } from 'node:path';

test('circular LED sampling reduces speckles without doubling emission or filling its bounding square', async ({
  page,
}) => {
  test.setTimeout(120000);
  const bundle = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      lib: {
        entry: resolve('tests/fixtures/circular-emitter-harness.ts'),
        name: 'NivoCircularTest',
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
  await page.route('**/circular-emitter-fixture', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' }),
  );
  await page.goto('/circular-emitter-fixture');
  await page.addScriptTag({ content: chunk.code });
  const stats = await page.evaluate(() =>
    (
      window as unknown as {
        NivoCircularTest: typeof import('./fixtures/circular-emitter-harness');
      }
    ).NivoCircularTest.exerciseCircularEmitter(),
  );
  console.log(JSON.stringify(stats));
  expect(stats.lights).toBe(2);
  expect(stats.sampled).toBeLessThan(stats.unsampled * 0.2);
  expect(stats.referenceMean).toBeGreaterThan(0.001);
  expect(Math.abs(stats.sampledMean / stats.referenceMean - 1)).toBeLessThan(0.03);
  expect(Math.abs(stats.unsampledMean / stats.referenceMean - 1)).toBeLessThan(0.15);
  expect(Math.abs(stats.unsampledReferenceMean / stats.referenceMean - 1)).toBeLessThan(0.04);
  expect(Math.abs(stats.independentMean / stats.referenceMean - 1)).toBeLessThan(0.04);
  expect(stats.error).toBe(0);
  expect(errors).toEqual([]);
});
