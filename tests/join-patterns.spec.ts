import { test, expect } from '@playwright/test';
import { makeBody, makeProfileBody } from '../src/model/project';
import { sketchFrame } from '../src/model/sketch';
import { ready, save, revealBrowser, view } from './helpers';

test('Join accepts all four selected touching walls without a tool group and undo restores them', async ({
  page,
}) => {
  const walls = [
    makeBody(200, 10, 100, [0, 0, 0], 'Etuseinä'),
    makeBody(200, 10, 100, [0, 190, 0], 'Takaseinä'),
    makeBody(10, 180, 100, [0, 10, 0], 'Vasen seinä'),
    makeBody(10, 180, 100, [190, 10, 0], 'Oikea seinä'),
  ];
  await ready(page, walls);
  await revealBrowser(page);
  for (const [i, wall] of walls.entries())
    await page.getByTestId(`body-${wall.id}`).click({ modifiers: i ? ['Shift'] : [] });
  await page.keyboard.press('b');
  await page.getByLabel('Toiminto', { exact: true }).selectOption('join');
  await expect(
    page.getByRole('button', { name: 'Yhdistettävät osat 4', exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Säilytä työstökappaleet', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Hyväksy Join', exact: true }).click();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
  const joined = await save(page);
  expect(joined.bodies[0].feature).toMatchObject({
    type: 'brep',
    solid: true,
    width: 200,
    depth: 200,
  });
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual(walls);
});

test('Join accepts flat circles and a rectangle and exposes the capsule as a quick cutter', async ({
  page,
}) => {
  const rectangle = makeBody(100, 40, 0, [0, 0, 0], 'Suorakulmio');
  const circles = [0, 100].map((x, i) =>
    makeProfileBody({ kind: 'circle', radius: 20 }, sketchFrame([x, 20, 0]), 0, `Ympyrä ${i + 1}`),
  );
  const plate = makeBody(200, 100, 5, [-40, -30, -5], 'Pelti');
  await ready(page, [rectangle, ...circles, plate]);
  await page.keyboard.press('b');
  await page.getByLabel('Toiminto', { exact: true }).selectOption('join');
  for (const part of [rectangle, ...circles])
    await page.getByRole('checkbox', { name: `Yhdistä: ${part.name}`, exact: true }).check();
  await page.getByRole('button', { name: 'Hyväksy Join', exact: true }).click();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '2');
  const joined = await save(page);
  const capsule = joined.bodies.find((b) => b.id !== plate.id)!;
  expect(capsule.feature).toMatchObject({ type: 'brep', solid: false, width: 140, depth: 40 });
  await page.keyboard.press('v');
  await revealBrowser(page);
  await page.getByTestId(`body-${capsule.id}`).click();
  await page.getByRole('button', { name: 'Leikkaa aukko…', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^Leikkaa (läpi|aukot) ·/, exact: true })
    .click();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual(joined.bodies);
});

test('Ctrl latches rotation copy; original stays put, copy is linked, undo and cancellation work', async ({
  page,
}) => {
  const part = makeBody(100, 40, 20, [80, 100, 0], 'Osa');
  await ready(page, [part]);
  await page.getByTestId(`body-${part.id}`).click();
  await page.keyboard.press('r');
  await page.getByRole('button', { name: 'Origo', exact: true }).click();
  await page.getByTestId('viewport').focus();
  await page.keyboard.press('Control');
  await expect(page.getByLabel('Kopioi kiertäessä · Ctrl')).toBeChecked();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-copy-rotation', 'true');
  await page.getByTestId('rotation-angle').fill('90');
  await page.getByTestId('rotation-angle').press('Enter');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '2');
  const model = await save(page);
  const original = model.bodies.find((b) => b.id === part.id)!;
  const copy = model.bodies.find((b) => b.id !== part.id)!;
  expect(original.origin).toEqual(part.origin);
  expect(original.feature).toEqual(part.feature);
  expect(copy.origin[0]).toBeCloseTo(-140, 4);
  expect(copy.origin[1]).toBeCloseTo(80, 4);
  expect(copy.component?.id).toBe(original.component?.id);
  expect(copy.component).toBeDefined();
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual([part]);
  await page.keyboard.press('v');
  await revealBrowser(page);
  await page.getByTestId(`body-${part.id}`).click();
  await page.keyboard.press('r');
  await page.getByTestId('viewport').focus();
  await page.keyboard.press('Control');
  await page.keyboard.press('Control');
  await expect(page.getByLabel('Kopioi kiertäessä · Ctrl')).not.toBeChecked();
  await page.keyboard.press('Escape');
  expect((await save(page)).bodies).toEqual([part]);
});

test('circular openings preview, cut, undo and reload as one operation', async ({ page }, info) => {
  const cylinder = makeProfileBody(
    { kind: 'circle', radius: 100 },
    sketchFrame([0, 0, 0]),
    80,
    'Sylinteri',
  );
  const hole = makeProfileBody(
    { kind: 'circle', radius: 5 },
    sketchFrame([100, 0, 40], [1, 0, 0]),
    0,
    'Aukko',
  );
  await ready(page, [cylinder, hole]);
  await view(page, [cylinder, hole]);
  await revealBrowser(page);
  await page.getByTestId(`body-${hole.id}`).click();
  await page.getByRole('button', { name: 'Leikkaa aukko…', exact: true }).click();
  await page.getByLabel('Leikkaussyvyys · mm', { exact: true }).fill('10');
  await page.getByLabel('Aukkojen toisto', { exact: true }).selectOption('radial');
  await page.getByLabel('Aukkoja yhteensä', { exact: true }).fill('7');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-opening-cutters', '7');
  const fullCircle = page.getByLabel('Tasavälein koko ympyrälle', { exact: true });
  await fullCircle.uncheck();
  await page.getByLabel('Kulmaväli · °', { exact: true }).fill('');
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
  await fullCircle.check();
  await expect(page.getByRole('dialog').getByRole('alert')).toHaveCount(0);
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-opening-cutters', '7');
  await page
    .getByRole('dialog')
    .locator('summary')
    .filter({ hasText: /^Kiertopiste$/ })
    .click();
  await page.getByLabel('Aukkosarjan kiertopiste X', { exact: true }).fill('5');
  await page.getByLabel('Aukkosarjan kiertopiste X', { exact: true }).press('Enter');
  await expect(page.getByRole('dialog', { name: 'Leikkaa aukko', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Kohteiden keskipiste', exact: true }).click();
  await expect(page.getByLabel('Aukkosarjan kiertopiste X', { exact: true })).toHaveValue('0');
  await page
    .getByRole('dialog')
    .locator('summary')
    .filter({ hasText: /^Kiertopiste$/ })
    .click();
  await page.screenshot({ path: info.outputPath('radial-holes.png') });
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^Leikkaa (läpi|aukot) ·/, exact: true })
    .click();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
  const cut = await save(page);
  expect(cut.bodies[0].feature.type).toBe('brep');
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual([cylinder, hole]);
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  await expect(page.locator('.save-status')).toContainText('Tallessa selaimessa');
  await page.reload();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
  expect((await save(page)).bodies).toEqual(cut.bodies);
});
