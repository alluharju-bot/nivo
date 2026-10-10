import { test, expect } from '@playwright/test';
import { makeBody, makeProfileBody } from '../src/model/project';
import { sketchFrame } from '../src/model/sketch';
import { ready, view, save, revealBrowser } from './helpers';

test('merge a room outline, offset outward and push/pull the new rim into walls; undo and reload preserve it', async ({
  page,
}, info) => {
  const a = makeBody(400, 240, 0, [0, 0, 0], 'Huone A');
  const b = makeBody(240, 400, 0, [0, 0, 0], 'Huone B');
  await ready(page, [a, b]);
  const at = await view(page, [a, b]);
  await revealBrowser(page);
  await page.getByTestId(`body-${a.id}`).click();
  await page.getByTestId(`body-${b.id}`).click({ modifiers: ['Shift'] });
  await page.getByRole('button', { name: 'Yhdistä muodot', exact: true }).click();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
  const merged = await save(page);
  expect(merged.bodies[0].feature).toMatchObject({
    type: 'brep',
    solid: false,
    width: 400,
    depth: 400,
  });
  await page.getByRole('button', { name: 'Piilota mallilista' }).press('Enter');
  const point = at(160, 20, 0);
  await page.mouse.move(point.x, point.y);
  await page.keyboard.press('o');
  await page.getByRole('button', { name: 'Ulospäin', exact: true }).click();
  await page.keyboard.type('20');
  await expect(page.getByTestId('offset-input')).toHaveValue('-20');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-offset-preview', '-20');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  const offset = await save(page);
  expect(offset.bodies[0]).toMatchObject({
    origin: [-20, -20, 0],
    feature: { width: 440, depth: 440, solid: false },
  });
  await page.keyboard.press('e');
  await page.keyboard.type('200');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  const walls = await save(page);
  expect(walls.bodies[0].feature).toMatchObject({ solid: true, height: 200 });
  await page.getByRole('button', { name: 'Yleisnäkymä', exact: true }).click();
  await page.screenshot({ path: info.outputPath('room-walls.png') });
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual(offset.bodies);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual(merged.bodies);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual([a, b]);
  for (let i = 0; i < 3; i++)
    await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  await expect(page.locator('.save-status')).toContainText('Tallessa selaimessa');
  await page.reload();
  await expect(page.locator('.busy-badge')).toHaveCount(0);
  expect((await save(page)).bodies).toEqual(walls.bodies);
});

test('outward offset follows a free pointer drag, exact typed size wins and Escape cancels it', async ({
  page,
}) => {
  const floor = makeBody(400, 300, 0);
  await ready(page, [floor]);
  const at = await view(page, [floor]);
  await page.mouse.move(at(100, 10, 0).x, at(100, 10, 0).y);
  await page.keyboard.press('o');
  await page.mouse.move(at(100, -40, 0).x, at(100, -40, 0).y);
  await expect(page.getByTestId('offset-input')).toHaveValue('-30');
  await page.keyboard.type('13');
  await expect(page.getByTestId('offset-input')).toHaveValue('-13');
  await page.mouse.move(at(100, 70, 0).x, at(100, 70, 0).y);
  await expect(page.getByTestId('offset-input')).toHaveValue('-13');
  await page.keyboard.press('Escape');
  expect((await save(page)).bodies).toEqual([floor]);
});

test('context-menu merge supports circles and rectangles', async ({ page }) => {
  const a = makeBody(200, 200, 0, [0, 0, 0], 'Neliö');
  const b = makeProfileBody(
    { kind: 'circle', radius: 80 },
    sketchFrame([200, 100, 0]),
    0,
    'Ympyrä',
  );
  await ready(page, [a, b]);
  const at = await view(page, [a, b]);
  await revealBrowser(page);
  await page.getByTestId(`body-${a.id}`).click();
  await page.getByTestId(`body-${b.id}`).click({ modifiers: ['Shift'] });
  await page.getByRole('button', { name: 'Piilota mallilista' }).press('Enter');
  await page.mouse.click(at(80, 80, 0).x, at(80, 80, 0).y, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Yhdistä muodot', exact: true }).click();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
  expect((await save(page)).bodies[0].feature).toMatchObject({
    width: 280,
    depth: 200,
    solid: false,
  });
});

test('different planes are rejected without consuming shapes', async ({ page }) => {
  const a = makeBody(200, 200, 0);
  const b = makeBody(200, 200, 0, [100, 0, 1]);
  await ready(page, [a, b]);
  await page.getByTestId(`body-${a.id}`).click();
  await page.getByTestId(`body-${b.id}`).click({ modifiers: ['Shift'] });
  await page.getByRole('button', { name: 'Yhdistä muodot', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('samalla tasolla');
  expect((await save(page)).bodies).toEqual([a, b]);
});
