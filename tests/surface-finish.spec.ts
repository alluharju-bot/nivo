import { test, expect } from '@playwright/test';
import { ready, save, view, click } from './helpers';
import { makeBody } from '../src/model/project';
import { defaultAppearance, findPreset } from '../src/model/materials';

test('texture tint and finish preserve the texture, undo as individual actions and persist in both workspaces', async ({
  page,
}, info) => {
  const appearance = {
    ...defaultAppearance('pine'),
    texture: { ...defaultAppearance('pine').texture, rotation: 32, width: 480 },
    bumpDepth: 0.23,
  };
  const body = { ...makeBody(400, 300, 40), appearance };
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await ready(page, [body]);
  await page.getByTestId(`body-${body.id}`).click();
  await page.locator('.model-materials > summary').click();
  await page.getByLabel('Tekstuurin sävy', { exact: true }).fill('#7799bb');
  await page.getByRole('button', { name: 'Käytä sävyä', exact: true }).click();
  await page.getByLabel('Pintakäsittely', { exact: true }).selectOption('gloss');
  let result = await save(page);
  expect(result.bodies[0].color).toBe('#7799bb');
  expect(result.bodies[0].appearance).toEqual({ ...appearance, roughness: 0.12, clearcoat: 0.35 });
  expect(result.bodies[0].feature).toEqual(body.feature);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies[0].appearance).toEqual(appearance);
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  const gloss = page.getByRole('slider', { name: 'Kiilto', exact: true });
  await gloss.focus();
  await gloss.press('ArrowLeft');
  await expect(gloss).toHaveValue('87');
  expect((await save(page)).bodies[0].appearance!.roughness).toBeCloseTo(0.13, 8);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  await expect(gloss).toHaveValue('88');
  await page.getByRole('button', { name: 'Palauta oletussävy', exact: true }).click();
  expect((await save(page)).bodies[0].color).toBe(findPreset('pine').color);
  await expect(page.getByText('Tallessa selaimessa', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  await expect(page.getByLabel('Pintakäsittely', { exact: true })).toHaveValue('gloss');
  const canvas = page.getByTestId('render-canvas');
  const pixels = () => canvas.evaluate((el) => (el as HTMLCanvasElement).toDataURL());
  const glossy = await pixels();
  await page.getByLabel('Pintakäsittely', { exact: true }).selectOption('matte');
  await expect.poll(pixels).not.toBe(glossy);
  result = await save(page);
  expect(result.bodies[0].appearance).toEqual({ ...appearance, roughness: 0.85, clearcoat: 0 });
  await page.getByLabel('Pintakäsittely', { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('surface-finish.png') });
  expect(errors).toEqual([]);
});

test('plain paint replaces a texture and carries the selected colour and finish into rendering', async ({
  page,
}) => {
  const body = { ...makeBody(400, 300, 40), appearance: defaultAppearance('pine') };
  await ready(page, [body]);
  const p = await view(page, [body]);
  await page.keyboard.press('p');
  await expect(page.getByLabel('Pensselin materiaali')).toHaveValue('paint-solid');
  await page.getByLabel('Pensselin materiaali').selectOption({ label: 'Maalattu kipsi · sileä' });
  await page.getByLabel('Pensselin materiaali').selectOption({ label: 'Maali · tasainen väri' });
  await page.getByLabel('Pensselin väri').fill('#b3a292');
  await page.getByLabel('Pintakäsittely', { exact: true }).selectOption('satin');
  await click(page, p(180, 130, 40));
  const result = await save(page);
  expect(result.bodies[0].color).toBe('#b3a292');
  expect(result.bodies[0].appearance).toEqual({
    ...defaultAppearance('paint-solid'),
    roughness: 0.55,
    clearcoat: 0.05,
  });
  expect(result.bodies[0].feature).toEqual(body.feature);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies[0].appearance).toEqual(body.appearance);
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  await expect(page.getByLabel('Materiaali', { exact: true })).toHaveValue('paint-solid');
  await expect(page.getByLabel('Pintakäsittely', { exact: true })).toHaveValue('satin');
  await expect(page.getByLabel('Oma osaväri', { exact: true })).toHaveValue('#b3a292');
  const canvas = page.getByTestId('render-canvas');
  const original = await canvas.screenshot();
  await page.getByLabel('Oma osaväri', { exact: true }).fill('#2277bb');
  expect((await canvas.screenshot()).equals(original)).toBe(false);
  expect((await save(page)).bodies[0].color).toBe('#b3a292');
  await page.getByRole('button', { name: 'Käytä väriä', exact: true }).click();
  await page.getByLabel('Pintakäsittely', { exact: true }).selectOption('gloss');
  expect((await save(page)).bodies[0]).toMatchObject({
    color: '#2277bb',
    appearance: { preset: 'paint-solid', roughness: 0.12, clearcoat: 0.35 },
  });
});
