import { expect, test } from '@playwright/test';
import { build } from 'vite';
import { resolve } from 'node:path';
test('glossy noise decreases while reflected edges and one-pixel albedo detail remain', async ({
  page,
}) => {
  const built = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      lib: {
        entry: resolve('tests/fixtures/reflection-denoise-harness.ts'),
        name: 'Reflections',
        formats: ['iife'],
      },
    },
  });
  const bundle = Array.isArray(built) ? built[0] : built;
  if (!('output' in bundle)) throw Error();
  await page.goto('about:blank');
  await page.addScriptTag({ content: bundle.output.find((c) => c.type === 'chunk')!.code });
  const result = await page.evaluate(() =>
    (
      window as unknown as { Reflections: typeof import('./fixtures/reflection-denoise-harness') }
    ).Reflections.exerciseReflectedDetail(),
  );
  console.log(JSON.stringify(result));
  expect(result.error).toBe(0);
  expect(result.filtered).toBeLessThan(result.raw * 0.7);
  expect(result.brightness).toBeGreaterThan(0.95);
  expect(result.brightness).toBeLessThan(1.05);
  expect(result.contrast).toBeGreaterThan(0.95);
  expect(result.grain).toBeGreaterThan(0.9);
});
