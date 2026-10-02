import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { freshProject, makeBody, type Body, type Guide, type Project } from '../src/model/project';

async function ready(page: Page, bodies: Body[] = [], guides: Guide[] = []) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Piirrä suorakulmio', exact: true })).toBeEnabled();
  if (bodies.length || guides.length) {
    await page.getByTestId('project-file').setInputFiles({
      name: 'direct.nivo',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ ...freshProject(), bodies, guides })),
    });
    await expect(page.locator('.object-list .object-select')).toHaveCount(bodies.length);
  }
}
async function save(page: Page): Promise<Project> {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Tallenna tiedosto', exact: true }).click();
  return JSON.parse(await readFile((await (await pending).path())!, 'utf8'));
}

test('shared 3D and drawing dimensions follow editing; part colors, dimensions and export survive reload', async ({
  page,
}, info) => {
  const source = makeBody(600, 400, 18, [0, 0, 0], 'Ovi');
  await ready(page, [source]);
  await page.getByTestId(`body-${source.id}`).click();
  await page
    .locator('summary')
    .filter({ hasText: /^Mitat ja mallinnus$/ })
    .click();
  await page
    .locator('summary')
    .filter({ hasText: /^\s*Väri\s*$/ })
    .click();
  await page.getByRole('button', { name: 'Lisää kokonaismitat', exact: true }).click();
  await expect(page.getByTestId('dimension-3d')).toHaveCount(3);
  await page.getByRole('button', { name: 'Lisää kokonaismitat', exact: true }).click();
  await expect(page.getByTestId('dimension-3d')).toHaveCount(3);
  await page.getByRole('button', { name: 'Väri: Sininen', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Väri: Sininen', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  let model = await save(page);
  expect(model.bodies[0].color).toBe('#7d9fb8');
  expect(model.dimensions).toHaveLength(3);
  await page.screenshot({ path: info.outputPath('model-dimensions.png') });
  await page.keyboard.press('e');
  await page.getByTestId('height-input').fill('25');
  await page.getByTestId('height-input').press('Enter');
  await expect(page.locator('[data-testid="dimension-3d"][data-mm="43"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Mittakuva', exact: true }).click();
  await expect(page.locator('.drawing-paper [data-dimension]')).toHaveCount(2);
  await expect(page.locator('.drawing-paper [data-mm="43"]')).toHaveCount(1);
  await page.screenshot({ path: info.outputPath('shared-drawing.png') });
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Vie SVG-mittakuva', exact: true }).click();
  const svg = await readFile((await (await pending).path())!, 'utf8');
  expect(svg).toContain('data-mm="43"');
  expect(svg).toContain('600');
  await page.reload();
  model = await save(page);
  expect(model.bodies[0].color).toBe('#7d9fb8');
  expect(model.bodies[0].feature.height).toBe(43);
  expect(model.dimensions).toHaveLength(3);
  await expect(page.getByTestId('dimension-3d')).toHaveCount(3);
});

test('color applies to a multi-selection in one undo step; custom color and 3D dimension visibility are saved', async ({
  page,
}) => {
  const a = makeBody(160, 200, 100, [0, 0, 0], 'A'),
    b = { ...makeBody(160, 200, 100, [220, 0, 0], 'B'), color: '#eeeeea' };
  await ready(page, [a, b]);
  await page.getByTestId(`body-${a.id}`).click();
  await page.getByTestId(`body-${b.id}`).click({ modifiers: ['Shift'] });
  await page
    .locator('summary')
    .filter({ hasText: /^\s*Väri\s*$/ })
    .click();
  await page
    .locator('summary')
    .filter({ hasText: /^Mitat ja mallinnus$/ })
    .click();
  await expect(page.getByText('Väri · useita', { exact: true })).toBeVisible();
  const commonColor = await page.getByLabel('Oma osaväri', { exact: true }).inputValue();
  await page.getByRole('button', { name: 'Käytä väriä', exact: true }).click();
  expect((await save(page)).bodies.map((b) => b.color)).toEqual([commonColor, commonColor]);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  await expect(page.getByText('Väri · useita', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Väri: Vihreä', exact: true }).click();
  let model = await save(page);
  expect(model.bodies.map((b) => b.color)).toEqual(['#729582', '#729582']);
  expect(model.bodies.map((b) => b.feature)).toEqual([a.feature, b.feature]);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies.map((b) => b.color)).toEqual([a.color, b.color]);
  await page.getByRole('button', { name: 'Lisää kokonaismitat', exact: true }).click();
  await expect(page.getByTestId('dimension-3d')).toHaveCount(6);
  await page.getByRole('button', { name: 'Kappaleet 2', exact: true }).click();
  await page.getByTestId(`body-${a.id}`).click();
  await page.getByLabel('Oma osaväri', { exact: true }).fill('#b45588');
  await page.getByRole('button', { name: 'Käytä väriä', exact: true }).click();
  await page.locator('.viewport-settings summary').click();
  await page
    .getByRole('combobox', { name: 'Mitat 3D-näkymässä', exact: true })
    .selectOption('selected');
  await expect(page.getByTestId('dimension-3d')).toHaveCount(3);
  await page
    .getByRole('combobox', { name: 'Mitat 3D-näkymässä', exact: true })
    .selectOption('hidden');
  await expect(page.getByTestId('dimension-3d')).toHaveCount(0);
  await page.reload();
  model = await save(page);
  expect(model.bodies[0].color).toBe('#b45588');
  expect(model.bodies[1].color).toBe(b.color);
  expect(model.settings.dimensionDisplay).toBe('hidden');
  expect(model.dimensions).toHaveLength(6);
  await expect(page.getByTestId('dimension-3d')).toHaveCount(0);
});
