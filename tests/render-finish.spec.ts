import { expect, test } from '@playwright/test';
import { build } from 'vite';
import { resolve } from 'node:path';
import type * as fixture from './fixtures/render-finish-harness';

test('GPU denoising reduces bright and dark relative noise equally, preserves fine grain, and optional looks release memory', async ({
  page,
}) => {
  const bundle = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      lib: {
        entry: resolve('tests/fixtures/render-finish-harness.ts'),
        name: 'NivoFinishTest',
        formats: ['iife'],
      },
    },
  });
  const result = Array.isArray(bundle) ? bundle[0] : bundle;
  if (!('output' in result)) throw new Error('Expected fixture bundle');
  const chunk = result.output.find((file) => file.type === 'chunk');
  if (!chunk || chunk.type !== 'chunk') throw new Error('Missing fixture');
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text());
  });
  await page.goto('about:blank');
  await page.addScriptTag({ content: chunk.code });
  const stats = await page.evaluate(() => {
    const fixture = (
      window as unknown as { NivoFinishTest: typeof import('./fixtures/render-finish-harness') }
    ).NivoFinishTest;
    return { noise: fixture.exerciseDenoise(), look: fixture.exerciseGuidesAndLooks() };
  });
  console.log(JSON.stringify(stats));
  for (const trial of stats.noise.trials) {
    expect(trial.filtered[1]).toBeLessThan(trial.raw * 0.6);
    expect(trial.filtered[2]).toBeCloseTo(trial.filtered[1], 7);
  }
  expect(stats.noise.trials[1].filtered[1]).toBeLessThan(stats.noise.trials[1].prior * 0.6);
  expect(stats.noise.trials[0].filtered[1]).toBeCloseTo(stats.noise.trials[1].filtered[1], 5);
  expect(stats.noise.grain.filtered).toBeLessThan(stats.noise.grain.raw * 0.8);
  expect(stats.noise.grain.contrast).toBeCloseTo(1.2, 1);
  expect(stats.noise.error).toBe(0);
  expect(stats.look.error).toBe(0);
  expect(stats.look.retained && stats.look.reused).toBe(true);
  expect(stats.look.guideTextures).toBeGreaterThan(stats.look.baseTextures);
  expect(stats.look.released).toBe(stats.look.baseTextures);
  expect(stats.look.dream).toBeGreaterThan(1);
  expect(stats.look.mist).toBeGreaterThan(stats.look.dream);
  expect(stats.look.zero).toBe(0);
  expect(stats.look.reset).toBe(0);
  expect(errors).toEqual([]);
});
