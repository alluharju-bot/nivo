import { test, expect, type Page } from '@playwright/test';
import { makeBody, makeProfileBody, type Guide } from '../src/model/project';
import { sketchFrame } from '../src/model/sketch';
import { guidePoints } from '../src/model/guides';
import { ready, save } from './helpers';

const dialog = (page: Page) => page.getByRole('dialog', { name: /^(Tasajako|Muokkaa tasajakoa)$/ });
async function select(page: Page, id: string, extend = false) {
  if (
    (await page.getByRole('button', { name: 'Näytä mallilista' }).getAttribute('aria-expanded')) ===
    'false'
  )
    await page.getByRole('button', { name: 'Näytä mallilista' }).press('Enter');
  await page.getByTestId(`body-${id}`).click({ modifiers: extend ? ['Shift'] : [] });
}

test('distribute linked copies, edit after reload, undo together and cancel without changes', async ({
  page,
}, info) => {
  const part = makeBody(20, 50, 100, [12, 30, -10], 'Tasajaon osa');
  await ready(page, [part]);
  await select(page, part.id);
  await page.getByRole('button', { name: 'Tasajako', exact: true }).click();
  await dialog(page).getByLabel('Tasajaon määrä', { exact: true }).fill('5');
  await dialog(page).getByLabel('Tasajaon mitta', { exact: true }).fill('600');
  await expect(dialog(page).getByRole('status')).toContainText('125 mm');
  await dialog(page).screenshot({ path: info.outputPath('distribution.png') });
  await dialog(page).getByRole('button', { name: 'Toteuta tasajako', exact: true }).click();
  await expect(dialog(page)).toBeHidden();
  let p = await save(page);
  expect(p.bodies.map((b) => b.origin[0])).toEqual([12, 157, 302, 447, 592]);
  expect(new Set(p.bodies.map((b) => b.component?.id)).size).toBe(1);
  await expect(page.locator('.save-status')).toContainText('Tallessa selaimessa');
  await page.reload();
  await select(page, p.bodies[2].id);
  await page.getByRole('button', { name: 'Muokkaa tasajakoa', exact: true }).click();
  await expect(dialog(page)).toContainText('koko tasajakoa');
  await dialog(page).getByLabel('Tasajaon määrä', { exact: true }).fill('3');
  await dialog(page).getByLabel('Tasajaon mittatapa').selectOption('span');
  await dialog(page).getByLabel('Tasajaon mitta', { exact: true }).fill('800');
  await dialog(page).getByRole('button', { name: 'Toteuta tasajako', exact: true }).click();
  await expect(dialog(page)).toBeHidden();
  p = await save(page);
  expect(p.bodies.map((b) => b.origin)).toEqual([
    [12, 30, -10],
    [412, 30, -10],
    [812, 30, -10],
  ]);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toHaveLength(5);
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  expect((await save(page)).bodies).toEqual(p.bodies);
  await select(page, p.bodies[0].id);
  await page.getByRole('button', { name: 'Muokkaa tasajakoa', exact: true }).click();
  await dialog(page).getByLabel('Tasajaon mitta', { exact: true }).fill('2');
  await dialog(page).getByLabel('Tasajaon mittatapa').selectOption('extent');
  await expect(dialog(page).getByRole('alert')).toContainText('eivät mahdu');
  await expect(
    dialog(page).getByRole('button', { name: 'Toteuta tasajako', exact: true }),
  ).toBeDisabled();
  await page.keyboard.press('Escape');
  expect((await save(page)).bodies).toEqual(p.bodies);
  await page.getByRole('button', { name: 'Muokkaa tasajakoa', exact: true }).click();
  await dialog(page).getByLabel('Tasajaon suunta').selectOption('-z');
  await dialog(page).getByRole('button', { name: 'Toteuta tasajako', exact: true }).click();
  await expect(dialog(page)).toBeHidden();
  expect((await save(page)).bodies.map((b) => b.origin)).toEqual([
    [12, 30, -10],
    [12, 30, -410],
    [12, 30, -810],
  ]);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  await page.getByRole('button', { name: 'Muokkaa tasajakoa', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Vapauta tasajako · säilytä osat' }).click();
  await expect(dialog(page)).toBeHidden();
  expect((await save(page)).distributions).toEqual([]);
});

test('arranges different thicknesses by top references without creating copies', async ({
  page,
}) => {
  const parts = [
    makeBody(50, 60, 18, [0, 0, 0], 'Hylly 1'),
    makeBody(50, 60, 38, [0, 0, 100], 'Hylly 2'),
    makeBody(50, 60, 48, [0, 0, 220], 'Hylly 3'),
  ];
  await ready(page, parts);
  await select(page, parts[0].id);
  await select(page, parts[2].id, true);
  await expect(page.locator('.object-select[aria-pressed="true"]')).toHaveCount(3);
  await page.getByRole('button', { name: 'Tasajako', exact: true }).click();
  await expect(dialog(page).getByLabel('Tasajaon toiminto')).toHaveValue('arrange');
  await dialog(page).getByLabel('Tasajaon mittatapa').selectOption('span');
  await dialog(page).getByLabel('Tasajaon suunta').selectOption('z');
  await dialog(page).getByLabel('Tasajaon viitekohta').selectOption('max');
  await dialog(page).getByLabel('Tasajaon mitta', { exact: true }).fill('1000');
  await dialog(page).getByRole('button', { name: 'Toteuta tasajako', exact: true }).click();
  await expect(dialog(page)).toBeHidden();
  const p = await save(page);
  expect(p.bodies).toHaveLength(3);
  expect(p.bodies.map((b) => b.origin[2] + b.feature.height)).toEqual([18, 518, 1018]);
  expect(p.bodies.map((b) => b.id)).toEqual(parts.map((b) => b.id));
});

test('divides two construction lines into five exact intervals and preserves boundary identities', async ({
  page,
}) => {
  const guides: Guide[] = [0, 1000].map((x, i) => ({
    id: `line-${i}`,
    anchor: { point: [x, 0, 0] },
    plane: 'XY',
    angle: 90,
    direction: [0, 1, 0],
    length: 200,
    mode: 'guide',
  }));
  await ready(page, [], guides);
  await page.getByRole('button', { name: 'Näytä mallilista' }).press('Enter');
  await page.getByRole('button', { name: /^Viivat/ }).click();
  await page.getByTestId('guide-row-line-0').getByRole('button').first().click();
  await page
    .getByTestId('guide-row-line-1')
    .getByRole('button')
    .first()
    .click({ modifiers: ['Shift'] });
  await page.getByRole('button', { name: 'Tasajako', exact: true }).click();
  await dialog(page).getByLabel('Tasajaon välien määrä').fill('5');
  await dialog(page).getByLabel('Tasajaon mitta', { exact: true }).fill('1000');
  await expect(dialog(page).getByRole('status')).toHaveText('6 viivaa · 5 väliä · 200 mm / väli');
  await dialog(page).getByRole('button', { name: 'Toteuta tasajako', exact: true }).click();
  await expect(dialog(page)).toBeHidden();
  const p = await save(page);
  expect(p.guides.map((g) => guidePoints([], g)![0][0]).sort((a, b) => a - b)).toEqual([
    0, 200, 400, 600, 800, 1000,
  ]);
  expect(p.guides.find((g) => g.id === 'line-1')).toEqual(guides[1]);
  await page.getByRole('button', { name: 'Muokkaa tasajakoa', exact: true }).click();
  await dialog(page).getByLabel('Tasajaon välien määrä').fill('2');
  await dialog(page).getByRole('button', { name: 'Toteuta tasajako', exact: true }).click();
  await expect(dialog(page)).toBeHidden();
  expect(
    (await save(page)).guides.map((g) => guidePoints([], g)![0][0]).sort((a, b) => a - b),
  ).toEqual([0, 500, 1000]);
});

test('uses ten distributed flat circles directly as Cut tools and keeps the editable distribution', async ({
  page,
}) => {
  const plate = makeBody(1000, 100, 20, [0, 0, 0], 'Levy');
  const circle = makeProfileBody(
    { kind: 'circle', radius: 4 },
    sketchFrame([50, 50, 20]),
    0,
    'Reikä',
  );
  await ready(page, [plate, circle]);
  await select(page, circle.id);
  await page.getByRole('button', { name: 'Tasajako', exact: true }).click();
  await dialog(page).getByLabel('Tasajaon määrä', { exact: true }).fill('10');
  await dialog(page).getByLabel('Tasajaon mittatapa').selectOption('span');
  await dialog(page).getByLabel('Tasajaon mitta', { exact: true }).fill('900');
  await dialog(page).getByRole('button', { name: 'Toteuta ja käytä leikkureina' }).click();
  await expect(dialog(page)).toBeHidden();
  await expect(page.getByRole('button', { name: 'Työstökappaleet 10', exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: 'Kohde: Levy', exact: true }).check();
  await page.getByRole('button', { name: 'Hyväksy Cut', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Kohteet 0', exact: true })).toBeVisible();
  await page.keyboard.press('v');
  const cut = await save(page);
  expect(cut.bodies.find((b) => b.id === plate.id)!.feature.type).toBe('brep');
  expect(cut.bodies).toHaveLength(11);
  expect(cut.distributions![0].members).toHaveLength(10);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies.find((b) => b.id === plate.id)!.feature).toEqual(plate.feature);
  await select(page, circle.id);
  await page.getByRole('button', { name: 'Muokkaa tasajakoa', exact: true }).click();
  await dialog(page).getByLabel('Tasajaon määrä', { exact: true }).fill('5');
  await dialog(page).getByRole('button', { name: 'Toteuta ja käytä leikkureina' }).click();
  await expect(dialog(page)).toBeHidden();
  await expect(page.getByRole('button', { name: 'Työstökappaleet 5', exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: 'Kohde: Levy', exact: true }).check();
  await page.getByRole('button', { name: 'Hyväksy Cut', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Kohteet 0', exact: true })).toBeVisible();
  expect((await save(page)).bodies).toHaveLength(6);
});
