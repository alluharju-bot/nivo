import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { decode } from 'fast-png';
import { ready, save } from './helpers';
import { freshProject, makeBody } from '../src/model/project';
import { defaultAppearance } from '../src/model/materials';

test('an imported colored texture stays colored in progressive and background path tracing', async ({
  page,
}, info) => {
  test.setTimeout(240_000);
  await ready(page);
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ff2020';
    ctx.fillRect(0, 0, 32, 64);
    ctx.fillStyle = '#20ff20';
    ctx.fillRect(32, 0, 32, 64);
    return c.toDataURL();
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  const body = {
    ...makeBody(300, 200, 300),
    color: '#ffffff',
    appearance: {
      ...defaultAppearance('matte'),
      assetId: 'color-bars',
      maps: { bump: 'color-bars', roughness: 'color-bars' },
      texture: {
        width: 150,
        height: 150,
        offsetX: 17,
        offsetY: 23,
        rotation: 23,
        lockAspect: true,
      },
    },
  };
  await page.getByTestId('project-file').setInputFiles({
    name: 'texture.nivo',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        ...freshProject(),
        bodies: [body],
        assets: { 'color-bars': { name: 'Red and green', dataUrl, width: 64, height: 64 } },
      }),
    ),
  });
  await expect(page.locator('.object-list .object-select')).toHaveCount(1);
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  await page.getByRole('button', { name: 'Kuva', exact: true }).click();
  await page.getByRole('button', { name: 'Tarkentuva', exact: true }).click();
  await page.getByLabel('Tarkennuksen tavoite', { exact: true }).selectOption('8');
  await expect(page.getByTestId('trace-status')).toContainText('Tavoite saavutettu', {
    timeout: 100_000,
  });
  await expect(page.getByTestId('render-canvas')).toHaveAttribute('data-trace-tiles', '1');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Tallenna tarkentuva kuva PNG', exact: true }).click();
  const file = await pending;
  const png = decode(await readFile((await file.path())!));
  let red = 0,
    green = 0;
  for (let i = 0; i < png.data.length; i += png.channels) {
    const r = png.data[i],
      g = png.data[i + 1],
      b = png.data[i + 2];
    if (r > g * 1.5 && r > b * 1.5 && r > 80) red++;
    if (g > r * 1.5 && g > b * 1.5 && g > 80) green++;
  }
  await file.saveAs(info.outputPath('colored-trace.png'));
  expect(red).toBeGreaterThan(1000);
  expect(green).toBeGreaterThan(1000);
  await page.getByLabel('Kuvan leveys', { exact: true }).selectOption('800');
  await page.getByLabel('Kuvan laskenta', { exact: true }).selectOption('path');
  await page.getByLabel('Kuvan näytemäärä', { exact: true }).selectOption('8');
  await page.getByRole('button', { name: 'Laske tarkka kuva', exact: true }).click();
  const card = page.getByRole('complementary', { name: 'Kuvan renderöinti', exact: true });
  await page.getByRole('button', { name: 'Takaisin malliin', exact: true }).click();
  await expect(card).toHaveAttribute('data-state', 'done', { timeout: 150_000 });
  const pendingJob = page.waitForEvent('download');
  await card.getByRole('button', { name: 'Lataa valmis kuva', exact: true }).click();
  const jobFile = await pendingJob;
  const output = decode(await readFile((await jobFile.path())!));
  let colored = 0;
  for (let i = 0; i < output.data.length; i += output.channels) {
    const [r, g, b] = [output.data[i], output.data[i + 1], output.data[i + 2]];
    if ((r > g * 1.5 && r > b * 1.5 && r > 80) || (g > r * 1.5 && g > b * 1.5 && g > 80)) colored++;
  }
  expect(colored).toBeGreaterThan(1000);
  await jobFile.saveAs(info.outputPath('colored-background.png'));
  expect(errors).toEqual([]);
});

test('materials and lossless PBR maps can be assigned in Model and restored with their light settings', async ({
  page,
}, info) => {
  const body = makeBody(300, 200, 300);
  await ready(page, [body]);
  await page.getByTestId(`body-${body.id}`).click();
  await page.locator('.model-materials > summary').click();
  await page.getByLabel('Osan materiaali', { exact: true }).selectOption('melamine-warm-white');
  await page.getByRole('checkbox', { name: 'Valaiseva materiaali', exact: true }).check();
  await page.getByLabel('Valon voimakkuus', { exact: true }).fill('3');
  await page.getByLabel('Valon voimakkuus', { exact: true }).press('Enter');
  await page.getByText('Pinnan rakenne · PBR', { exact: true }).click();
  const url = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 8;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#8080ff';
    ctx.fillRect(0, 0, 8, 8);
    return c.toDataURL();
  });
  const upload = async (name: string) => {
    const fileChooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name, exact: true }).click();
    await (
      await fileChooser
    ).setFiles({
      name: 'normal.png',
      mimeType: 'image/png',
      buffer: Buffer.from(url.split(',')[1], 'base64'),
    });
    await expect(page.getByRole('button', { name: `Poista ${name}`, exact: true })).toBeVisible();
  };
  await upload('Normal-kartta');
  await upload('Karheuskartta');
  const model = await save(page);
  const appearance = model.bodies[0].appearance!;
  expect(appearance.preset).toBe('melamine-warm-white');
  expect(appearance.emission).toMatchObject({ enabled: true, intensity: 3 });
  expect(appearance.maps?.normal).toBeTruthy();
  expect(appearance.maps?.roughness).toBeTruthy();
  expect(model.assets![appearance.maps!.normal!].dataUrl.startsWith('data:image/png;')).toBe(true);
  expect(model.bodies[0].feature).toEqual(body.feature);
  await page.screenshot({ path: info.outputPath('model-materials.png') });
  await expect(page.locator('.save-status')).toContainText('Tallessa');
  await page.reload();
  expect((await save(page)).bodies[0].appearance).toEqual(appearance);
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Valo', exact: true })).toHaveCount(0);
  await expect(page.getByText('Osa valonlähteenä', { exact: true })).toBeVisible();
});
