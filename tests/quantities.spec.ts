import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { freshProject, makeBody, makeProfileBody, type Project } from '../src/model/project';
import { sketchFrame } from '../src/model/sketch';
import { ready, save } from './helpers';

async function choose(page: Page, ids: string[]) {
  await page.getByRole('button', { name: 'Näytä mallilista', exact: true }).press('Enter');
  for (const [i, id] of ids.entries())
    await page.getByTestId(`body-${id}`).click({ modifiers: i ? ['Shift'] : [] });
  await page.getByRole('button', { name: 'Piilota mallilista', exact: true }).press('Enter');
}
async function createType(page: Page, name: string, unit: string) {
  await page.getByLabel('Osan tyyppi', { exact: true }).selectOption('__new__');
  await page.getByLabel('Tyypin nimi', { exact: true }).fill(name);
  await page.getByLabel('Tyypin laskentatapa', { exact: true }).selectOption(unit);
  await page.getByRole('button', { name: 'Luo tyyppi', exact: true }).click();
  await expect(page.getByRole('form', { name: 'Uusi osatyyppi' })).not.toBeVisible();
}
async function openQuantities(page: Page) {
  await page.getByRole('button', { name: 'Osat', exact: true }).click();
  await page.getByRole('button', { name: 'Määrät', exact: true }).click();
}
async function load(page: Page, project: Project) {
  await ready(page);
  await page.getByTestId('project-file').setInputFiles({
    name: 'quantity-test.nivo',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(page.locator('.busy-badge')).not.toBeVisible();
}

test('creates and assigns a length type to multiple boards without rebuilding geometry, sums, exports, reopens and selects the type', async ({
  page,
}, info) => {
  const a = makeBody(2200, 90, 28, [0, 0, 0], 'Laude A');
  const b = makeBody(1800, 90, 28, [0, 110, 0], 'Laude B');
  const panel = makeBody(1200, 600, 50, [0, 0, -100], 'Eristelevy');
  await ready(page, [a, b, panel]);
  await choose(page, [a.id, b.id]);
  await expect(page.getByTestId('selection-quantities')).toHaveText('2 kpl');
  const geometry = await page.getByTestId('viewport').getAttribute('data-geometry-builds');
  await createType(page, 'Laudelauta', 'length');
  await expect(page.getByTestId('selection-quantities')).toContainText('2 kpl · 4 m');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-geometry-builds', geometry!);
  await openQuantities(page);
  const row = page
    .locator('.quantities-table tr')
    .filter({ has: page.getByRole('button', { name: 'Valitse tyyppi: Laudelauta', exact: true }) });
  await expect(row).toContainText('2 kpl · 4 m');
  await row.locator('summary').click();
  await expect(row).toContainText('1 × 2 200 mm');
  await expect(row).toContainText('1 × 1 800 mm');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Vie määrät CSV', exact: true }).click();
  const csv = await readFile((await (await download).path())!, 'utf8');
  expect(csv).toContain('"Laudelauta";"2";"4";"m"');
  await page.screenshot({ path: info.outputPath('quantities.png') });
  const project = await save(page);
  expect(project.partTypes).toHaveLength(1);
  expect(project.bodies[0].partTypeId).toBe(project.partTypes![0].id);
  expect(project.bodies[2].partTypeId).toBeUndefined();
  await expect(page.locator('.save-status')).toContainText('Tallessa selaimessa');
  await page.reload();
  await openQuantities(page);
  await page.getByRole('button', { name: 'Valitse tyyppi: Laudelauta', exact: true }).click();
  await expect(page.getByTestId('selection-quantities')).toContainText('2 kpl · 4 m');
  await expect(page.getByLabel('Osan tyyppi')).toHaveValue(project.partTypes![0].id);
  await page.screenshot({ path: info.outputPath('quantity-selection.png') });
});

test('group scope includes hidden instances, excludes construction, supports area and count types and edits shared type definitions', async ({
  page,
}) => {
  const board = { ...makeBody(2200, 90, 28), partTypeId: 'board', groupId: 'sauna' };
  const hidden = { ...board, id: 'hidden', hidden: true, groupId: 'child' };
  const panel = { ...makeBody(1200, 600, 50), partTypeId: 'panel', groupId: 'sauna' };
  const screw = { ...makeBody(4, 4, 50), partTypeId: 'screw' };
  const helper = { ...board, id: 'helper', purpose: 'construction' as const };
  const project: Project = {
    ...freshProject(),
    bodies: [board, hidden, panel, screw, helper],
    groups: [
      { id: 'sauna', name: 'Sauna', hidden: false },
      { id: 'child', name: 'Alalaude', parentId: 'sauna', hidden: true },
    ],
    partTypes: [
      { id: 'board', name: 'Laudelauta', unit: 'length' },
      { id: 'panel', name: 'Eriste', unit: 'area' },
      { id: 'screw', name: 'Ruuvi', unit: 'count' },
    ],
  };
  await load(page, project);
  await openQuantities(page);
  await expect(page.getByTestId('quantity-row-board')).toContainText('2 kpl · 4,4 m');
  await expect(page.getByTestId('quantity-row-panel')).toContainText('1 kpl · 0,72 m²');
  await expect(page.getByTestId('quantity-row-screw')).toContainText('1 kpl');
  await page.getByLabel('Osaluettelon kohde').selectOption('sauna');
  await expect(page.getByTestId('quantity-row-screw')).not.toBeVisible();
  await expect(page.getByTestId('quantity-row-board')).toContainText('2 kpl');
  await page.locator('.quantity-type-library > summary').click();
  await page
    .locator('.quantity-type-library')
    .getByRole('button', { name: 'Laudelauta m', exact: true })
    .click();
  await page.getByLabel('Tyypin nimi', { exact: true }).fill('Lämpöhaapa');
  await page.getByRole('button', { name: 'Tallenna tyyppi', exact: true }).click();
  await expect(page.getByTestId('quantity-row-board')).toContainText('Lämpöhaapa');
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  await expect(page.getByTestId('quantity-row-board')).toContainText('Laudelauta');
  await page.getByRole('button', { name: 'Valitse tyyppi: Laudelauta', exact: true }).click();
  await expect(page.getByTestId('selection-quantities')).toContainText('2 kpl · 4,4 m');
  expect((await save(page)).bodies.find((b) => b.id === hidden.id)?.hidden).toBe(true);
});

test('manual stock dimensions, type editing and removal are explicit, undoable and preserve the objects', async ({
  page,
}) => {
  const circle = makeProfileBody({ kind: 'circle', radius: 100 }, sketchFrame([0, 0, 0]), 20);
  await ready(page, [circle]);
  await choose(page, [circle.id]);
  await createType(page, 'Pyöreä kansi', 'area');
  await expect(page.getByTestId('selection-quantities')).toContainText('1 tarkistettavaa');
  await page.getByLabel('Laskennan pituus').fill('220');
  await page.getByLabel('Laskennan leveys').fill('220');
  await page.getByRole('button', { name: 'Vahvista aihiomitat', exact: true }).click();
  await expect(page.getByTestId('selection-quantities')).toContainText('0,048 m²');
  const typed = await save(page);
  await page.getByRole('button', { name: 'Muokkaa osatyyppiä', exact: true }).click();
  await page.getByLabel('Tyypin laskentatapa').selectOption('count');
  await page.getByRole('button', { name: 'Tallenna tyyppi', exact: true }).click();
  await expect(page.getByTestId('selection-quantities')).toHaveText('1 kpl');
  await page.getByRole('button', { name: 'Muokkaa osatyyppiä', exact: true }).click();
  await page.getByRole('form', { name: 'Muokkaa osatyyppiä' }).locator('summary').click();
  await page.getByRole('button', { name: 'Poista tyyppi', exact: true }).click();
  const removed = await save(page);
  expect(removed.bodies).toHaveLength(1);
  expect(removed.bodies[0].feature).toEqual(circle.feature);
  expect(removed.bodies[0].partTypeId).toBeUndefined();
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).partTypes).toEqual(typed.partTypes);
});

test('duplicate type names are rejected and held objects cannot be assigned', async ({ page }) => {
  const a = makeBody(2200, 90, 28),
    b = { ...makeBody(2200, 90, 28, [0, 100, 0]), locked: true };
  await load(page, {
    ...freshProject(),
    bodies: [a, b],
    partTypes: [{ id: 'board', name: 'Laudelauta', unit: 'length' }],
  });
  await choose(page, [a.id]);
  await page.getByLabel('Osan tyyppi').selectOption('__new__');
  await page.getByLabel('Tyypin nimi').fill('laudelauta');
  await page.getByRole('button', { name: 'Luo tyyppi', exact: true }).click();
  await expect(page.getByRole('form', { name: 'Uusi osatyyppi' }).getByRole('alert')).toContainText(
    'jo olemassa',
  );
  await page.getByRole('button', { name: 'Peruuta', exact: true }).click();
  await choose(page, [b.id]);
  await expect(page.getByLabel('Osan tyyppi')).toBeDisabled();
});

test('copied boards keep their type and linked size edits update project totals', async ({
  page,
}) => {
  const board = makeBody(2200, 90, 28);
  await ready(page, [board]);
  await choose(page, [board.id]);
  await createType(page, 'Laudelauta', 'length');
  await page.getByRole('button', { name: 'Kopioi kappale', exact: true }).click();
  await page.getByTestId('move-x').fill('2500');
  await page.getByTestId('move-x').press('Enter');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '2');
  await openQuantities(page);
  await expect(page.locator('.quantities-table')).toContainText('2 kpl · 4,4 m');
  await page.getByRole('button', { name: 'Valitse tyyppi: Laudelauta', exact: true }).click();
  await page.getByRole('button', { name: 'Skaalaa', exact: true }).click();
  await page.getByTestId('scale-factor').fill('1.5');
  await page.getByTestId('scale-factor').press('Enter');
  await expect(page.getByTestId('scale-factor')).not.toBeVisible();
  await openQuantities(page);
  await expect(page.locator('.quantities-table')).toContainText('2 kpl · 6,6 m');
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  await expect(page.locator('.quantities-table')).toContainText('2 kpl · 4,4 m');
});
