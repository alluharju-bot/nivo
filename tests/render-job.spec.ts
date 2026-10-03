import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { decode } from 'fast-png';
import { makeBody } from '../src/model/project';
import { ready, save } from './helpers';

test('a finite render continues in Model using its frozen scene and downloads a real PNG', async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  const source = makeBody(300, 200, 300, [0, 0, 0], 'Renderöitävä osa');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await ready(page, [source]);
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  await page.getByRole('button', { name: 'Kuva', exact: true }).click();
  await page.getByLabel('Kuvan leveys', { exact: true }).selectOption('800');
  await page.getByLabel('Kuvan laskenta', { exact: true }).selectOption('path');
  await page.getByLabel('Kuvan näytemäärä', { exact: true }).selectOption('8');
  await page.getByRole('button', { name: 'Laske tarkka kuva', exact: true }).click();
  const card = page.getByRole('complementary', { name: 'Kuvan renderöinti', exact: true });
  await expect(card).toHaveAttribute('data-state', 'working');
  await page.getByRole('button', { name: 'Takaisin malliin', exact: true }).click();
  await page.getByRole('button', { name: 'Uusi projekti', exact: true }).click();
  await expect(page.locator('.object-list .object-select')).toHaveCount(0);
  await expect(card).toHaveAttribute('data-state', 'done', { timeout: 150_000 });
  const pending = page.waitForEvent('download');
  await card.getByRole('button', { name: 'Lataa valmis kuva', exact: true }).click();
  const file = await pending,
    data = await readFile((await file.path())!);
  expect(data.readUInt32BE(16)).toBe(800);
  const png = decode(data),
    values = new Set<number>();
  for (let i = 0; i < png.data.length; i += png.channels * 7) values.add(png.data[i]);
  expect(values.size).toBeGreaterThan(40); // The retained object, its shading and floor, not an empty image.
  await file.saveAs(info.outputPath('snapshot-render.png'));
  await page.screenshot({ path: info.outputPath('completed-render-in-model.png') });
  expect((await save(page)).bodies).toHaveLength(0);
  await card.getByRole('button', { name: 'Sulje kuvan tila', exact: true }).click();
  await expect(card).toBeHidden();
  expect(errors).toEqual([]);
});

test('render cancellation releases the job and preview reaches a sample target and restarts on a camera change', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await ready(page, [makeBody(200, 100, 40)]);
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  await page.getByRole('button', { name: 'Kuva', exact: true }).click();
  await page.getByLabel('Kuvan laskenta', { exact: true }).selectOption('path');
  await page.getByLabel('Kuvan näytemäärä', { exact: true }).selectOption('1024');
  await page.getByRole('button', { name: 'Laske tarkka kuva', exact: true }).click();
  await page.getByRole('button', { name: 'Keskeytä kuvan laskenta', exact: true }).click();
  await expect(
    page.getByRole('complementary', { name: 'Kuvan renderöinti', exact: true }),
  ).toHaveAttribute('data-state', 'cancelled');
  await expect(page.getByRole('button', { name: 'Laske tarkka kuva', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Tarkentuva', exact: true }).click();
  await page.getByLabel('Tarkennuksen tavoite', { exact: true }).selectOption('8');
  await expect(page.getByTestId('trace-status')).toContainText('Tavoite saavutettu', {
    timeout: 75_000,
  });
  await expect(page.getByTestId('render-canvas')).toHaveAttribute('data-trace-samples', '8');
  await page.getByRole('button', { name: 'Sovita malli', exact: true }).click();
  await expect(page.getByTestId('trace-status')).toContainText('Kuva tarkentuu');
  await expect(page.getByTestId('trace-status')).toContainText('Tavoite saavutettu', {
    timeout: 75_000,
  });
  await page.getByRole('button', { name: 'Nopea', exact: true }).click();
  await page.getByRole('button', { name: 'Valo', exact: true }).click();
  await page.getByText('Studion säädöt', { exact: true }).click();
  await page.getByLabel('Studiovalon suunta', { exact: true }).selectOption('90');
  await page.getByLabel('Studiovalojen voimakkuus', { exact: true }).selectOption('2');
  await page.getByLabel('Ympäristövalon voimakkuus', { exact: true }).selectOption('0.5');
  await page.getByRole('checkbox', { name: 'Studion lattia', exact: true }).uncheck();
  expect((await save(page)).settings.render).toMatchObject({
    lightRotation: 90,
    lightPower: 2,
    environmentPower: 0.5,
    ground: false,
  });
});
