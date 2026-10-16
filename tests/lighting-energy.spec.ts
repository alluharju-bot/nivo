import { expect, test } from '@playwright/test';
import { build } from 'vite';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

test('enclosed room receives indirect spotlight energy and preserves linear light power', async ({
  page,
}, info) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.text().includes('GL_INVALID')) errors.push(m.text());
  });
  const bundle = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      lib: {
        entry: resolve('tests/fixtures/lighting-energy-harness.ts'),
        name: 'LightingEnergy',
        formats: ['iife'],
      },
    },
  });
  const result = Array.isArray(bundle) ? bundle[0] : bundle;
  if (!('output' in result)) throw Error();
  await page.goto('about:blank');
  await page.addScriptTag({ content: result.output.find((c) => c.type === 'chunk')!.code });
  const stats = await page.evaluate(() =>
    (
      window as unknown as { LightingEnergy: typeof import('./fixtures/lighting-energy-harness') }
    ).LightingEnergy.exerciseLightingEnergy(),
  );
  for (const r of stats)
    await writeFile(info.outputPath(r.name + '.png'), Buffer.from(r.image.split(',')[1], 'base64'));
  console.log(JSON.stringify({ stats: stats.map(({ image, ...s }) => s), errors }));
  await info.attach('energy.json', {
    body: JSON.stringify(stats),
    contentType: 'application/json',
  });
  expect(errors).toEqual([]);
  for (const r of stats) expect(r.error).toBe(0);
  const byName = Object.fromEntries(stats.map((r) => [r.name, r]));
  expect(byName.direct.wall).toBeLessThan(1e-6);
  expect(byName.production.wall).toBeGreaterThan(0.015);
  expect(byName.production.mean).toBeGreaterThan(byName.direct.mean * 3);
  expect(byName.double.wall / byName.unclamped.wall).toBeCloseTo(2, 3);
  expect(byName.production.wall / byName.unclamped.wall).toBeCloseTo(1, 3);
  expect(byName['bright-production'].wall / byName['bright-unclamped'].wall).toBeCloseTo(1, 3);
});
