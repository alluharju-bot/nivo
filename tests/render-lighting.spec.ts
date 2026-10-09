import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { ready, save } from './helpers';
import { makeBody } from '../src/model/project';
import { defaultAppearance } from '../src/model/materials';
import { placeMaterial } from '../src/model/textureVariation';

const cabinet = [
  { ...makeBody(600, 580, 760, [0, 0, 0], 'Runko'), color: '#ded8c8' },
  {
    ...makeBody(296, 18, 754, [1, -20, 3], 'Pähkinäovi'),
    color: '#ffffff',
    appearance: defaultAppearance('pbr-american_walnut_veneer'),
  },
  {
    ...makeBody(296, 18, 754, [303, -20, 3], 'Pähkinäovi 2'),
    color: '#ffffff',
    appearance: defaultAppearance('pbr-american_walnut_veneer'),
  },
  { ...makeBody(630, 610, 28, [-15, -25, 760], 'Taso'), color: '#dad6cf' },
].map((body) => ({
  ...body,
  ...(body.appearance
    ? { appearance: placeMaterial({ ...body, appearance: undefined }, body.appearance) }
    : {}),
}));
const lighting = (page: Page) =>
  page.getByTestId('render-canvas').evaluate((c) => JSON.parse(c.dataset.lighting!));

test('sun, PBR, glass and the full preview spotlight budget coexist', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await ready(page, [
    ...cabinet,
    { ...makeBody(200, 8, 500, [700, 0, 0]), appearance: defaultAppearance('glass-clear') },
    ...Array.from({ length: 10 }, (_, i) => ({
      ...makeBody(30, 30, 10, [i * 100 - 200, -200, 950]),
      appearance: {
        ...defaultAppearance('matte'),
        emission: {
          enabled: true,
          type: 'spot' as const,
          color: '#ffe6c5',
          intensity: 5,
          angle: 45,
          direction: '-z' as const,
        },
      },
    })),
  ]);
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  await page.getByRole('button', { name: 'Valaistus', exact: true }).click();
  await page
    .getByRole('button', { name: 'Päivänvalo Raikas, suunnattu valo', exact: true })
    .click();
  const canvas = page.getByTestId('render-canvas');
  await expect(canvas).toHaveAttribute('data-spot-lights', '10');
  await expect(canvas).toHaveAttribute('data-environment', 'studio-hdri');
  await canvas.screenshot();
  expect(errors).toEqual([]);
});

test('immediate image export waits for the reflection environment', async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/environment.hdr', async (route) => {
    await held;
    await route.continue();
  });
  await ready(page, [makeBody(300, 200, 60)]);
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  await page.getByRole('button', { name: 'Kuva', exact: true }).click();
  await page.getByLabel('Kuvan leveys', { exact: true }).selectOption('800');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Tallenna PNG', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Tallennetaan kuvaa…', exact: true }),
  ).toBeDisabled();
  release();
  const png = await readFile((await (await download).path())!);
  expect(png.readUInt32BE(16)).toBe(800);
  await expect(page.getByTestId('render-canvas')).toHaveAttribute(
    'data-environment',
    'studio-hdri',
  );
});

test('sun controls preview during a gesture, undo together, cancel with Esc and survive reload', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await ready(page, cabinet);
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  await page.getByRole('button', { name: 'Valaistus', exact: true }).click();
  await page
    .getByRole('button', { name: 'Päivänvalo Raikas, suunnattu valo', exact: true })
    .click();
  const canvas = page.getByTestId('render-canvas');
  const builds = await canvas.getAttribute('data-scene-builds');
  const original = await canvas.screenshot();
  const compass = page.getByRole('slider', { name: 'Auringon suunta', exact: true });
  const rect = (await compass.boundingBox())!;
  await page.mouse.move(rect.x + rect.width - 15, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height - 15, { steps: 8 });
  await expect.poll(async () => (await lighting(page)).sun.azimuth).toBe(180);
  expect((await canvas.screenshot()).equals(original)).toBe(false);
  await page.mouse.up();
  const changed = await save(page);
  expect(changed.settings.render?.sun?.azimuth).toBe(180);
  expect(changed.bodies).toEqual(cabinet);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  await expect(compass).toHaveAttribute('aria-valuenow', '135');
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  await expect(compass).toHaveAttribute('aria-valuenow', '180');
  const exposure = page.getByLabel('Valotus', { exact: true });
  await exposure.fill('1.8'); // An unfinished gesture is transient.
  await page.keyboard.press('Escape');
  await expect(exposure).toHaveValue('1');
  await expect(canvas).toBeVisible();
  await page.getByLabel('Auringon voimakkuus', { exact: true }).fill('1.4');
  await page.getByLabel('Auringon voimakkuus', { exact: true }).dispatchEvent('pointerup');
  await page.getByRole('button', { name: 'Valon sävy: Lämmin', exact: true }).click();
  await page.getByLabel('Auringon varjojen pehmeys', { exact: true }).fill('3');
  await page.getByLabel('Auringon varjojen pehmeys', { exact: true }).dispatchEvent('pointerup');
  await expect(canvas).toHaveAttribute('data-scene-builds', builds!);
  await page.screenshot({ path: info.outputPath('sun-lighting.png') });
  await page.getByRole('button', { name: 'Kuva', exact: true }).click();
  await page.getByLabel('Kuvan ilme', { exact: true }).selectOption('filmic');
  const stored = (await save(page)).settings.render;
  expect(stored).toMatchObject({
    look: 'filmic',
    sun: { enabled: true, power: 1.4, color: '#ffe1b3', softness: 3, azimuth: 180 },
  });
  await expect(page.locator('.save-status')).toContainText('Tallessa selaimessa');
  await page.reload();
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  await expect.poll(async () => (await lighting(page)).sun).toEqual(stored!.sun);
  expect((await lighting(page)).look).toBe('filmic');
  expect(errors).toEqual([]);
});

test('sun changes resume refinement without rebuilding geometry or reuploading PBR maps', async ({
  page,
}, info) => {
  // Shader preparation plus 256 full-resolution samples can exceed three
  // minutes on the test laptop. This checks completion, not GPU throughput.
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await ready(page, cabinet);
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  await page.getByRole('button', { name: 'Valaistus', exact: true }).click();
  await page
    .getByRole('button', { name: 'Päivänvalo Raikas, suunnattu valo', exact: true })
    .click();
  await page.getByRole('button', { name: 'Kuva', exact: true }).click();
  await page.getByRole('button', { name: 'Tarkentuva', exact: true }).click();
  await page.getByLabel('Tarkennuksen tavoite', { exact: true }).selectOption('8');
  const canvas = page.getByTestId('render-canvas');
  await expect(canvas).toHaveAttribute('data-trace-samples', '8', { timeout: 90_000 });
  const builds = await canvas.getAttribute('data-trace-scene-builds');
  const uploads = await canvas.getAttribute('data-trace-material-uploads');
  await expect(canvas).toHaveAttribute('data-trace-opacity', '1');
  const before = await canvas.screenshot();
  await page.getByRole('button', { name: 'Valaistus', exact: true }).click();
  await page.getByRole('slider', { name: 'Auringon suunta', exact: true }).press('Home');
  await expect(canvas).toHaveAttribute('data-trace-samples', '8', { timeout: 60_000 });
  await expect(canvas).toHaveAttribute('data-trace-opacity', '1');
  expect((await canvas.screenshot()).equals(before)).toBe(false);
  await expect(canvas).toHaveAttribute('data-trace-material-uploads', uploads!);
  await expect(canvas).toHaveAttribute('data-trace-scene-builds', builds!);
  await page.getByRole('button', { name: 'Kuva', exact: true }).click();
  const natural = await canvas.screenshot();
  await page.getByLabel('Kuvan ilme', { exact: true }).selectOption('filmic');
  await expect(canvas).toHaveAttribute('data-trace-samples', '8');
  expect((await canvas.screenshot()).equals(natural)).toBe(false);
  await expect(canvas).toHaveAttribute('data-trace-scene-builds', builds!);
  await page.getByLabel('Esikatselun tarkkuus', { exact: true }).selectOption('full');
  await page.getByLabel('Tarkennuksen tavoite', { exact: true }).selectOption('256');
  await expect(canvas).toHaveAttribute('data-trace-samples', '256', { timeout: 180_000 });
  await expect(canvas).toHaveAttribute('data-trace-opacity', '1');
  await canvas.screenshot({ path: info.outputPath('filmic-walnut.png') });
  expect(errors).toEqual([]);
});
