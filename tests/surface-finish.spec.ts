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

test('paint brush carries the selected tint and finish onto a part', async ({ page }) => {
  const body = makeBody(400, 300, 40);
  await ready(page, [body]);
  const p = await view(page, [body]);
  await page.keyboard.press('p');
  await page.getByLabel('Pensselin materiaali').selectOption('pine');
  await page.getByLabel('Pensselin väri').fill('#b3a292');
  await page.getByLabel('Pintakäsittely', { exact: true }).selectOption('satin');
  await click(page, p(180, 130, 40));
  const result = await save(page);
  expect(result.bodies[0].color).toBe('#b3a292');
  expect(result.bodies[0].appearance).toMatchObject({
    preset: 'pine',
    roughness: 0.55,
    clearcoat: 0.05,
  });
  expect(result.bodies[0].feature).toEqual(body.feature);
});
