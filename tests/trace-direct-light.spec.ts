import { expect, test } from '@playwright/test';
import { build } from 'vite';
import { resolve } from 'node:path';

test('shared direct-light evaluation preserves every HDR pixel and lighting channel', async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.text().includes('GL_INVALID')) errors.push(m.text());
  });
  const buildResult = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      lib: {
        entry: resolve('tests/fixtures/trace-direct-light-harness.ts'),
        name: 'DirectLight',
        formats: ['iife'],
      },
    },
  });
  const bundle = Array.isArray(buildResult) ? buildResult[0] : buildResult;
  if (!('output' in bundle)) throw Error();
  await page.goto('about:blank');
  await page.addScriptTag({ content: bundle.output.find((c) => c.type === 'chunk')!.code });
  const results = await page.evaluate(() =>
    (
      window as unknown as { DirectLight: typeof import('./fixtures/trace-direct-light-harness') }
    ).DirectLight.compareDirectLighting(),
  );
  console.log(JSON.stringify({ results, errors }));
  expect(errors).toEqual([]);
  for (const result of results) {
    expect(result.glError).toBe(0);
    expect(result.errors[0].energy).toBeGreaterThan(0);
    for (const channel of result.errors) {
      expect(channel.invalid).toBe(0);
      expect(channel.relativeError).toBeLessThan(0.0001);
    }
  }
});
