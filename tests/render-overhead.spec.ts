import { test, expect, type Page } from '@playwright/test';
import { ready, save } from './helpers';
import { makeBody } from '../src/model/project';

const model = [
  makeBody(1000, 800, 20, [4200, -6000, -20], 'Pohja'),
  makeBody(200, 200, 200, [4550, -5750, 0], 'Osa'),
];
const lighting = (page: Page) =>
  page.getByTestId('render-canvas').evaluate((c) => JSON.parse(c.dataset.lighting!));
const setRange = async (page: Page, name: string, value: string) => {
  await page.getByRole('slider', { name, exact: true }).fill(value);
  await page.getByRole('slider', { name, exact: true }).dispatchEvent('pointerup');
};

test('overhead studio and sun preview, undo, switch off and survive reload without geometry rebuilds', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await ready(page, model);
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  await page.getByRole('button', { name: 'Valaistus', exact: true }).click();
  const canvas = page.getByTestId('render-canvas');
  const builds = await canvas.getAttribute('data-scene-builds');
  await page.getByRole('slider', { name: 'Studiovalon korkeus', exact: true }).fill('90');
  await expect.poll(async () => (await lighting(page)).studioElevation).toBe(90);
  for (const direction of (await lighting(page)).studioDirections) {
    expect(direction[0]).toBeCloseTo(0, 10);
    expect(direction[1]).toBeCloseTo(0, 10);
    expect(direction[2]).toBeCloseTo(1, 10);
  }
  await page
    .getByRole('slider', { name: 'Studiovalon korkeus', exact: true })
    .dispatchEvent('pointerup');
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  await expect.poll(async () => (await lighting(page)).studioElevation).toBeNull();
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Varjot', exact: true }).uncheck();
  await setRange(page, 'Studiovalojen voimakkuus', '0');
  await setRange(page, 'Ympäristövalon voimakkuus', '0');
  await expect(page.locator('.lighting-studio output').filter({ hasText: /^Pois$/ })).toHaveCount(
    2,
  );
  await page.getByRole('checkbox', { name: 'Aurinko', exact: true }).check();
  await setRange(page, 'Auringon korkeus', '90');
  expect((await lighting(page)).sunDirection[2]).toBeCloseTo(1, 10);
  await expect(canvas).toHaveAttribute('data-scene-builds', builds!);
  const stored = (await save(page)).settings.render;
  expect(stored).toMatchObject({
    lightElevation: 90,
    lightPower: 0,
    environmentPower: 0,
    shadows: false,
    sun: { enabled: true, elevation: 90 },
  });
  await expect(page.locator('.save-status')).toContainText('Tallessa selaimessa');
  await page.reload();
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  await expect.poll(async () => (await lighting(page)).studioElevation).toBe(90);
  expect((await lighting(page)).shadows).toBe(false);
  expect((await lighting(page)).sun).toEqual(stored!.sun);
  expect(errors).toEqual([]);
});

test('overhead and shadow controls update the progressive image without rebuilding its geometry', async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await ready(page, model);
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  await page.getByRole('button', { name: 'Kuva', exact: true }).click();
  await page.getByRole('button', { name: 'Tarkentuva', exact: true }).click();
  await page.getByLabel('Tarkennuksen tavoite', { exact: true }).selectOption('8');
  const canvas = page.getByTestId('render-canvas');
  await expect(canvas).toHaveAttribute('data-trace-samples', '8', { timeout: 90_000 });
  const builds = await canvas.getAttribute('data-trace-scene-builds');
  const uploads = await canvas.getAttribute('data-trace-material-uploads');
  const original = await canvas.screenshot();
  await page.getByRole('button', { name: 'Valaistus', exact: true }).click();
  await setRange(page, 'Studiovalon korkeus', '90');
  await expect(canvas).toHaveAttribute('data-trace-samples', '8', { timeout: 60_000 });
  await expect(canvas).toHaveAttribute('data-trace-material-uploads', uploads!);
  expect((await canvas.screenshot()).equals(original)).toBe(false);
  await page.getByRole('checkbox', { name: 'Varjot', exact: true }).uncheck();
  await expect(canvas).toHaveAttribute('data-trace-samples', '8', { timeout: 60_000 });
  const unshadowed = await canvas.screenshot({ path: info.outputPath('overhead-unshadowed.png') });
  await expect(canvas).toHaveAttribute('data-trace-opacity', '1');
  await page.getByRole('checkbox', { name: 'Varjot', exact: true }).check();
  await expect(canvas).toHaveAttribute('data-trace-samples', '8', { timeout: 60_000 });
  expect((await canvas.screenshot()).equals(unshadowed)).toBe(false);
  await expect(canvas).toHaveAttribute('data-trace-scene-builds', builds!);
  expect(errors).toEqual([]);
});
