import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { makeBody } from '../src/model/project';
import { materialPresets, defaultAppearance } from '../src/model/materials';
import { click, ready, save, view } from './helpers';

test('iron finishes paint, persist and export their colour, normal and PBR masks', async ({
  page,
}, info) => {
  const irons = materialPresets.filter((p) => p.id.startsWith('iron-'));
  const bodies = irons.map((p, i) => makeBody(180, 180, 40, [i * 220, 0, 0], p.name));
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await ready(page, bodies);
  const point = await view(page, bodies);
  await page.keyboard.press('p');
  for (const [i, iron] of irons.entries()) {
    await page.getByLabel('Pensselin materiaali', { exact: true }).selectOption(iron.id);
    await click(page, point(i * 220 + 90, 90, 40));
  }
  const painted = await save(page);
  expect(painted.bodies.map((b) => b.appearance?.preset)).toEqual(irons.map((p) => p.id));
  await page.keyboard.press('Escape');
  await page.mouse.move(10, 10);
  await page.screenshot({ path: info.outputPath('iron-modeling.png') });
  await expect(page.getByText('Tallessa selaimessa', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '3');
  expect((await save(page)).bodies.map((b) => b.appearance)).toEqual(
    painted.bodies.map((b) => b.appearance),
  );
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  await expect(page.getByTestId('render-canvas')).toBeVisible();
  await page.screenshot({ path: info.outputPath('iron-render.png') });
  await page.getByRole('button', { name: 'Malli', exact: true }).click();
  const exportButton = page.getByRole('button', { name: 'Vie 3D-malli', exact: true });
  if (!(await exportButton.isVisible()))
    await page.getByRole('button', { name: 'Lisää toimintoja', exact: true }).click();
  await exportButton.click();
  const dialog = page.getByRole('dialog', { name: 'Vie 3D-malli', exact: true });
  await dialog.getByLabel('Viennin kohde').selectOption('visible');
  await dialog.getByLabel('3D-tiedostomuoto').selectOption('glb');
  const pending = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Lataa tiedosto', exact: true }).click();
  const file = await pending;
  const buffer = await readFile((await file.path())!);
  const gltf = JSON.parse(buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString());
  expect(gltf.materials).toHaveLength(3);
  for (const material of gltf.materials) {
    expect(material.pbrMetallicRoughness.baseColorTexture).toBeDefined();
    expect(material.pbrMetallicRoughness.metallicRoughnessTexture).toBeDefined();
    expect(material.normalTexture).toBeDefined();
  }
  expect(
    gltf.images.every((image: { bufferView?: number }) => image.bufferView !== undefined),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test('metal collection renders, refines, changes finish and saves the patina', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop');
  test.setTimeout(150000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  const metals = materialPresets.filter((p) => p.category === 'Metallit');
  const bodies = metals.map((p, i) => ({
    ...makeBody(160, 160, 60, [(i % 4) * 200, Math.floor(i / 4) * 200, 0], p.name),
    color: p.color,
    appearance: defaultAppearance(p.id),
  }));
  await ready(page, bodies);
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  await page.getByLabel('Materiaaliryhmä', { exact: true }).selectOption('Metallit');
  await expect(page.locator('.material-swatches').getByRole('button')).toHaveCount(metals.length);
  await page.getByRole('button', { name: 'Kuva', exact: true }).click();
  await page.getByRole('button', { name: 'Tarkentuva', exact: true }).click();
  await page.getByLabel('Tarkennuksen tavoite', { exact: true }).selectOption('8');
  await expect(page.getByTestId('trace-status')).toContainText('Tavoite saavutettu', {
    timeout: 120000,
  });
  await page.screenshot({ path: info.outputPath('metals-refined.png') });
  await page.getByRole('button', { name: 'Materiaali', exact: true }).click();
  await page
    .locator('.material-swatches')
    .getByRole('button', { name: 'Hapettunut kupari', exact: true })
    .click();
  await page.getByLabel('Pintakäsittely', { exact: true }).selectOption('matte');
  const saved = await save(page);
  expect(
    saved.bodies.every(
      (b) => b.appearance?.preset === 'copper-patina' && b.appearance.roughness === 1,
    ),
  ).toBe(true);
  await expect(page.getByTestId('trace-status')).toContainText('Tavoite saavutettu', {
    timeout: 120000,
  });
  expect(errors).toEqual([]);
});
