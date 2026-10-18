import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { makeBody } from '../src/model/project';
import { defaultAppearance } from '../src/model/materials';
import { ready, save } from './helpers';

async function exportGLB(page: Page) {
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
  const length = buffer.readUInt32LE(12);
  const json = JSON.parse(buffer.subarray(20, 20 + length).toString());
  return { json, binary: buffer.subarray(28 + length) };
}

test('chipped paint keeps its substrate, edits independently, survives undo/reload and exports dielectric paint', async ({
  page,
}, info) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const body = {
    ...makeBody(220, 180, 20, [0, 0, 0], 'Maalattu levy'),
    color: '#d0d0d0',
    appearance: { ...defaultAppearance('chrome'), roughness: 0.1 },
  };
  await ready(page, [body]);
  const builds = await page.getByTestId('viewport').getAttribute('data-geometry-builds');
  await page.getByTestId(`body-${body.id}`).click();
  await page.keyboard.press('p');
  await page.getByRole('button', { name: 'Pintakerrokset', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Pintakerrokset', exact: true });
  await panel.getByLabel('Lisättävä pintakerros').selectOption('paint');
  await panel.getByRole('button', { name: 'Lisää kerros', exact: true }).click();
  await panel.getByRole('button', { name: 'Pinta', exact: true }).click();
  await expect(panel.locator('.surface-layer-card')).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'Lisää kerros', exact: true })).toBeDisabled();
  await panel.getByRole('button', { name: 'Koko osa', exact: true }).click();
  await expect(panel.locator('.surface-layer-card')).toHaveCount(1);
  const clipped = await panel.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return [...element.querySelectorAll('input, select, button')]
      .filter((field) => {
        const rect = field.getBoundingClientRect();
        return rect.width > 0 && (rect.left < box.left - 1 || rect.right > box.right + 1);
      })
      .map((field) => field.getAttribute('aria-label') || field.textContent);
  });
  expect(clipped).toEqual([]);
  for (const [label, value] of [
    ['Kuluma (%)', '50'],
    ['Lohkeen koko (mm)', '18'],
    ['Maalin kiilto (%)', '20'],
  ]) {
    await panel.getByLabel(label, { exact: true }).fill(value);
    await panel.getByLabel(label, { exact: true }).press('Enter');
  }
  await panel.getByLabel('Maalin sävy', { exact: true }).fill('#2468a0');
  await panel.getByLabel('Maalin sävy', { exact: true }).press('Tab');
  let saved = await save(page);
  const paint = saved.bodies[0].appearance!.layers![0];
  expect(paint).toMatchObject({
    kind: 'paint',
    amount: 0.5,
    chipSize: 18,
    roughness: 0.8,
    color: '#2468a0',
  });
  expect(saved.bodies[0].appearance!.preset).toBe('chrome');
  expect(saved.bodies[0].feature).toEqual(body.feature);
  await panel.getByLabel('Pohjamateriaali', { exact: true }).selectOption('iron-rust');
  saved = await save(page);
  expect(saved.bodies[0].appearance!.preset).toBe('iron-rust');
  expect(saved.bodies[0].appearance!.layers).toEqual([paint]);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  await expect(panel.getByLabel('Pohjamateriaali', { exact: true })).toHaveValue('chrome');
  await panel.getByRole('button', { name: 'Vaihda kulumakuviota', exact: true }).click();
  expect((await save(page)).bodies[0].appearance!.layers![0].seed).toBe(2);
  await panel.getByLabel('Piilota kerros 1').click();
  expect((await save(page)).bodies[0].appearance!.layers![0].enabled).toBe(false);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  await panel.getByLabel('Poista kerros 1').click();
  expect((await save(page)).bodies[0].appearance!.layers).toBeUndefined();
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  await page.screenshot({ path: info.outputPath('paint-controls.png') });
  await panel.getByLabel('Kuluma (%)', { exact: true }).fill('0');
  await panel.getByLabel('Kuluma (%)', { exact: true }).press('Enter');
  const stored = (await save(page)).bodies[0];
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-geometry-builds', builds!);
  await page.reload();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
  expect((await save(page)).bodies[0]).toEqual(stored);
  const { json, binary } = await exportGLB(page);
  const pbr = json.materials.find(
    (m: any) => m.pbrMetallicRoughness.baseColorTexture,
  ).pbrMetallicRoughness;
  const imageUrl = (index: number) => {
    const image = json.images[json.textures[index].source];
    const view = json.bufferViews[image.bufferView];
    return `data:${image.mimeType};base64,${binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength).toString('base64')}`;
  };
  // Decode the exported maps, not internal application state. A pristine coat must not
  // inherit metallic chrome or disappear just because its wear value is zero.
  const pixels = await page.evaluate(
    async (urls) =>
      Promise.all(
        urls.map(async (url) => {
          const image = new Image();
          image.src = url;
          await image.decode();
          const canvas = document.createElement('canvas');
          canvas.width = image.width;
          canvas.height = image.height;
          const context = canvas.getContext('2d')!;
          context.drawImage(image, 0, 0);
          return [
            ...context.getImageData(Math.floor(image.width / 2), Math.floor(image.height / 2), 1, 1)
              .data,
          ];
        }),
      ),
    [imageUrl(pbr.baseColorTexture.index), imageUrl(pbr.metallicRoughnessTexture.index)],
  );
  expect(pixels[0].slice(0, 3)).toEqual([36, 104, 160]);
  expect(pixels[1][1]).toBeCloseTo(204, 0);
  expect(pixels[1][2]).toBe(0);
  await page.getByTestId(`body-${body.id}`).click();
  await page.keyboard.press('p');
  await page.getByRole('button', { name: 'Pintakerrokset', exact: true }).click();
  await panel.getByLabel('Kuluma (%)', { exact: true }).fill('100');
  await panel.getByLabel('Kuluma (%)', { exact: true }).press('Enter');
  const bare = (await exportGLB(page)).json;
  expect(bare.images ?? []).toHaveLength(0);
  expect(bare.materials[0].pbrMetallicRoughness).toMatchObject({
    metallicFactor: 1,
    roughnessFactor: 0.1,
  });
  expect(errors).toEqual([]);
});
