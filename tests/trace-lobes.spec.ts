import { expect, test } from '@playwright/test';
import { build } from 'vite';
import { resolve } from 'node:path';
test('separate lighting channels conserve energy on glossy paint, chrome and float-blend fallback', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.text().includes('GL_INVALID')) errors.push(m.text());
  });
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      lib: {
        entry: resolve('tests/fixtures/trace-lobes-harness.ts'),
        name: 'Lobes',
        formats: ['iife'],
      },
    },
  });
  const bundle = Array.isArray(result) ? result[0] : result;
  if (!('output' in bundle)) throw Error();
  await page.goto('about:blank');
  await page.addScriptTag({ content: bundle.output.find((c) => c.type === 'chunk')!.code });
  const data = await page.evaluate(() =>
    (
      window as unknown as { Lobes: typeof import('./fixtures/trace-lobes-harness') }
    ).Lobes.exerciseLobes(),
  );
  console.log(JSON.stringify({ data, errors }));
  expect(errors).toEqual([]);
  for (const r of data) {
    expect(r.energy).toBeGreaterThan(0.02);
    expect(r.invalid).toBe(0);
    expect(r.alphaError).toBeLessThan(1e-5);
    expect(r.error).toBe(0);
    expect(r.filtered).toBeGreaterThan(0.94);
    expect(r.filtered).toBeLessThan(1.06);
  }
  expect(data[0].diffuse).toBeGreaterThan(0.5);
  expect(data[1].diffuse).toBeLessThan(0.001);
  expect(data[0].blendWidth).toBe(1);
  expect(data[2].blendWidth).toBe(64);
  expect(data[2].fallback).toBe(true);
  expect(Math.abs(data[3].energy / data[0].energy - 1)).toBeLessThan(0.015);
  const cancelled = await page.evaluate(() =>
    (
      window as unknown as { Lobes: typeof import('./fixtures/trace-lobes-harness') }
    ).Lobes.cancelCompilation(),
  );
  expect(cancelled.errors).toEqual([0, 0, 0]);
  expect(new Set(cancelled.counts).size).toBe(1);
  expect(errors).toEqual([]);
});
