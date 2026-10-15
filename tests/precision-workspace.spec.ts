import { test, expect, type Page } from '@playwright/test';
import * as THREE from 'three';
import { ready, view, save, editBody } from './helpers';
import { makeBody, makeProfileBody, bounds, type Body } from '../src/model/project';
import { sketchFrame } from '../src/model/sketch';
import { asComponent } from '../src/model/components';
import { panel, bar, open, projected } from './precision-helpers';
const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const list: string[] = [];
  errors.set(page, list);
  page.on('pageerror', (e) => list.push(e.message));
});
test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([]);
});
test('moves a zero-thickness edge in the model viewport and undoes it in project history', async ({
  page,
}) => {
  const part = makeBody(200, 160, 0, [0, 0, 0], 'Paksuudeton pinta');
  await ready(page, [part]);
  await view(page, [part]);
  await open(page, part);
  const p = await projected(page),
    a = p(200, 80);
  await page.mouse.click(a.x, a.y);
  await expect(panel(page).getByRole('status')).toContainText('2 pistettä');
  await panel(page)
    .getByRole('textbox', { name: 'Geometrian siirtymä Z', exact: true })
    .fill('-10');
  await panel(page).getByRole('button', { name: 'Toteuta muutos', exact: true }).click();
  await expect(
    panel(page).getByRole('textbox', { name: 'Geometrian siirtymä Z', exact: true }),
  ).toHaveValue('0');
  const changed = await save(page);
  expect(changed.bodies[0].feature.type).toBe('brep');
  expect(changed.bodies[0].feature.type === 'brep' && changed.bodies[0].feature.solid).toBe(false);
  expect(bounds(changed.bodies)).toEqual({ min: [0, 0, -10], max: [200, 160, 0] });
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual([part]);
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  expect((await save(page)).bodies).toEqual(changed.bodies);
  await page.screenshot({ path: test.info().outputPath('precision-edge.png') });
  await bar(page).getByRole('button', { name: 'Valmis', exact: true }).click();
  await expect(bar(page)).toHaveCount(0);
});
test('dragging an edge changes just that edge, with no extra thickness or second canvas', async ({
  page,
}) => {
  const part = makeBody(200, 160, 0);
  await ready(page, [part]);
  await view(page, [part]);
  await open(page, part);
  const p = await projected(page),
    a = p(200, 80),
    b = p(230, 80);
  const builds = await page.getByTestId('viewport').getAttribute('data-geometry-builds');
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-geometry-builds', builds!);
  await page.mouse.up();
  await expect(
    panel(page).getByRole('textbox', { name: 'Geometrian siirtymä X', exact: true }),
  ).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Tallenna tiedosto', exact: true })).toBeEnabled();
  const changed = await save(page);
  expect(bounds(changed.bodies)).toEqual({ min: [0, 0, 0], max: [230, 160, 0] });
  await expect(page.locator('.viewport > canvas')).toHaveCount(1);
});
test('uses normal measurement tools without closing the geometry workspace', async ({ page }) => {
  const part = makeBody(200, 160, 40);
  await ready(page, [part]);
  await view(page, [part]);
  await open(page, part, 'Pisteet');
  const camera = await page.getByTestId('viewport').getAttribute('data-camera');
  await page.getByRole('button', { name: 'Mittatyökalu', exact: true }).click();
  await expect(bar(page)).toBeVisible();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-geometry-editing', '');
  await bar(page).getByRole('button', { name: 'Reunat', exact: true }).click();
  await expect(panel(page)).toBeVisible();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-camera', camera!);
});
test('dimension fields keep the rectangle start corner and work in both workspaces', async ({
  page,
}) => {
  const part = makeBody(100, 80, 4, [12, 18, 24]);
  await ready(page, [part]);
  await editBody(page, part.id);
  await page.getByText('Muokkaa mittoja', { exact: true }).click();
  await page.getByTestId('part-dimension-width').fill('92.25');
  await page.getByTestId('part-dimension-width').press('Tab');
  await page.getByTestId('part-dimension-depth').fill('43.5');
  await page.getByRole('button', { name: 'Päivitä mitat', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Päivitä mitat', exact: true })).toHaveCount(0);
  const first = await save(page);
  expect(bounds(first.bodies)).toEqual({ min: [12, 18, 24], max: [104.25, 61.5, 28] });
  await page
    .getByLabel('Muokkauksen kohde', { exact: true })
    .getByRole('button', { name: 'Reunat', exact: true })
    .click();
  await expect(panel(page)).toBeVisible();
  await panel(page).getByText('Muokkaa mittoja', { exact: true }).click();
  await panel(page).getByTestId('part-dimension-width').fill('110');
  await panel(page).getByTestId('part-dimension-width').press('Enter');
  await expect(panel(page).getByRole('button', { name: 'Päivitä mitat', exact: true })).toHaveCount(
    0,
  );
  expect(bounds((await save(page)).bodies)).toEqual({ min: [12, 18, 24], max: [122, 61.5, 28] });
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual(first.bodies);
});
test('circle diameter remains editable after its thickness changes', async ({ page }) => {
  const body = makeProfileBody({ kind: 'circle', radius: 6 }, sketchFrame([30, 40, 10]), 20);
  await ready(page, [body]);
  await editBody(page, body.id);
  await page.getByText('Muokkaa mittoja', { exact: true }).click();
  await page.getByTestId('part-dimension-diameter').fill('14.2');
  await page.getByTestId('part-dimension-distance').fill('30');
  await page.getByTestId('part-dimension-distance').press('Enter');
  await expect(page.getByRole('button', { name: 'Päivitä mitat', exact: true })).toHaveCount(0);
  const result = (await save(page)).bodies[0];
  expect(result.feature.type).toBe('profile-extrusion');
  expect(result.feature.height).toBe(30);
  expect(result.origin[0] + result.feature.width / 2).toBeCloseTo(30, 6);
  expect(result.origin[1] + result.feature.depth / 2).toBeCloseTo(40, 6);
});
test('phone layout keeps the geometry mode and controls reachable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const body = makeBody(100, 80, 0);
  await ready(page, [body]);
  const nudge = page.getByRole('dialog', { name: 'Enemmän tilaa mallille' });
  if (await nudge.isVisible())
    await nudge.getByRole('button', { name: 'Jatka selaimessa', exact: true }).click();
  const p = await projected(page),
    center = p(50, 40);
  await page.mouse.dblclick(center.x, center.y);
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-editing-body', body.id);
  await page
    .getByRole('complementary', { name: 'Ominaisuudet', exact: true })
    .getByRole('button', { name: 'Sulje ominaisuudet', exact: true })
    .click();
  await page
    .getByLabel('Muokkauksen kohde', { exact: true })
    .getByRole('button', { name: 'Reunat', exact: true })
    .click();
  await expect(panel(page)).toBeVisible();
  await expect(bar(page).getByRole('button', { name: 'Valmis', exact: true })).toBeInViewport();
  await expect(
    panel(page).getByRole('textbox', { name: 'Geometrian siirtymä X', exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await page.screenshot({ path: test.info().outputPath('precision-phone.png') });
  await panel(page).getByRole('button', { name: 'Sulje ominaisuudet', exact: true }).click();
  await expect(panel(page)).toBeHidden();
  await bar(page).getByRole('button', { name: 'Valmis', exact: true }).click();
  await expect(bar(page)).toHaveCount(0);
});
test('Shift during an edge drag uses an external exact reference ahead of the grid', async ({
  page,
}) => {
  const part = makeBody(100, 80, 0),
    reference = makeBody(20, 20, 20, [147, 0, 30]);
  await ready(page, [part, reference]);
  await view(page, [part, reference]);
  await open(page, part);
  const p = await projected(page),
    a = p(100, 40),
    b = p(112, 40),
    target = p(147, 0, 50);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.keyboard.down('Shift');
  await page.mouse.move(target.x, target.y, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await expect(
    panel(page).getByRole('textbox', { name: 'Geometrian siirtymä X', exact: true }),
  ).toBeEnabled();
  const result = await save(page);
  expect(result.bodies[0].feature.width).toBeCloseTo(147, 5);
  expect(result.bodies[1]).toEqual(reference);
});
test('Escape during a direct drag cancels it before pointer release', async ({ page }) => {
  const part = makeBody(200, 160, 0);
  await ready(page, [part]);
  await view(page, [part]);
  await open(page, part);
  const p = await projected(page),
    a = p(200, 80),
    b = p(240, 80);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect((await save(page)).bodies).toEqual([part]);
  await expect(bar(page)).toBeVisible();
});
test('a failed geometry module still allows returning to ordinary modeling', async ({ page }) => {
  const part = makeBody(100, 80, 20);
  await ready(page, [part]);
  await page.route(/GeometryEditor[^/]*\.(?:js|tsx)(?:\?.*)?$/, (route) => route.abort());
  await editBody(page, part.id);
  await page
    .getByLabel('Muokkauksen kohde', { exact: true })
    .getByRole('button', { name: 'Reunat', exact: true })
    .click();
  await expect(
    panel(page).getByText('Työkalua ei saatu ladattua.', { exact: false }),
  ).toBeVisible();
  await bar(page).getByRole('button', { name: 'Valmis', exact: true }).click();
  expect((await save(page)).bodies).toEqual([part]);
  await page.getByRole('button', { name: 'Siirrä', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Siirrä', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});
