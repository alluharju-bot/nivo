import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { decode } from 'fast-png';
import { makeBody } from '../src/model/project';
import { defaultAppearance } from '../src/model/materials';
import { ready, save } from './helpers';

const difference = (a: Buffer, b: Buffer) => {
  const x = decode(a),
    y = decode(b);
  return Array.from(x.data).reduce((sum, n, i) => sum + Math.abs(n - y.data[i]), 0) / x.data.length;
};

test('looks update a finished render without resetting samples, persist, and appear in raster and traced exports', async ({
  page,
}, info) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  const bodies = [
    {
      ...makeBody(400, 200, 25),
      color: '#ffffff',
      appearance: defaultAppearance('pbr-american_walnut_veneer'),
    },
    {
      ...makeBody(80, 80, 100, [40, 60, 25]),
      color: '#faf9f7',
      appearance: defaultAppearance('porcelain'),
    },
    { ...makeBody(80, 80, 50, [220, 60, 25]), appearance: defaultAppearance('brass') },
  ];
  await ready(page, bodies);
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  await page.getByRole('button', { name: 'Kuva', exact: true }).click();
  const canvas = page.getByTestId('render-canvas');
  await page.getByLabel('Tarkennuksen tavoite', { exact: true }).selectOption('8');
  await expect(page.getByTestId('trace-status')).toContainText('Tavoite saavutettu', {
    timeout: 120000,
  });
  const baseline = await save(page),
    base = await canvas.screenshot();
  const builds = await canvas.getAttribute('data-trace-scene-builds');
  for (const look of ['soft', 'dream', 'mist']) {
    await page.getByLabel('Kuvan ilme', { exact: true }).selectOption(look);
    await expect(canvas).toHaveAttribute('data-trace-samples', '8');
    await expect(canvas).toHaveAttribute('data-trace-scene-builds', builds!);
    const picture = await canvas.screenshot();
    expect(difference(base, picture)).toBeGreaterThan(0.2);
    await canvas.screenshot({ path: info.outputPath(`look-${look}.png`) });
  }
  await page.getByLabel('Tehosteen voimakkuus', { exact: true }).fill('0.85');
  await page.getByLabel('Tehosteen voimakkuus', { exact: true }).dispatchEvent('pointerup');
  const saved = await save(page);
  expect(saved.settings.render).toMatchObject({ look: 'mist', lookStrength: 0.85 });
  expect(saved.bodies).toEqual(baseline.bodies);
  await page.getByLabel('Kuvan ilme', { exact: true }).selectOption('standard');
  expect(difference(base, await canvas.screenshot())).toBeLessThan(0.1);
  await page.getByLabel('Kuvan ilme', { exact: true }).selectOption('dream');
  await page.getByRole('button', { name: 'Nopea', exact: true }).click();
  const dreamRaster = await canvas.screenshot();
  await page.getByLabel('Kuvan ilme', { exact: true }).selectOption('standard');
  expect(difference(dreamRaster, await canvas.screenshot())).toBeGreaterThan(1);
  await page.getByLabel('Kuvan ilme', { exact: true }).selectOption('mist');
  await page.getByLabel('Kuvan leveys', { exact: true }).selectOption('800');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Tallenna PNG/ }).click();
  const file = await download;
  const png = await readFile((await file.path())!);
  expect(png.readUInt32BE(16)).toBe(800);
  await file.saveAs(info.outputPath('mist-raster-export.png'));
  await page.getByLabel('Kuvan laskenta', { exact: true }).selectOption('path');
  await page.getByLabel('Kuvan näytemäärä', { exact: true }).selectOption('8');
  await page.getByRole('button', { name: 'Laske tarkka kuva', exact: true }).click();
  await page.getByLabel('Kuvan ilme', { exact: true }).selectOption('standard');
  const job = page.getByRole('complementary', { name: 'Kuvan renderöinti', exact: true });
  await expect(job).toHaveAttribute('data-state', 'done', { timeout: 120000 });
  const finalDownload = page.waitForEvent('download');
  await job.getByRole('button', { name: 'Lataa valmis kuva', exact: true }).click();
  await (await finalDownload).saveAs(info.outputPath('mist-trace-export.png'));
  await page.getByLabel('Kuvan ilme', { exact: true }).selectOption('dream');
  await expect(page.locator('.save-status')).toContainText('Tallessa selaimessa');
  await page.reload();
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  await page.getByRole('button', { name: 'Kuva', exact: true }).click();
  await expect(page.getByLabel('Kuvan ilme', { exact: true })).toHaveValue('dream');
  await expect(page.getByLabel('Tehosteen voimakkuus', { exact: true })).toHaveValue('0.85');
  expect(errors).toEqual([]);
});
