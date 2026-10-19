import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { makeBody } from '../src/model/project';
import { defaultAppearance } from '../src/model/materials';
import { ready, save, view, editBody } from './helpers';
test.describe.configure({ timeout: 180000 });

test('editable stencil, image and drawn markings persist, compose and export', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const body = {
    ...makeBody(600, 400, 30, [0, 0, 0], 'Metallipaneeli'),
    color: '#ffffff',
    appearance: defaultAppearance('iron-black'),
  };
  await ready(page, [body]);
  await page.getByTestId(`body-${body.id}`).click();
  let project = await view(page, [body]);
  await page.keyboard.press('p');
  await page.getByRole('button', { name: 'Tarrat ja kuviot', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Pintakerrokset', exact: true });
  await panel.getByLabel('Tarran teksti', { exact: true }).fill('NIVO 07');
  await panel.getByLabel('Tarran leveys (mm)', { exact: true }).fill('240');
  await panel.getByRole('button', { name: 'Aseta tarra pinnalle', exact: true }).click();
  project = await view(page, [body]);
  const at = project(300, 270, 30);
  await page.mouse.click(at.x, at.y);
  await expect(panel.locator('.surface-layer-card')).toHaveCount(1);
  const card = panel.locator('.surface-layer-card').first();
  let saved = await save(page);
  const layer = Object.values(saved.bodies[0].faceMaterials!)[0].appearance.layers![0];
  expect(layer.decal).toMatchObject({ type: 'text', text: 'NIVO 07' });
  expect(layer.center![0]).toBeCloseTo(300, 0);
  expect(layer.width).toBe(240);
  await card.getByLabel('Tarran teksti', { exact: true }).fill('BLAST DOOR');
  await card.getByLabel('Tarran kirjasin').selectOption('mono');
  await card.getByLabel('Tarran kiilto (%)').fill('75');
  await card.getByLabel('Tarran kiilto (%)').press('Enter');
  expect(
    Object.values((await save(page)).bodies[0].faceMaterials!)[0].appearance.layers![0].roughness,
  ).toBe(0.25);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect(
    Object.values((await save(page)).bodies[0].faceMaterials!)[0].appearance.layers![0].roughness,
  ).toBe(0.8);
  // Import a transparent vector logo via the native file chooser.
  await panel.locator('.decal-new > summary').click();
  await panel
    .getByLabel('Tarran kuvatiedosto', { exact: true })
    .first()
    .setInputFiles({
      name: 'triangle.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M50 5L95 95H5Z" fill="#ffbb33"/></svg>',
      ),
    });
  await expect(
    panel.locator('.decal-new').getByRole('button', { name: 'Vaihda kuva' }),
  ).toBeVisible();
  await panel.getByRole('button', { name: 'Aseta tarra pinnalle', exact: true }).click();
  project = await view(page, [body]);
  const imageAt = project(180, 160, 30);
  await page.mouse.click(imageAt.x, imageAt.y);
  await expect(panel.locator('.surface-layer-card')).toHaveCount(2);
  await panel.locator('.decal-new > summary').click();
  await panel.getByRole('button', { name: 'Piirrä', exact: true }).first().click();
  await panel.locator('.decal-new').getByLabel('Kuvion piirtotyökalu').selectOption('rectangle');
  await panel.getByLabel('Täyttö', { exact: true }).check();
  const canvas = panel.getByLabel('Tarran esikatselu ja piirto').first();
  const r = (await canvas.boundingBox())!;
  await page.mouse.move(r.x + r.width * 0.15, r.y + r.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(r.x + r.width * 0.85, r.y + r.height * 0.7, { steps: 8 });
  await page.mouse.up();
  await panel.getByRole('button', { name: 'Aseta tarra pinnalle', exact: true }).click();
  project = await view(page, [body]);
  const drawnAt = project(420, 160, 30);
  await page.mouse.click(drawnAt.x, drawnAt.y);
  await expect(panel.locator('.surface-layer-card')).toHaveCount(3);
  saved = await save(page);
  const layers = Object.values(saved.bodies[0].faceMaterials!)[0].appearance.layers!;
  expect(layers.map((l) => l.decal!.type)).toEqual(['text', 'image', 'drawing']);
  expect(saved.assets).toBeTruthy();
  await page.reload();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
  expect((await save(page)).bodies[0].faceMaterials).toEqual(saved.bodies[0].faceMaterials);
  const exporter = page.getByRole('button', { name: 'Vie 3D-malli', exact: true });
  if (!(await exporter.isVisible()))
    await page.getByRole('button', { name: 'Lisää toimintoja', exact: true }).click();
  await exporter.click();
  const dialog = page.getByRole('dialog', { name: 'Vie 3D-malli', exact: true });
  await dialog.getByLabel('3D-tiedostomuoto').selectOption('glb');
  await dialog.getByLabel('Viennin kohde').selectOption('visible');
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Lataa tiedosto', exact: true }).click();
  const buffer = await readFile((await (await download).path())!);
  const json = JSON.parse(buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString());
  expect(json.images.length).toBeGreaterThanOrEqual(3);
  expect(buffer.length).toBeGreaterThan(10000);
  await page.screenshot({ path: info.outputPath('decals-model.png') });
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  await page.getByRole('button', { name: 'Kuva', exact: true }).click();
  await page.getByRole('button', { name: 'Tarkentuva', exact: true }).click();
  await page.getByLabel('Tarkennuksen tavoite', { exact: true }).selectOption('8');
  await expect(page.getByTestId('trace-status')).toContainText('Tavoite saavutettu', {
    timeout: 100000,
  });
  await page.screenshot({ path: info.outputPath('decals-traced.png') });
  expect(errors).toEqual([]);
});

test('manual wear paints on a face, erases, cancels and undoes one gesture at a time', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const body = {
    ...makeBody(500, 300, 20),
    color: '#ffffff',
    appearance: defaultAppearance('painted-metal-chipped'),
  };
  await ready(page, [body]);
  await page.getByTestId(`body-${body.id}`).click();
  let project = await view(page, [body]);
  await page.keyboard.press('p');
  await page.getByRole('button', { name: 'Pintakerrokset', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Pintakerrokset', exact: true });
  await panel.getByLabel('Kulumakuvion ohjaus').selectOption('manual');
  await panel.getByRole('button', { name: 'Maalaa kulumaa pinnalle', exact: true }).click();
  project = await view(page, [body]);
  const a = project(160, 160, 20),
    b = project(340, 160, 20);
  await page.mouse.move(a.x, a.y);
  await expect(page.locator('canvas[data-wear-brush="true"]')).toHaveCount(1);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 12 });
  await page.mouse.up();
  let saved = await save(page);
  let layer = Object.values(saved.bodies[0].faceMaterials!)[0].appearance.layers![0];
  expect(layer.strokes).toHaveLength(1);
  expect(layer.strokes![0].points.length).toBeGreaterThan(2);
  expect(layer.strokes![0].points[0][0]).toBeCloseTo(160, 0);
  await panel.getByLabel('Kumita maalattua kulumaa').check();
  project = await view(page, [body]);
  const c = project(250, 160, 20);
  await page.mouse.click(c.x, c.y);
  saved = await save(page);
  layer = Object.values(saved.bodies[0].faceMaterials!)[0].appearance.layers![0];
  expect(layer.strokes).toHaveLength(2);
  expect(layer.strokes![1].erase).toBe(true);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect(
    Object.values((await save(page)).bodies[0].faceMaterials!)[0].appearance.layers![0].strokes,
  ).toHaveLength(1);
  // Hidden layers cannot accept invisible brush edits.
  await panel.getByRole('button', { name: 'Piilota kerros 1', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Lopeta kuluman maalaus' })).toBeDisabled();
  await expect(page.locator('canvas[data-wear-brush="true"]')).toHaveCount(0);
  await panel.getByRole('button', { name: 'Näytä kerros 1', exact: true }).click();
  // Cancel an unfinished gesture without adding an undo entry or changing the mask.
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect(
    Object.values((await save(page)).bodies[0].faceMaterials!)[0].appearance.layers![0].strokes,
  ).toHaveLength(1);
  const captured = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Tallenna näkymä PNG', exact: true }).click();
  await (await captured).saveAs(info.outputPath('manual-wear-surface.png'));
  await page.screenshot({ path: info.outputPath('manual-wear.png') });
  await page.reload();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
  expect(
    Object.values((await save(page)).bodies[0].faceMaterials!)[0].appearance.layers![0].strokes,
  ).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('procedural palette and hand-painted wear also work on a curved cylinder', async ({
  page,
}, info) => {
  const { makeProfileBody } = await import('../src/model/project');
  const { sketchFrame } = await import('../src/model/sketch');
  const body = {
    ...makeProfileBody(
      { kind: 'circle' as const, radius: 100 },
      sketchFrame([0, 0, 0]),
      240,
      'Rautasylinteri',
    ),
    color: '#ffffff',
    appearance: defaultAppearance('painted-metal-chipped'),
  };
  await ready(page, [body]);
  await page.getByTestId(`body-${body.id}`).click();
  await page.keyboard.press('p');
  await page.getByRole('button', { name: 'Pintakerrokset', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Pintakerrokset', exact: true });
  await panel.getByLabel('Kulumakuvion ohjaus').selectOption('manual');
  await panel.getByRole('button', { name: 'Maalaa kulumaa pinnalle', exact: true }).click();
  const project = await view(page, [body], 'front');
  const a = project(-50, -100, 120),
    b = project(50, -100, 120);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 12 });
  await page.mouse.up();
  const painted = (await save(page)).bodies[0];
  const [paintedFace, surface] = Object.entries(painted.faceMaterials!).find(([, f]) =>
    f.appearance.layers?.some((l) => l.strokes?.length),
  )!;
  const layer = surface.appearance.layers![0];
  expect(layer.strokes).toHaveLength(1);
  expect(
    Object.values(painted.faceMaterials!).filter((f) =>
      f.appearance.layers?.some((l) => l.strokes?.length),
    ),
  ).toHaveLength(1);
  expect(layer.strokes![0].points.length).toBeGreaterThan(5);
  await page.keyboard.press('Escape');
  const captured = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Tallenna näkymä PNG', exact: true }).click();
  await (await captured).saveAs(info.outputPath('curved-manual-wear-surface.png'));
  await page.screenshot({ path: info.outputPath('curved-manual-wear.png') });
  for (const id of ['iron-black', 'rubber-fine', 'rubber-ribbed', 'carbon-fiber']) {
    await panel.getByLabel('Pohjamateriaali').selectOption(id);
    expect((await save(page)).bodies[0].faceMaterials![paintedFace].appearance.preset).toBe(id);
  }
  await page.screenshot({ path: info.outputPath('carbon-fiber-under-paint.png') });
  const original = (await save(page)).bodies[0];
  expect(original.faceMaterials![paintedFace].appearance.surfaceMapping?.kind).toBe('cylinder');
  await page.keyboard.press('Escape');
  await editBody(page, body.id);
  await page.getByRole('button', { name: 'Verkko ja pinta', exact: true }).first().click();
  const workspace = page.getByRole('dialog', { name: 'Verkko ja pinta', exact: true });
  await workspace.getByRole('button', { name: 'UV-kartta', exact: true }).click();
  await workspace.getByLabel('Pintakartan koko').selectOption('128');
  await workspace.getByRole('button', { name: 'Luo UV-kartta', exact: true }).click();
  await expect(workspace.getByRole('status')).toContainText('pintavärit siirretty', {
    timeout: 60000,
  });
  await workspace.getByRole('button', { name: 'Lisää työversio projektiin', exact: true }).click();
  await expect(workspace).toHaveCount(0);
  const result = await save(page);
  expect(result.bodies[0].faceMaterials).toEqual(original.faceMaterials);
  expect(result.bodies[1].appearance!.layers).toBeUndefined();
  expect(result.bodies[1].appearance!.atlasMaps).toBe(true);
});

test('procedural carbon, black iron, rubber and chipped steel render together', async ({
  page,
}, info) => {
  const { findPreset } = await import('../src/model/materials');
  const bodies = ['iron-black', 'rubber-fine', 'carbon-fiber', 'painted-metal-chipped'].map(
    (id, i) => ({
      ...makeBody(90, 160, 8, [i * 110, 0, 0], findPreset(id).name),
      color: findPreset(id).color,
      appearance: defaultAppearance(id),
    }),
  );
  await ready(page, bodies);
  const captured = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Tallenna näkymä PNG', exact: true }).click();
  await (await captured).saveAs(info.outputPath('procedural-palette.png'));
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  await page.getByRole('button', { name: 'Kuva', exact: true }).click();
  await page.getByRole('button', { name: 'Tarkentuva', exact: true }).click();
  await page.getByLabel('Tarkennuksen tavoite', { exact: true }).selectOption('8');
  await expect(page.getByTestId('trace-status')).toContainText('Tavoite saavutettu', {
    timeout: 100000,
  });
  await page.screenshot({ path: info.outputPath('procedural-palette-traced.png') });
});
