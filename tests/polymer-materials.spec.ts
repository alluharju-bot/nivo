import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { makeBody } from '../src/model/project';
import { polymerMaterials } from '../src/model/polymerMaterials';
import { click, ready, save, view } from './helpers';

test('textured rubber and plastic paint, receive layers, persist and export their PBR maps', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const bodies = polymerMaterials.map((p, i) =>
    makeBody(120, 120, 16, [(i % 2) * 150, Math.floor(i / 2) * 150, 0], p.name),
  );
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await ready(page, bodies);
  const point = await view(page, bodies);
  const builds = await page.getByTestId('viewport').getAttribute('data-geometry-builds');
  await page.keyboard.press('p');
  for (const [i, preset] of polymerMaterials.entries()) {
    await page.getByLabel('Pensselin materiaali', { exact: true }).selectOption(preset.id);
    await click(page, point((i % 2) * 150 + 60, Math.floor(i / 2) * 150 + 60, 16));
  }
  const painted = await save(page);
  expect(painted.bodies.map((b) => b.appearance?.preset)).toEqual(
    polymerMaterials.map((p) => p.id),
  );
  expect(painted.bodies.map((b) => b.appearance!.texture.width)).toEqual([24, 20, 24, 48]);
  await page.getByRole('button', { name: 'Pintakerrokset', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Pintakerrokset', exact: true });
  const layers = ['dust', 'scratches', 'water', 'paint'];
  for (const [i, kind] of layers.entries()) {
    await click(page, point((i % 2) * 150 + 60, Math.floor(i / 2) * 150 + 60, 16));
    await panel.getByLabel('Lisättävä pintakerros').selectOption(kind);
    await panel.getByRole('button', { name: 'Lisää kerros', exact: true }).click();
  }
  const layered = await save(page);
  expect(layered.bodies.map((b) => b.appearance!.layers!.map((l) => l.kind))).toEqual(
    layers.map((k) => [k]),
  );
  expect(layered.bodies.map((b) => b.appearance!.preset)).toEqual(
    polymerMaterials.map((p) => p.id),
  );
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-geometry-builds', builds!);
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '4');
  expect((await save(page)).bodies).toEqual(layered.bodies);
  const exportButton = page.getByRole('button', { name: 'Vie 3D-malli', exact: true });
  if (!(await exportButton.isVisible()))
    await page.getByRole('button', { name: 'Lisää toimintoja', exact: true }).click();
  await exportButton.click();
  const dialog = page.getByRole('dialog', { name: 'Vie 3D-malli', exact: true });
  await dialog.getByLabel('Viennin kohde').selectOption('visible');
  await dialog.getByLabel('3D-tiedostomuoto').selectOption('glb');
  const pending = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Lataa tiedosto', exact: true }).click();
  const buffer = await readFile((await (await pending).path())!);
  const gltf = JSON.parse(buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString());
  expect(gltf.materials.length).toBeGreaterThanOrEqual(4);
  for (const material of gltf.materials) {
    expect(material.pbrMetallicRoughness.baseColorTexture).toBeDefined();
    expect(material.pbrMetallicRoughness.metallicRoughnessTexture).toBeDefined();
    expect(material.normalTexture).toBeDefined();
  }
  expect(
    gltf.images.every((image: { bufferView?: number }) => image.bufferView !== undefined),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath('textured-polymers.png') });
  expect(errors).toEqual([]);
});
