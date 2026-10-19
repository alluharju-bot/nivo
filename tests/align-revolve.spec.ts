import { test, expect, type Page } from '@playwright/test';
import { makeBody, makeProfileBody } from '../src/model/project';
import { ready, view, save, click } from './helpers';
async function select(page: Page, id: string, shift = false) {
  const browser = page.getByRole('complementary', { name: 'Mallilista' });
  if ((await browser.getAttribute('data-expanded')) === 'false')
    await page.getByRole('button', { name: 'Näytä mallilista' }).press('Enter');
  await page.getByTestId(`body-${id}`).click({ modifiers: shift ? ['Shift'] : [] });
}
async function shapeTool(page: Page, name: string) {
  await page.getByRole('button', { name: 'Muodot', exact: true }).click();
  await page
    .getByRole('group', { name: 'Valitse muoto', exact: true })
    .getByRole('button', { name, exact: true })
    .click();
}
const profile = () =>
  makeProfileBody(
    { kind: 'rectangle', width: 20, depth: 40 },
    { origin: [10, 0, 0], u: [1, 0, 0], normal: [0, -1, 0] },
    0,
    'Sivuprofiili',
  );
const revolve = (p: Page) => p.getByRole('region', { name: 'Pyöräytä', exact: true });
test('aligns multiple parts to a locked reference picked in the viewport, with unchanged depth and one undo', async ({
  page,
}, info) => {
  const a = makeBody(20, 10, 30, [0, 0, 7], 'Osa A'),
    b = makeBody(10, 10, 30, [30, 0, 7], 'Osa B');
  const ref = { ...makeBody(100, 200, 400, [100, 300, 700], 'Vertailu'), locked: true };
  await ready(page, [a, b, ref]);
  const p = await view(page, [a, b, ref]);
  const before = (await page.getByTestId('viewport').boundingBox())!;
  await select(page, a.id);
  await select(page, b.id, true);
  await page.getByRole('button', { name: 'Piilota mallilista' }).press('Enter');
  await page.getByRole('button', { name: 'Kohdista…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Kohdista', exact: true });
  const after = (await page.getByTestId('viewport').boundingBox())!;
  const target = p(150, 400, 1100);
  await click(page, { x: target.x + after.x - before.x, y: target.y + after.y - before.y });
  await expect(dialog.getByLabel('Kohdistuksen vertailuosa')).toHaveValue(ref.id);
  await expect(dialog.getByRole('status')).toContainText('X 130 mm');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-move-preview', 'true');
  await page.screenshot({ path: info.outputPath('alignment-preview.png') });
  expect((await save(page)).bodies).toEqual([a, b, ref]);
  await dialog.getByRole('button', { name: 'Hyväksy kohdistus' }).click();
  await expect(dialog).toBeHidden();
  const moved = await save(page);
  expect(moved.bodies.map((b) => b.origin)).toEqual([[130, 395, 7], [160, 395, 7], ref.origin]);
  expect(moved.bodies[2]).toEqual(ref);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual([a, b, ref]);
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  expect((await save(page)).bodies).toEqual(moved.bodies);
  await page.getByRole('button', { name: 'Kohdista…', exact: true }).click();
  await dialog.getByLabel('Kohdistuksen vertailuosa').selectOption(ref.id);
  await dialog.getByRole('button', { name: 'Kohdista Z', exact: true }).click();
  await dialog.getByLabel('Z siirrettävän kohta').selectOption('min');
  await dialog.getByLabel('Z vertailuosan kohta').selectOption('max');
  await expect(dialog.getByRole('status')).toContainText('Z 1093 mm');
  await page.keyboard.press('Escape');
  expect((await save(page)).bodies).toEqual(moved.bodies);
});
test('creates and re-edits a revolved profile after reload, preserving the part identity and undo', async ({
  page,
}, info) => {
  const source = profile();
  await ready(page, [source]);
  await view(page, [source], 'front');
  await shapeTool(page, 'Pyöräytä');
  const panel = revolve(page);
  await panel.getByLabel('Pyöräytyksen profiili').selectOption(source.id);
  await panel.getByLabel('Pyöräytysakselin piste X').fill('0');
  await expect(panel.getByRole('button', { name: 'Luo pyörähdyskappale' })).toBeEnabled();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-surface-preview', 'true');
  expect((await save(page)).bodies).toEqual([source]);
  await page.screenshot({ path: info.outputPath('revolution-preview.png') });
  await panel.getByRole('button', { name: 'Luo pyörähdyskappale' }).click();
  let project = await save(page),
    body = project.bodies[1];
  expect(project.bodies[0]).toEqual({ ...source, hidden: true });
  expect(body.feature.type === 'brep' && body.feature.revolution?.angle).toBe(360);
  await page.getByRole('button', { name: 'Muokkaa pyöräytystä', exact: true }).click();
  await panel.getByLabel('Pyöräytyskulma').fill('180');
  await panel.getByRole('button', { name: 'Päivitä pyöräytys' }).click();
  project = await save(page);
  body = project.bodies[1];
  expect(body.feature.type === 'brep' && body.feature.revolution?.angle).toBe(180);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  const undone = (await save(page)).bodies[1];
  expect(undone.feature.type === 'brep' && undone.feature.revolution?.angle).toBe(360);
  expect((await save(page)).bodies[1].id).toBe(body.id);
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  await expect(page.locator('.save-status')).toContainText('Tallessa selaimessa');
  await page.reload();
  await select(page, body.id);
  await page.getByRole('button', { name: 'Muokkaa pyöräytystä', exact: true }).click();
  await expect(panel.getByLabel('Pyöräytyskulma')).toHaveValue('180');
  await panel.getByLabel('Pyöräytyskulma').fill('0');
  await expect(panel.getByRole('status')).toContainText('kulma');
  await expect(panel.getByRole('button', { name: 'Päivitä pyöräytys' })).toBeDisabled();
  await page.keyboard.press('Escape');
  expect((await save(page)).bodies).toEqual(project.bodies);
  await page.getByRole('button', { name: 'Muokkaa pyöräytystä', exact: true }).click();
  await panel.getByRole('button', { name: 'Palauta profiili muokattavaksi' }).click();
  await expect(panel).toBeHidden();
  expect((await save(page)).bodies).toHaveLength(3);
  await expect(page.getByRole('button', { name: 'Muokkaa pyöräytystä', exact: true })).toBeHidden();
});
test('picks a profile edge as the revolution axis without starting a move or changing the profile', async ({
  page,
}) => {
  const source = profile();
  await ready(page, [source]);
  const p = await view(page, [source], 'front');
  await shapeTool(page, 'Pyöräytä');
  const panel = revolve(page);
  await panel.getByLabel('Pyöräytyksen profiili').selectOption(source.id);
  await panel.getByRole('button', { name: 'Poimi suora reuna' }).click();
  await page.mouse.move(p(10, 0, 20).x, p(10, 0, 20).y);
  await click(page, p(10, 0, 20));
  await expect(panel.getByRole('button', { name: 'Lopeta poiminta' })).toBeHidden();
  await expect(panel.getByLabel('Pyöräytysakselin piste X')).toHaveValue('10');
  await expect(panel.getByRole('button', { name: 'Luo pyörähdyskappale' })).toBeEnabled();
  await page.keyboard.press('Escape');
  expect((await save(page)).bodies).toEqual([source]);
});

test('draws a Bézier with ordinary tools and revolves it into an editable surface', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const floor = makeBody(600, 400, 0);
  await ready(page, [floor]);
  const p = await view(page, [floor]);
  await shapeTool(page, 'Bézier-käyrä');
  await click(page, p(100, 100));
  await click(page, p(200, 200));
  await click(page, p(400, 300));
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '2');
  const curve = (await save(page)).bodies[1];
  await shapeTool(page, 'Pyöräytä');
  const panel = revolve(page);
  await panel.getByLabel('Pyöräytyksen profiili').selectOption(curve.id);
  await panel.getByLabel('Pyöräytysakselin piste X').fill('0');
  await panel.getByLabel('Pyöräytyskulma').fill('270');
  await expect(panel.getByRole('status')).toContainText('Pinta · esikatselu valmis');
  await panel.getByRole('button', { name: 'Luo pyörähdyskappale' }).click();
  const result = (await save(page)).bodies[2];
  expect(result.feature.type === 'brep' && result.feature.revolution?.curve).toBeTruthy();
  expect(result.feature.type === 'brep' && result.feature.solid).toBe(false);
  await page.getByRole('button', { name: 'Yleisnäkymä', exact: true }).click();
  await page.getByRole('button', { name: 'Sovita näkymään', exact: true }).click();
  await page.screenshot({ path: info.outputPath('bezier-revolution.png') });
  await page.getByRole('button', { name: 'Muokkaa pyöräytystä', exact: true }).click();
  await panel.getByRole('button', { name: 'Palauta profiili muokattavaksi' }).click();
  await expect(panel).toBeHidden();
  const restored = (await save(page)).bodies[3];
  expect(restored.curve?.points.length).toBe(curve.curve?.points.length);
  expect(errors).toEqual([]);
});
