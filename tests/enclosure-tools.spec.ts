import { test, expect } from '@playwright/test';
import { makeBody, makeProfileBody } from '../src/model/project';
import { sketchFrame } from '../src/model/sketch';
import { ready, view, click, save, revealBrowser } from './helpers';

test('small edge midpoint wins over nearby corners and its shape rounds exactly to half width', async ({
  page,
}, info) => {
  const body = makeBody(4, 24, 6, [0, 0, 0], 'Ilmanvaihtoaukon muoto');
  await ready(page, [body]);
  const p = await view(page, [body]);
  await page.keyboard.press('k');
  await page.mouse.move(p(2, 0, 6).x, p(2, 0, 6).y);
  await expect(page.getByTestId('snap-hint')).toContainText('keskipiste');
  await expect
    .poll(async () =>
      JSON.parse((await page.getByTestId('viewport').getAttribute('data-snap-point'))!),
    )
    .toEqual([2, 0, 6]);
  await page.keyboard.press('Escape');
  await revealBrowser(page);
  await page.getByTestId(`body-${body.id}`).click();
  await expect(page.getByRole('button', { name: 'Cut / Join', exact: true })).toBeVisible();
  await page.keyboard.press('f');
  await page.getByRole('button', { name: 'Puolipyöreäksi', exact: true }).click();
  await expect(page.getByTestId('detail-size')).toHaveValue('2');
  await expect(page.getByRole('region', { name: 'Viisteet ja pyöristykset' })).toContainText(
    '4 reunaa valittu',
  );
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-detail-preview', body.id);
  await page.screenshot({ path: info.outputPath('exact-semicircle.png') });
  await page.getByRole('button', { name: 'Hyväksy reunakäsittely', exact: true }).click();
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  const result = await save(page);
  expect(result.bodies[0].edgeTreatment?.size).toBe(2);
  expect(result.bodies[0].feature.width).toBeCloseTo(4, 8);
  expect(result.bodies[0].feature.depth).toBeCloseTo(24, 8);
  expect(result.bodies[0].feature.height).toBeCloseTo(6, 8);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual([body]);
});

test('opening pattern keeps its targets after missing them, previews and restores its history after reload', async ({
  page,
}, info) => {
  const wall = makeBody(180, 3, 60, [0, 0, 0], 'Kotelo'),
    back = makeBody(180, 3, 60, [0, 100, 0], 'Takaseinä'),
    profile = makeProfileBody(
      { kind: 'circle', radius: 2 },
      sketchFrame([35, 0, 30], [0, -1, 0]),
      0,
      'Aukko',
    );
  const parts = [wall, back, profile];
  await ready(page, parts);
  await view(page, parts, 'front');
  await revealBrowser(page);
  await page.getByTestId(`body-${profile.id}`).click();
  await page.getByRole('button', { name: 'Leikkaa aukko…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Leikkaa aukko', exact: true });
  await dialog.getByRole('checkbox', { name: 'Takaseinä', exact: true }).uncheck();
  await dialog.getByRole('textbox', { name: 'Aukkoja yhteensä', exact: true }).fill('6');
  await dialog.getByRole('combobox', { name: 'Aukkosarjan suunta', exact: true }).selectOption('x');
  await dialog
    .getByRole('combobox', { name: 'Leikkauksen syvyys', exact: true })
    .selectOption('depth');
  await dialog.getByRole('textbox', { name: 'Leikkaussyvyys · mm', exact: true }).fill('3');
  await expect(
    dialog.getByRole('button', { name: 'Leikkaa aukot · 1 osaa', exact: true }),
  ).toBeEnabled();
  await page.screenshot({ path: info.outputPath('six-openings-preview.png') });
  await dialog.getByRole('button', { name: 'Leikkaa aukot · 1 osaa', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const cut = await save(page);
  expect(cut.bodies).toHaveLength(2);
  expect(cut.bodies[1]).toEqual(back);
  await page.getByRole('button', { name: 'Toista aukko…', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Aukkojen väli · mm', exact: true }).fill('1000');
  await expect(dialog).toContainText('sarja ei osu kohteeseen');
  await dialog.getByRole('textbox', { name: 'Aukkojen väli · mm', exact: true }).fill('10');
  await expect(dialog.getByRole('checkbox', { name: 'Kotelo', exact: true })).toBeChecked();
  await dialog.getByRole('textbox', { name: 'Lisäaukkoja', exact: true }).fill('');
  await expect(dialog.getByRole('alert')).toBeVisible();
  await page.keyboard.press('Escape');
  expect((await save(page)).bodies).toEqual(cut.bodies);
  await expect(page.locator('.save-status')).toContainText('Tallessa selaimessa');
  await page.reload();
  await expect(page.locator('.busy-badge')).toHaveCount(0);
  await page.getByRole('button', { name: 'Toimintohistoria', exact: true }).click();
  await page.getByRole('button', { name: 'Palaa leikkaukseen', exact: true }).first().click();
  await expect(dialog.getByRole('textbox', { name: 'Aukkoja yhteensä', exact: true })).toHaveValue(
    '6',
  );
  await expect(dialog.getByRole('checkbox', { name: 'Kotelo', exact: true })).toBeChecked();
  await expect(
    dialog.getByRole('textbox', { name: 'Leikkaussyvyys · mm', exact: true }),
  ).toHaveValue('3');
  await page.keyboard.press('Escape');
  expect((await save(page)).bodies).toEqual(parts);
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  expect((await save(page)).bodies).toEqual(cut.bodies);
});

test('a push/pull opening offers repetition without a separate cutter and restores its source from history', async ({
  page,
}, info) => {
  const plate = makeBody(400, 200, 3, [0, 0, -3], 'Reikälevy');
  await ready(page, [plate]);
  const p = await view(page, [plate]);
  await page.keyboard.press('c');
  await click(page, p(60, 100, 0));
  await click(page, p(70, 100, 0));
  await page.getByRole('button', { name: 'Jaa pinta', exact: true }).click();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
  await page.mouse.move(p(60, 100, 0).x, p(60, 100, 0).y);
  await page.keyboard.press('e');
  await page.keyboard.type('-3');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  const first = await save(page);
  await page.getByRole('button', { name: 'Toista aukko…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Leikkaa aukko', exact: true });
  await dialog.getByRole('textbox', { name: 'Lisäaukkoja', exact: true }).fill('5');
  await dialog.getByRole('textbox', { name: 'Aukkojen väli · mm', exact: true }).fill('40');
  await expect(
    dialog.getByRole('button', { name: 'Leikkaa aukot · 1 osaa', exact: true }),
  ).toBeEnabled();
  await page.screenshot({ path: info.outputPath('repeat-push-pull.png') });
  await dialog.getByRole('button', { name: 'Leikkaa aukot · 1 osaa', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const result = await save(page);
  expect(result.bodies).toHaveLength(1);
  expect(result.bodies[0].feature).not.toEqual(first.bodies[0].feature);
  await expect(page.locator('.save-status')).toContainText('Tallessa selaimessa');
  await page.reload();
  await expect(page.locator('.busy-badge')).toHaveCount(0);
  await page.getByRole('button', { name: 'Toimintohistoria', exact: true }).click();
  await page.getByRole('button', { name: 'Palaa leikkaukseen', exact: true }).first().click();
  await expect(dialog.getByRole('textbox', { name: 'Lisäaukkoja', exact: true })).toHaveValue('5');
  await expect(
    dialog.getByRole('textbox', { name: 'Aukkojen väli · mm', exact: true }),
  ).toHaveValue('40');
  await expect(dialog.getByRole('checkbox', { name: 'Reikälevy', exact: true })).toBeChecked();
  await page.keyboard.press('Escape');
  expect((await save(page)).bodies).toEqual(first.bodies);
});
