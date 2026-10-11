import { expect, test } from '@playwright/test';
import { makeBody } from '../src/model/project';
import { ready, save } from './helpers';

test('focal length previews immediately, preserves pose, saves and restores without a geometry rebuild', async ({
  page,
}) => {
  await ready(page, [makeBody(600, 400, 300)]);
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  await page.getByRole('button', { name: 'Kuva', exact: true }).click();
  const canvas = page.getByTestId('render-canvas');
  const camera = async () => JSON.parse((await canvas.getAttribute('data-camera'))!);
  const before = await camera();
  const builds = await canvas.getAttribute('data-scene-builds');
  await page.getByRole('button', { name: 'Tarkentuva', exact: true }).click();
  await page.getByLabel('Tarkennuksen tavoite', { exact: true }).selectOption('8');
  await expect(page.getByTestId('trace-status')).toContainText('Tavoite saavutettu', {
    timeout: 120000,
  });
  const traceBuilds = await canvas.getAttribute('data-trace-scene-builds');
  await page.getByRole('button', { name: '50 mm', exact: true }).click();
  await expect.poll(async () => (await camera()).focalLength).toBeCloseTo(50);
  expect((await camera()).position).toEqual(before.position);
  expect((await camera()).target).toEqual(before.target);
  expect((await camera()).fov).toBeLessThan(before.fov);
  await page.getByLabel('Polttoväli millimetreinä', { exact: true }).fill('24');
  await expect.poll(async () => (await camera()).focalLength).toBeCloseTo(24);
  await expect(canvas).toHaveAttribute('data-scene-builds', builds!);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('trace-status')).toContainText('Tavoite saavutettu', {
    timeout: 120000,
  });
  await expect(canvas).toHaveAttribute('data-trace-scene-builds', traceBuilds!);
  await canvas.screenshot({ path: test.info().outputPath('render-24mm.png') });
  await page.keyboard.press('Escape');
  expect((await save(page)).settings.render?.focalLength).toBe(24);
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  await expect.poll(async () => (await camera()).focalLength).toBeCloseTo(24);
});
