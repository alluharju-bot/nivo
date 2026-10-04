import { test, expect } from '@playwright/test';
import { ready, view, click, save, editBody, revealBrowser } from './helpers';
import { makeBody, makeProfileBody } from '../src/model/project';
import { sketchFrame } from '../src/model/sketch';
import { asComponent } from '../src/model/components';

async function actions(page: import('@playwright/test').Page, label: string) {
  await page.getByRole('button', { name: 'Valinnan toiminnot', exact: true }).click();
  await page.getByRole('menuitem', { name: label, exact: true }).click();
}

test('open pen divides the edited floor, saves the boundary and push/pulls one region', async ({
  page,
}) => {
  const floor = makeBody(600, 400, 100, [0, 0, -100], 'Lattia');
  await ready(page, [floor]);
  const p = await view(page, [floor]);
  await editBody(page, floor.id);
  await page.keyboard.press('k');
  await click(page, p(200, 0, 0));
  await click(page, p(200, 400, 0));
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  const result = await save(page);
  expect(result.bodies).toHaveLength(1);
  expect(result.bodies[0].feature.type).toBe('brep');
  await page.mouse.move(p(100, 200, 0).x, p(100, 200, 0).y);
  await page.keyboard.press('e');
  await page.keyboard.type('50');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  expect((await save(page)).bodies[0].feature.height).toBeCloseTo(150, 5);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  await expect.poll(async () => (await save(page)).bodies[0].feature.height).toBe(100);
  await expect(page.locator('.save-status')).toContainText('Tallessa selaimessa');
  await page.reload();
  await expect(page.locator('.busy-badge')).toHaveCount(0);
  const q = await view(page, result.bodies);
  await editBody(page, floor.id);
  await page.keyboard.press('u');
  await click(page, q(200, 200, 0));
  await expect.poll(async () => (await save(page)).bodies[0].feature.type).toBe('brep');
  // Erasing restores the solid while keeping its exact bounds.
  const erased = (await save(page)).bodies[0];
  expect(erased.feature).not.toEqual(result.bodies[0].feature);
  expect(erased.origin).toEqual(floor.origin);
  expect(erased.feature).toMatchObject({ width: 600, depth: 400, height: 100 });
});

test('an open line outside edit mode remains separate, selectable, movable and erasable after reload', async ({
  page,
}) => {
  const floor = makeBody(600, 400, 100, [0, 0, -100]);
  await ready(page, [floor]);
  const p = await view(page, [floor]);
  await page.keyboard.press('k');
  await click(page, p(100, 100, 0));
  await click(page, p(400, 250, 0));
  await page.getByRole('button', { name: 'Valmis viiva', exact: true }).click();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '2');
  const result = await save(page);
  expect(result.bodies[0]).toEqual(floor);
  expect(result.bodies[1].feature).toMatchObject({ type: 'brep', solid: false });
  await expect(page.locator('.save-status')).toContainText('Tallessa selaimessa');
  await page.reload();
  await expect(page.locator('.busy-badge')).toHaveCount(0);
  const q = await view(page, result.bodies);
  await click(page, q(250, 175, 0));
  await expect(page.getByTestId(`body-${result.bodies[1].id}`)).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.keyboard.press('m');
  await page.getByTestId('move-x').fill('40');
  await page.getByTestId('move-x').press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  expect((await save(page)).bodies[1].origin[0]).toBeCloseTo(140, 5);
  await page.keyboard.press('u');
  await click(page, q(290, 175, 0));
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
  expect((await save(page)).bodies).toEqual([floor]);
});

test('removing groups keeps their contents and empty groups can be deleted from Move and undone', async ({
  page,
}) => {
  const part = { ...makeBody(100, 100, 20), groupId: 'child' };
  await ready(
    page,
    [part],
    [],
    [
      { id: 'root', name: 'Runko', hidden: false },
      { id: 'child', name: 'Hyllyt', hidden: false, parentId: 'root' },
      { id: 'empty', name: 'Tyhjä', hidden: false },
    ],
  );
  await page.getByRole('button', { name: 'Valitse ryhmä: Runko', exact: true }).click();
  await page.getByRole('button', { name: 'Poista ryhmä', exact: true }).click();
  let result = await save(page);
  expect(result.bodies).toEqual([part]);
  expect(result.groups.find((g) => g.id === 'child')?.parentId).toBeUndefined();
  await page.keyboard.press('m');
  await page.getByRole('button', { name: 'Pidä mallilista näkyvissä', exact: true }).focus();
  await page.getByRole('button', { name: 'Pidä mallilista näkyvissä', exact: true }).click();
  await page.getByRole('button', { name: 'Valitse ryhmä: Tyhjä', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Valitse', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.keyboard.press('Delete');
  await expect(page.getByRole('button', { name: 'Valitse ryhmä: Tyhjä', exact: true })).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  result = await save(page);
  expect(result.groups.some((g) => g.id === 'empty')).toBe(true);
});

test('context dropdown moves a multiselection between nested groups and back to root', async ({
  page,
}, info) => {
  const parts = [makeBody(100, 100, 20), makeBody(100, 100, 20, [200, 0, 0])];
  await ready(
    page,
    parts,
    [],
    [
      { id: 'root', name: 'Kaluste', hidden: false },
      { id: 'child', name: 'Hyllyt', hidden: false, parentId: 'root' },
    ],
  );
  await page.getByTestId(`body-${parts[0].id}`).click();
  await page.getByTestId(`body-${parts[1].id}`).click({ modifiers: ['Shift'] });
  await actions(page, 'Siirrä ryhmään…');
  const dialog = page.getByRole('dialog', { name: 'Siirrä ryhmään', exact: true });
  await dialog.getByRole('combobox', { name: 'Kohderyhmä' }).selectOption('child');
  await page.screenshot({ path: info.outputPath('move-to-group.png') });
  await dialog.getByRole('button', { name: 'Siirrä', exact: true }).click();
  expect((await save(page)).bodies.map((b) => b.groupId)).toEqual(['child', 'child']);
  await actions(page, 'Siirrä ryhmään…');
  await dialog.getByRole('combobox', { name: 'Kohderyhmä' }).selectOption('');
  await dialog.getByRole('button', { name: 'Siirrä', exact: true }).click();
  expect((await save(page)).bodies).toEqual(parts);
});

test('quick opening previews actual targets, cuts wall layers locally and undoes as one operation', async ({
  page,
}, info) => {
  const front = asComponent(makeBody(1000, 18, 2400, [0, 0, 0], 'Etulevy'));
  const back = makeBody(1000, 100, 2400, [0, 80, 0], 'Runko');
  const copy = asComponent(
    makeBody(1000, 18, 2400, [1500, 0, 0], 'Toinen seinä'),
    front.component!.id,
  );
  const held = { ...makeBody(1000, 18, 2400, [0, 300, 0], 'Hold-levy'), locked: true };
  const profile = makeProfileBody(
    { kind: 'rectangle', width: 600, depth: 2000 },
    sketchFrame([200, 0, 0], [0, -1, 0]),
    0,
    'Oviaukko',
  );
  const parts = [front, back, copy, held, profile];
  await ready(page, parts);
  await view(page, parts, 'front');
  await revealBrowser(page);
  await page.getByTestId(`body-${profile.id}`).click();
  await actions(page, 'Leikkaa aukko…');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Leikkaa aukko', exact: true })).toHaveCount(0);
  await actions(page, 'Leikkaa aukko…');
  const dialog = page.getByRole('dialog', { name: 'Leikkaa aukko', exact: true });
  await expect(dialog.locator('.opening-targets input')).toHaveCount(2);
  await expect(dialog).toContainText('uniikeiksi');
  await expect(page.getByTestId('viewport')).toHaveAttribute(
    'data-move-hovered',
    JSON.stringify([front.id, back.id]),
  );
  await page.screenshot({ path: info.outputPath('door-opening.png') });
  await dialog.getByRole('button', { name: 'Leikkaa läpi · 2 osaa', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const result = await save(page);
  expect(result.bodies).toHaveLength(4);
  expect(result.bodies[0].feature.type).toBe('brep');
  expect(result.bodies[0].component).toBeUndefined();
  expect(result.bodies[1].feature.type).toBe('brep');
  expect(result.bodies[2]).toEqual(copy);
  expect(result.bodies[3]).toEqual(held);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual(parts);
});

test('drawn shape offers a direct opening action, allows target exclusion and keeps its outline', async ({
  page,
}) => {
  const front = makeBody(600, 40, 400, [0, 0, 0], 'Etuseinä'),
    back = makeBody(600, 40, 400, [0, 100, 0], 'Takaseinä');
  await ready(page, [front, back]);
  const p = await view(page, [front, back], 'front');
  await page.keyboard.press('s');
  await click(page, p(150, 0, 0));
  await click(page, p(450, 0, 300));
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '3');
  await page.getByRole('button', { name: 'Leikkaa aukko…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Leikkaa aukko', exact: true });
  await dialog.getByRole('checkbox', { name: 'Takaseinä', exact: true }).uncheck();
  await dialog.getByRole('checkbox', { name: 'Säilytä piirretty muoto', exact: true }).check();
  await dialog.getByRole('button', { name: 'Leikkaa läpi · 1 osaa', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const result = await save(page);
  expect(result.bodies).toHaveLength(3);
  expect(result.bodies[0].feature.type).toBe('brep');
  expect(result.bodies[1]).toEqual(back);
  expect(result.bodies[2].feature.type).toBe('profile-extrusion');
});
