import { test, expect } from '@playwright/test';
import { SphereGeometry } from 'three';
import { readFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';
import { makeBody, type Body } from '../src/model/project';
import { ready, save } from './helpers';

test('triangle counts, LOD comparison and downloads agree while the source remains unchanged', async ({
  page,
}, info) => {
  test.setTimeout(150000);
  const geometry = new SphereGeometry(100, 40, 24).translate(100, 100, 100);
  const body: Body = {
    ...makeBody(200, 200, 200, [100, 0, 0], 'Pyöreä osa'),
    feature: {
      type: 'mesh',
      width: 200,
      depth: 200,
      height: 200,
      solid: true,
      vertices: Array.from(geometry.getAttribute('position').array),
      normals: Array.from(geometry.getAttribute('normal').array),
      triangles: Array.from(geometry.index!.array),
    },
  };
  const triangles = geometry.index!.count / 3;
  const hidden = { ...makeBody(100, 100, 100, [400, 0, 0], 'Piilotettu'), hidden: true };
  const construction: Body = { ...makeBody(100, 100, 0, [0, 300, 0]), purpose: 'construction' };
  geometry.dispose();
  await ready(page, [body, hidden, construction]);
  const source = await save(page);
  await page.getByTestId(`body-${body.id}`).click();
  const stats = page.getByRole('button', { name: 'Kolmiot ja LOD', exact: true });
  await expect(stats).toHaveAttribute(
    'title',
    new RegExp(`Koko malli: ${(triangles + 12).toLocaleString('fi-FI')}`),
  );
  await stats.click();
  const dialog = page.getByRole('dialog', { name: 'Kolmiot ja LOD', exact: true });
  await expect(dialog.getByLabel('Viennin kohde')).toHaveValue('selection');
  await expect(dialog.getByLabel('Mallin kolmiomäärät')).toContainText(
    triangles.toLocaleString('fi-FI'),
  );
  await dialog.getByRole('button', { name: 'Laske ja vertaile LOD-versiot', exact: true }).click();
  const levels = dialog.getByRole('group', { name: 'LOD-vertailu' });
  await expect(levels).toBeVisible({ timeout: 90000 });
  const canvas = dialog.getByTestId('lod-preview');
  await expect(canvas).toHaveAttribute('data-triangles', String(triangles));
  const firstCanvas = await canvas.getAttribute('width');
  const firstCamera = await canvas.getAttribute('data-camera');
  const count: number[] = [triangles];
  for (const level of [1, 2]) {
    await levels.getByRole('button', { name: new RegExp(`^LOD${level}`) }).click();
    await expect
      .poll(async () => Number(await canvas.getAttribute('data-triangles')))
      .toBeLessThan(count[level - 1]);
    count.push(Number(await canvas.getAttribute('data-triangles')));
  }
  await dialog.getByRole('checkbox', { name: 'Näytä kolmioverkko' }).check();
  await expect(canvas).toHaveAttribute('data-wireframe', 'true');
  await expect(canvas).toHaveAttribute('width', firstCanvas!);
  await expect(canvas).toHaveAttribute('data-camera', firstCamera!);
  await canvas.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('lod-comparison.png') });
  const singlePending = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Lataa LOD2', exact: true }).click();
  const single = await readFile((await (await singlePending).path())!);
  expect(single.subarray(0, 4).toString()).toBe('glTF');
  const pending = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Lataa tiedosto', exact: true }).click();
  const zip = unzipSync(await readFile((await (await pending).path())!));
  const manifest = JSON.parse(new TextDecoder().decode(zip['manifest.json']));
  expect(manifest.levels.map((row: { triangles: number }) => row.triangles)).toEqual(count);
  expect(Buffer.from(zip['LOD2.glb'])).toEqual(single);
  await expect(dialog).toBeHidden();
  expect((await save(page)).bodies).toEqual(source.bodies);
  expect((await save(page)).settings).toEqual(source.settings);
});

test('LOD targets validate, cancellation recovers and simple geometry reports its real limit', async ({
  page,
}) => {
  test.setTimeout(90000);
  await ready(page, [makeBody(100, 100, 100)]);
  await page.getByRole('button', { name: 'Kolmiot ja LOD', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Kolmiot ja LOD', exact: true });
  await dialog.getByLabel('LOD2 tavoiteprosentti').fill('80');
  await expect(
    dialog.getByRole('button', { name: 'Laske ja vertaile LOD-versiot' }),
  ).toBeDisabled();
  await expect(dialog.getByRole('alert')).toContainText('LOD2');
  await dialog.getByLabel('LOD2 tavoiteprosentti').fill('10');
  await dialog.getByLabel('LOD1 tavoiteprosentti').fill('60');
  await dialog.getByRole('button', { name: 'Laske ja vertaile LOD-versiot' }).click();
  // Closing a pending job never changes the model or downloads its unfinished result.
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: 'Kolmiot ja LOD', exact: true }).click();
  await dialog.getByRole('button', { name: 'Laske ja vertaile LOD-versiot' }).click();
  const levels = dialog.getByRole('group', { name: 'LOD-vertailu' });
  await expect(levels).toBeVisible({ timeout: 60000 });
  await levels.getByRole('button', { name: /^LOD2/ }).click();
  await expect(dialog.getByTestId('lod-preview')).toHaveAttribute('data-triangles', '12');
  await expect(dialog.getByText(/Tavoiteprosenttia ei saavutettu/)).toBeVisible();
  // Changing the target invalidates old previews/downloads rather than exporting stale data.
  await dialog.getByLabel('LOD1 tavoiteprosentti').fill('70');
  await expect(levels).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Laske ja vertaile LOD-versiot' })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Sulje', exact: true }).click();
  expect((await save(page)).bodies).toHaveLength(1);
});
