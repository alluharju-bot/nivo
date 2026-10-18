import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { makeBody } from '../src/model/project';
import { defaultAppearance } from '../src/model/materials';
import { ready, save, view, editBody } from './helpers';
test.describe.configure({ timeout: 180000 });
test('paint layers preserve finishes, place a bounded mark, undo, reload and export', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const body = {
    ...makeBody(600, 400, 30, [0, 0, 0], 'Metallilevy'),
    color: '#9aa0a5',
    appearance: { ...defaultAppearance('chrome'), roughness: 0.16 },
  };
  await ready(page, [body]);
  await page.getByTestId(`body-${body.id}`).click();
  const project = await view(page, [body]);
  await page.keyboard.press('p');
  await page.getByRole('button', { name: 'Pintakerrokset', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Pintakerrokset', exact: true });
  await panel.getByRole('button', { name: 'Lisää kerros', exact: true }).click();
  await expect(panel.locator('.surface-layer-card')).toHaveCount(1);
  await panel.getByLabel('Voimakkuus (%)', { exact: true }).fill('75');
  await panel.getByLabel('Voimakkuus (%)', { exact: true }).press('Enter');
  let saved = await save(page);
  expect(saved.bodies[0].appearance!.preset).toBe('chrome');
  expect(saved.bodies[0].appearance!.layers![0].amount).toBe(0.75);
  await panel.getByLabel('Lisättävä pintakerros').selectOption('fingerprints');
  await panel.getByRole('button', { name: 'Aseta paikallinen jälki', exact: true }).click();
  const at = project(350, 230, 30);
  await page.mouse.click(at.x, at.y);
  await expect(panel.locator('.surface-layer-card')).toHaveCount(2);
  saved = await save(page);
  const face = Object.values(saved.bodies[0].faceMaterials!)[0];
  const mark = face.appearance.layers!.find((l) => l.center)!;
  expect(mark.center![0]).toBeCloseTo(350, 0);
  expect(mark.center![1]).toBeCloseTo(230, 0);
  expect(saved.bodies[0].appearance!.layers).toHaveLength(1);
  await panel.locator('.surface-layer-card').nth(1).locator('.layer-name').click();
  await panel.getByRole('button', { name: 'Siirrä jälkeä pinnalla', exact: true }).click();
  const next = project(300, 180, 30);
  await page.mouse.click(next.x, next.y);
  saved = await save(page);
  const moved = Object.values(saved.bodies[0].faceMaterials!)[0].appearance.layers!.find(
    (l) => l.center,
  )!;
  expect(moved.center![0]).toBeCloseTo(300, 0);
  expect(moved.center![1]).toBeCloseTo(180, 0);
  await panel.getByRole('button', { name: 'Aiemmaksi', exact: true }).click();
  expect(
    Object.values((await save(page)).bodies[0].faceMaterials!)[0].appearance.layers![0].id,
  ).toBe(moved.id);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  await panel.getByLabel('Poista kerros 2').click();
  expect(
    Object.values((await save(page)).bodies[0].faceMaterials!)[0].appearance.layers,
  ).toHaveLength(1);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  await panel.getByLabel('Piilota kerros 2').click();
  expect(
    Object.values((await save(page)).bodies[0].faceMaterials!)[0].appearance.layers![1].enabled,
  ).toBe(false);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect(
    Object.values((await save(page)).bodies[0].faceMaterials!)[0].appearance.layers![1].enabled,
  ).toBe(true);
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
  await page.screenshot({ path: info.outputPath('layers-model.png') });
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  await page.getByRole('button', { name: 'Kuva', exact: true }).click();
  await page.getByRole('button', { name: 'Tarkentuva', exact: true }).click();
  await page.getByLabel('Tarkennuksen tavoite', { exact: true }).selectOption('8');
  await expect(page.getByTestId('trace-status')).toContainText('Tavoite saavutettu', {
    timeout: 100000,
  });
  await page.screenshot({ path: info.outputPath('layers-traced.png') });
  expect(errors).toEqual([]);
});
test('all four overlays render alongside a PBR wood finish', async ({ page }, info) => {
  const { newSurfaceLayer } = await import('../src/model/surfaceLayers');
  const kinds = ['dust', 'scratches', 'fingerprints', 'water'] as const;
  const bodies = kinds.map((kind, i) => ({
    ...makeBody(220, 220, 40, [i * 260, 0, 0], kind),
    color: '#a4a8ad',
    appearance: {
      ...defaultAppearance('chrome'),
      roughness: 0.12,
      layers: [{ ...newSurfaceLayer(kind), width: 160, height: 160, amount: 0.7 }],
    },
  }));
  bodies.push({
    ...makeBody(220, 220, 40, [1040, 0, 0], 'Puu'),
    color: '#ffffff',
    appearance: {
      ...defaultAppearance('pbr-oak_veneer_01'),
      roughness: 0.5,
      layers: [{ ...newSurfaceLayer('scratches'), width: 160, height: 160, amount: 0.45 }],
    },
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await ready(page, bodies);
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  await page.getByRole('button', { name: 'Kuva', exact: true }).click();
  await page.getByRole('button', { name: 'Tarkentuva', exact: true }).click();
  await page.getByLabel('Tarkennuksen tavoite', { exact: true }).selectOption('64');
  await expect(page.getByTestId('trace-status')).toContainText('Tavoite saavutettu', {
    timeout: 120000,
  });
  await page.screenshot({ path: info.outputPath('four-wear-layers.png') });
  expect(errors).toEqual([]);
});

for (const kind of ['dust', 'paint'] as const) {
  test(`baking ${kind} into a UV atlas preserves the source without applying the overlays twice`, async ({
    page,
  }) => {
    const { newSurfaceLayer } = await import('../src/model/surfaceLayers');
    const body = {
      ...makeBody(100, 80, 60),
      appearance: { ...defaultAppearance('chrome'), layers: [newSurfaceLayer(kind)] },
    };
    await ready(page, [body]);
    await editBody(page, body.id);
    await page.getByRole('button', { name: 'Verkko ja pinta', exact: true }).first().click();
    const d = page.getByRole('dialog', { name: 'Verkko ja pinta', exact: true });
    await d.getByRole('button', { name: 'UV-kartta', exact: true }).click();
    await d.getByLabel('Pintakartan koko').selectOption('128');
    await d.getByRole('button', { name: 'Luo UV-kartta', exact: true }).click();
    await expect(d.getByRole('status')).toContainText('pintavärit siirretty', { timeout: 60000 });
    await d.getByRole('button', { name: 'Pintakartat', exact: true }).click();
    await d.getByLabel('AO-näytteet').selectOption('8');
    await d.getByRole('button', { name: 'Laske pintakartat', exact: true }).click();
    await expect(d.getByRole('status')).toContainText('Pintakartat valmiit', { timeout: 60000 });
    await d.getByRole('button', { name: 'Lisää työversio projektiin', exact: true }).click();
    await expect(d).toHaveCount(0);
    const result = await save(page);
    expect(result.bodies[0].appearance!.layers).toEqual(body.appearance.layers);
    expect(result.bodies[1].appearance!.layers).toBeUndefined();
    expect(result.bodies[1].appearance!.atlasMaps).toBe(true);
    expect(result.bodies[1].appearance!.maps!.normal).toBeTruthy();
  });
}
