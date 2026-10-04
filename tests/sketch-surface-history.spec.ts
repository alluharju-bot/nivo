import { test, expect } from '@playwright/test';
import { ready, view, click, save, revealBrowser } from './helpers';
import { makeBody, type Guide } from '../src/model/project';

const snap = async (page: import('@playwright/test').Page) =>
  JSON.parse((await page.getByTestId('viewport').getAttribute('data-snap-point')) || 'null');

test('standalone two-point pen line divides a floor without entering edit mode and remains undoable', async ({
  page,
}) => {
  const floor = makeBody(600, 400, 100, [0, 0, -100], 'Lattia');
  await ready(page, [floor]);
  const p = await view(page, [floor]);
  await page.keyboard.press('k');
  await click(page, p(200, 0, 0));
  await click(page, p(200, 400, 0));
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '2');
  const withLine = await save(page);
  expect(withLine.bodies[0]).toEqual(floor);
  await page.getByRole('button', { name: 'Jaa pinta', exact: true }).click();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-editing-body', '');
  const divided = (await save(page)).bodies[0];
  expect(divided.feature.type).toBe('brep');
  await page.mouse.move(p(100, 200, 0).x, p(100, 200, 0).y);
  await page.keyboard.press('e');
  await page.keyboard.type('50');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  expect((await save(page)).bodies[0].feature.height).toBe(150);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies[0]).toEqual(divided);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual(withLine.bodies);
});

test('pen Shift projects guide intersections and arbitrary edges onto its current direction', async ({
  page,
}) => {
  const floor = makeBody(600, 400, 20, [0, 0, -20]);
  const guides: Guide[] = [
    {
      id: 'vertical',
      anchor: { point: [350, 0, 0] },
      plane: 'XY',
      angle: 90,
      length: 400,
      mode: 'guide',
    },
    {
      id: 'horizontal',
      anchor: { point: [0, 250, 0] },
      plane: 'XY',
      angle: 0,
      length: 600,
      mode: 'guide',
    },
  ];
  await ready(page, [floor], guides);
  const p = await view(page, [floor]);
  await page.keyboard.press('k');
  await click(page, p(100, 100, 0));
  await page.mouse.move(p(200, 100, 0).x, p(200, 100, 0).y);
  await page.keyboard.down('Shift');
  await page.mouse.move(p(350, 250, 0).x, p(350, 250, 0).y);
  await expect.poll(() => snap(page)).toEqual([350, 100, 0]);
  await click(page, p(350, 250, 0));
  await page.keyboard.up('Shift');
  await page.mouse.move(p(400, 100, 0).x, p(400, 100, 0).y);
  await page.keyboard.down('Shift');
  await page.mouse.move(p(457, 400, 0).x, p(457, 400, 0).y);
  await expect.poll(async () => (await snap(page))[0]).toBeCloseTo(457, 3);
  await expect.poll(async () => (await snap(page))[1]).toBe(100);
  await click(page, p(457, 400, 0));
  await page.keyboard.up('Shift');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '2');
  const line = (await save(page)).bodies[1];
  expect(line.origin).toEqual([100, 100, 0]);
  expect(line.feature.width).toBeCloseTo(357, 3);
  expect(line.feature.depth).toBeCloseTo(0, 5);
});

test('Enter-completed rectangle stays a cutter and history restores consumed shape, target choices and undo/redo', async ({
  page,
}) => {
  const front = makeBody(600, 40, 400, [0, 0, 0], 'Etuseinä'),
    back = makeBody(600, 40, 400, [0, 100, 0], 'Takaseinä');
  await ready(page, [front, back]);
  const p = await view(page, [front, back], 'front');
  await page.keyboard.press('s');
  await click(page, p(150, 0, 0));
  await page.mouse.move(p(450, 0, 300).x, p(450, 0, 300).y);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '3');
  const before = await save(page),
    profile = before.bodies[2];
  await page.keyboard.press('Escape');
  await revealBrowser(page);
  await page.getByTestId(`body-${profile.id}`).click();
  await page.getByRole('button', { name: 'Leikkaa aukko…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Leikkaa aukko', exact: true });
  await dialog.getByRole('checkbox', { name: 'Takaseinä', exact: true }).uncheck();
  await dialog.getByRole('button', { name: 'Peruuta', exact: true }).click();
  expect((await save(page)).bodies).toEqual(before.bodies);
  await page.getByRole('button', { name: 'Toimintohistoria', exact: true }).click();
  await page.getByRole('button', { name: 'Jatka leikkausta', exact: true }).first().click();
  await expect(dialog.getByRole('checkbox', { name: 'Takaseinä', exact: true })).not.toBeChecked();
  await dialog.getByRole('button', { name: 'Leikkaa läpi · 1 osaa', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const cut = await save(page);
  expect(cut.bodies).toHaveLength(2);
  expect(cut.bodies[1]).toEqual(back);
  await expect(page.locator('.save-status')).toContainText('Tallessa selaimessa');
  await page.reload();
  await expect(page.locator('.busy-badge')).toHaveCount(0);
  await page.getByRole('button', { name: 'Toimintohistoria', exact: true }).click();
  await page.getByRole('button', { name: 'Palaa leikkaukseen', exact: true }).first().click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('checkbox', { name: 'Etuseinä', exact: true })).toBeChecked();
  await expect(dialog.getByRole('checkbox', { name: 'Takaseinä', exact: true })).not.toBeChecked();
  await expect(dialog.getByRole('checkbox', { name: 'Säilytä piirretty muoto' })).not.toBeChecked();
  await page.keyboard.press('Escape');
  expect((await save(page)).bodies).toEqual(before.bodies);
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  expect((await save(page)).bodies).toEqual(cut.bodies);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual(before.bodies);
  await revealBrowser(page);
  await page.getByTestId(`body-${profile.id}`).click();
  await expect(page.getByRole('button', { name: 'Leikkaa aukko…', exact: true })).toBeEnabled();
});

test('circle extending outside a part can divide its surface and push through to the back without edit mode', async ({
  page,
}) => {
  const plate = makeBody(600, 400, 20, [0, 0, -20], 'Levy');
  await ready(page, [plate]);
  const p = await view(page, [plate]);
  await page.keyboard.press('c');
  await click(page, p(0, 200, 0));
  await click(page, p(80, 200, 0));
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '2');
  await page.getByRole('button', { name: 'Jaa pinta', exact: true }).click();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
  const divided = (await save(page)).bodies[0];
  await page.mouse.move(p(40, 200, 0).x, p(40, 200, 0).y);
  await page.keyboard.press('e');
  await page.keyboard.type('-20');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  const result = (await save(page)).bodies[0];
  expect(result.feature.type).toBe('brep');
  expect(result.feature).not.toEqual(divided.feature);
  result.origin.forEach((n, i) => expect(n).toBeCloseTo(plate.origin[i], 6));
  expect(result.feature.width).toBeCloseTo(600, 6);
  expect(result.feature.depth).toBeCloseTo(400, 6);
  expect(result.feature.height).toBeCloseTo(20, 6);
});

test('touch reference picking uses the same guide projection as pen Shift', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'tablet');
  const floor = makeBody(600, 400, 20, [0, 0, -20]);
  const guides: Guide[] = [
    {
      id: 'vertical',
      anchor: { point: [350, 0, 0] },
      plane: 'XY',
      angle: 90,
      length: 400,
      mode: 'guide',
    },
    {
      id: 'horizontal',
      anchor: { point: [0, 250, 0] },
      plane: 'XY',
      angle: 0,
      length: 600,
      mode: 'guide',
    },
  ];
  await ready(page, [floor], guides);
  const p = await view(page, [floor]);
  await page.getByRole('button', { name: 'Kynä', exact: true }).tap();
  await page.touchscreen.tap(p(100, 100, 0).x, p(100, 100, 0).y);
  await page.getByRole('button', { name: 'Lukitse X-akseli', exact: true }).tap();
  await page.getByRole('button', { name: 'Poimi viite', exact: true }).tap();
  await expect(
    page.getByRole('button', { name: 'Napauta viitepistettä', exact: true }),
  ).toBeVisible();
  const ref = p(350, 250, 0);
  await page.touchscreen.tap(ref.x, ref.y);
  await expect(page.getByTestId('reference-lock')).toContainText('Apuviivojen risteys');
  await expect(page.getByTestId('pen-length')).toHaveValue('250');
  await page.touchscreen.tap(ref.x, ref.y);
  await page.getByRole('button', { name: 'Valmis viiva', exact: true }).tap();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '2');
  const line = (await save(page)).bodies[1];
  expect(line.origin).toEqual([100, 100, 0]);
  expect(line.feature.width).toBe(250);
  expect(line.feature.depth).toBe(0);
});

test('surface division exposes linked targets before making a local change', async ({ page }) => {
  const { asComponent } = await import('../src/model/components');
  const { makeProfileBody } = await import('../src/model/project');
  const { sketchFrame } = await import('../src/model/sketch');
  const first = asComponent(makeBody(400, 300, 20, [0, 0, -20], 'Kohde'));
  const other = asComponent(makeBody(400, 300, 20, [600, 0, -20], 'Kopio'), first.component!.id);
  const profile = makeProfileBody({ kind: 'circle', radius: 40 }, sketchFrame([150, 150, 0]));
  await ready(page, [first, other, profile]);
  await page.getByTestId(`body-${profile.id}`).click();
  await page.getByRole('button', { name: 'Jaa pinta', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Jaa pinta', exact: true });
  await expect(dialog).toContainText('uniikeiksi');
  await page.keyboard.press('Escape');
  expect((await save(page)).bodies).toEqual([first, other, profile]);
  await page.getByRole('button', { name: 'Jaa pinta', exact: true }).click();
  await dialog.getByRole('button', { name: 'Jaa valitut pinnat', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const result = await save(page);
  expect(result.bodies).toHaveLength(2);
  expect(result.bodies[0].feature.type).toBe('brep');
  expect(result.bodies[0].component).toBeUndefined();
  expect(result.bodies[1]).toEqual(other);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual([first, other, profile]);
});
