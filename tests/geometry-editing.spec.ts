import { test, expect, type Page } from '@playwright/test';
import { ready, view, save } from './helpers';
import { makeBody, makeProfileBody, bounds, type Body } from '../src/model/project';
import { sketchFrame } from '../src/model/sketch';
import { asComponent } from '../src/model/components';
import { panel, bar, open, projected } from './precision-helpers';
import { meshBody } from '../src/exchange/mesh';
import { editableGeometry, validateGeometry } from '../src/model/geometryEditing';
const errors = new WeakMap<Page, string[]>();
test('a circular rim supports a local lifted point and soft shaping, with undo and reload', async ({
  page,
}) => {
  const body = makeProfileBody({ kind: 'circle', radius: 100 }, sketchFrame([0, 0, 0]), 0);
  await ready(page, [body]);
  await view(page, [body]);
  await open(page, body, 'Pisteet');
  await panel(page).getByRole('button', { name: 'Muokkaa verkkokopiota', exact: true }).click();
  const p = await projected(page),
    point = p(100, 0, 0);
  await page.mouse.click(point.x, point.y);
  await expect(panel(page).getByRole('status')).toContainText('1 pistettä');
  const z = panel(page).getByRole('textbox', { name: 'Geometrian siirtymä Z', exact: true });
  await z.fill('15');
  await z.press('Enter');
  await expect(z).toHaveValue('0');
  const result = await save(page),
    changed = result.bodies.find((b) => !b.hidden)!;
  expect(changed.feature.type).toBe('mesh');
  expect(changed.feature.height).toBeCloseTo(15, 4);
  const g = editableGeometry(changed, meshBody(changed), false);
  expect(() => validateGeometry(g, g.points)).not.toThrow();
  const raised = g.points.findIndex((p) => p[2] > 14);
  expect(g.triangles.filter((i) => i === raised).length).toBeLessThan(8);
  await panel(page).getByText('Pehmeä muotoilu', { exact: true }).click();
  await panel(page).getByRole('checkbox', { name: 'Vaikuta myös lähipisteisiin' }).check();
  await panel(page).getByRole('textbox', { name: 'Muotoilun vaikutusetäisyys' }).fill('55 mm');
  await z.fill('5');
  await z.press('Enter');
  await expect(z).toHaveValue('0');
  const soft = await save(page),
    softBody = soft.bodies.find((b) => !b.hidden)!;
  expect(softBody.feature.height).toBeCloseTo(20, 4);
  const gg = editableGeometry(softBody, meshBody(softBody), false);
  expect(gg.points.filter((p) => p[2] > 0.1).length).toBeGreaterThan(1);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual(result.bodies);
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  expect((await save(page)).bodies).toEqual(soft.bodies);
  await page.reload();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
  expect((await save(page)).bodies).toEqual(soft.bodies);
});
test.beforeEach(({ page }) => {
  const list: string[] = [];
  errors.set(page, list);
  page.on('pageerror', (e) => list.push(e.message));
});
test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([]);
});
async function top(page: Page) {
  const details = panel(page).getByText('Valinta ja tarkkuus', { exact: true });
  await details.click();
  await panel(page).getByRole('button', { name: 'Valitse Z+ tason pisteet', exact: true }).click();
}
test('point/edge/face selection, Shift and scale use one viewport and normal tool shortcuts', async ({
  page,
}) => {
  const body = makeBody(200, 160, 60);
  await ready(page, [body]);
  await view(page, [body]);
  await open(page, body, 'Pisteet');
  const p = await projected(page),
    a = p(0, 0, 60),
    b = p(200, 160, 60);
  await page.mouse.move(a.x, a.y);
  await expect(page.getByTestId('viewport')).toHaveCSS('cursor', 'crosshair');
  await page.mouse.click(a.x, a.y);
  await expect(panel(page).getByRole('status')).toContainText('1 pistettä');
  await page.keyboard.down('Shift');
  await page.mouse.click(b.x, b.y);
  await page.keyboard.up('Shift');
  await expect(panel(page).getByRole('status')).toContainText('2 pistettä');
  await panel(page).getByRole('button', { name: 'Tyhjennä', exact: true }).click();
  await bar(page).getByRole('button', { name: 'Reunat', exact: true }).click();
  const edge = p(100, 0, 60);
  await page.mouse.click(edge.x, edge.y);
  await expect(panel(page).getByRole('status')).toContainText('2 pistettä');
  await panel(page).getByRole('button', { name: 'Tyhjennä', exact: true }).click();
  await bar(page).getByRole('button', { name: 'Pinnat', exact: true }).click();
  const c = p(100, 80, 60);
  await page.mouse.click(c.x, c.y);
  await expect(panel(page).getByRole('status')).toContainText('4 pistettä');
  await page.keyboard.press('l');
  await panel(page).getByRole('button', { name: 'Z', exact: true }).click();
  const factor = panel(page).getByRole('textbox', {
    name: 'Geometrian skaala Skaala',
    exact: true,
  });
  await factor.fill('50');
  await factor.press('Enter');
  await expect(factor).toHaveValue('100');
  expect(bounds((await save(page)).bodies)).toEqual({ min: [0, 0, 0], max: [200, 160, 60] });
  await page.getByTestId('viewport').focus();
  await page.keyboard.press('m');
  await top(page);
  const z = panel(page).getByRole('textbox', { name: 'Geometrian siirtymä Z', exact: true });
  await z.fill('-10');
  await z.press('Enter');
  await expect(z).toHaveValue('0');
  expect(bounds((await save(page)).bodies).max[2]).toBe(50);
});
test('invalid drafts are recoverable and Esc cancels a preview without erasing committed history', async ({
  page,
}) => {
  const body = makeBody(100, 80, 60);
  await ready(page, [body]);
  await open(page, body, 'Pisteet');
  await top(page);
  const z = panel(page).getByRole('textbox', { name: 'Geometrian siirtymä Z', exact: true });
  await z.fill('-60');
  await z.press('Enter');
  await expect(panel(page).getByRole('alert')).toContainText('Pisteet osuvat yhteen');
  await z.fill('15');
  await z.press('Enter');
  await expect(z).toHaveValue('0');
  const committed = await save(page);
  expect(committed.bodies[0].feature.height).toBe(75);
  await z.fill('12');
  await z.press('Escape');
  await expect(z).toHaveValue('0');
  expect((await save(page)).bodies).toEqual(committed.bodies);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual([body]);
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  expect((await save(page)).bodies).toEqual(committed.bodies);
  await page.reload();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
  expect((await save(page)).bodies).toEqual(committed.bodies);
});
test('linked edits propagate and held siblings require explicit uniqueness', async ({ page }) => {
  const a = asComponent(makeBody(100, 80, 60)),
    b = asComponent(makeBody(100, 80, 60, [200, 0, 0]), a.component!.id);
  await ready(page, [a, b]);
  await open(page, a, 'Pisteet');
  await top(page);
  const z = panel(page).getByRole('textbox', { name: 'Geometrian siirtymä Z', exact: true });
  await z.fill('10');
  await z.press('Enter');
  await expect(z).toHaveValue('0');
  expect((await save(page)).bodies.map((b) => b.feature.height)).toEqual([70, 70]);
});
test('held linked siblings require explicit uniqueness', async ({ page }) => {
  const a = asComponent(makeBody(100, 80, 60)),
    b = asComponent(makeBody(100, 80, 60, [200, 0, 0]), a.component!.id);
  await ready(page, [a, { ...b, locked: true }]);
  await open(page, a, 'Pisteet');
  await top(page);
  const z = panel(page).getByRole('textbox', { name: 'Geometrian siirtymä Z', exact: true });
  await z.fill('10');
  await expect(
    panel(page).getByRole('button', { name: 'Toteuta muutos', exact: true }),
  ).toBeDisabled();
  await panel(page)
    .getByRole('checkbox', { name: 'Muokkaa vain tätä osaa · tee uniikki', exact: true })
    .check();
  await z.press('Enter');
  await expect(z).toHaveValue('0');
  const result = await save(page);
  expect(result.bodies[0].component).toBeUndefined();
  expect(result.bodies[1]).toEqual({ ...b, locked: true });
});
test('curved CAD conversion stays explicit and keeps the original for undo', async ({ page }) => {
  const body = makeProfileBody({ kind: 'circle', radius: 30 }, sketchFrame([0, 0, 0]), 40);
  await ready(page, [body]);
  await open(page, body, 'Pisteet');
  await panel(page).getByRole('button', { name: 'Muokkaa verkkokopiota', exact: true }).click();
  await top(page);
  const z = panel(page).getByRole('textbox', { name: 'Geometrian siirtymä Z', exact: true });
  await z.fill('10');
  await z.press('Enter');
  await expect(z).toHaveValue('0');
  const result = await save(page);
  expect(result.bodies).toHaveLength(2);
  expect(result.bodies[0]).toEqual({ ...body, hidden: true });
  expect(result.bodies[1].feature.type).toBe('mesh');
  expect(result.bodies[1].feature.height).toBeCloseTo(50, 4);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual([body]);
});
test('reference picking accepts another part and moves only selected coordinates', async ({
  page,
}) => {
  const a = makeBody(100, 80, 60),
    b = makeBody(20, 20, 90, [200, 0, 0]);
  await ready(page, [a, b]);
  await view(page, [a, b]);
  await open(page, a, 'Pisteet');
  await top(page);
  await panel(page).getByRole('button', { name: 'X', exact: true }).click();
  await panel(page).getByRole('button', { name: 'Y', exact: true }).click();
  await panel(page).getByRole('button', { name: 'Poimi ankkuri', exact: true }).click();
  let p = await projected(page),
    corner = p(100, 0, 60);
  await page.mouse.click(corner.x, corner.y);
  await panel(page).getByRole('button', { name: 'Poimi viite', exact: true }).click();
  const other = p(200, 0, 90);
  await page.mouse.click(other.x, other.y);
  const z = panel(page).getByRole('textbox', { name: 'Geometrian siirtymä Z', exact: true });
  await expect(z).toHaveValue('30');
  await z.press('Enter');
  await expect(z).toHaveValue('0');
  const result = await save(page);
  expect(result.bodies[0].feature.height).toBe(90);
  expect(result.bodies[1]).toEqual(b);
});
test('tool switch commits a valid pending change before opening the normal CAD tool', async ({
  page,
}) => {
  const body = makeBody(100, 80, 60);
  await ready(page, [body]);
  await open(page, body, 'Pisteet');
  await top(page);
  await panel(page).getByRole('textbox', { name: 'Geometrian siirtymä Z', exact: true }).fill('10');
  await page.getByRole('button', { name: 'Push / pull', exact: true }).click();
  await expect(bar(page)).toBeVisible();
  await expect(panel(page)).toHaveCount(0);
  expect((await save(page)).bodies[0].feature.height).toBe(70);
  await expect(page.getByRole('button', { name: 'Push / pull', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});
test('a failed tool switch keeps its invalid draft and the original body', async ({ page }) => {
  const body = makeBody(100, 80, 60);
  await ready(page, [body]);
  await open(page, body, 'Pisteet');
  await top(page);
  await panel(page)
    .getByRole('textbox', { name: 'Geometrian siirtymä Z', exact: true })
    .fill('-60');
  await page.getByRole('button', { name: 'Push / pull', exact: true }).click();
  await expect(panel(page).getByRole('alert')).toBeVisible();
  expect((await save(page)).bodies).toEqual([body]);
  await expect(panel(page)).toBeVisible();
});
test('CAD Cut can select an external cutter while staying in the precision context', async ({
  page,
}) => {
  const body = makeBody(100, 80, 60),
    cutter = makeBody(20, 20, 80, [40, 30, -10], 'Leikkuri');
  await ready(page, [body, cutter]);
  await view(page, [body, cutter]);
  await open(page, body, 'Pisteet');
  await page.getByTestId('viewport').focus();
  await page.keyboard.press('b');
  await expect(page.getByRole('button', { name: 'Muotoile', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.keyboard.press('Tab');
  const p = await projected(page),
    c = p(50, 40, 70);
  await page.mouse.click(c.x, c.y);
  await expect(
    page.getByRole('checkbox', { name: 'Työstökappale: Leikkuri', exact: true }),
  ).toBeChecked();
  await page.getByRole('button', { name: 'Hyväksy Cut', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Kohteet 0', exact: true })).toBeVisible();
  expect((await save(page)).bodies.find((b) => b.id === body.id)?.feature.type).toBe('brep');
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual([body, cutter]);
  await expect(bar(page)).toBeVisible();
});
test('area selection and rotation around a picked corner share project undo', async ({ page }) => {
  const body = makeBody(100, 80, 60);
  await ready(page, [body]);
  await view(page, [body]);
  await open(page, body, 'Pisteet');
  await panel(page).getByText('Valinta ja tarkkuus', { exact: true }).click();
  await panel(page)
    .getByRole('checkbox', { name: 'Valitse myös takana olevat pisteet', exact: true })
    .check();
  const p = await projected(page),
    a = p(0, 80, 60),
    b = p(100, 0, 60);
  await page.mouse.move(a.x - 18, a.y - 18);
  await page.mouse.down();
  await page.mouse.move(b.x + 18, b.y + 18, { steps: 6 });
  await page.mouse.up();
  await expect(panel(page).getByRole('status')).toContainText('8 pistettä');
  await panel(page).getByRole('button', { name: 'Poimi ankkuri', exact: true }).click();
  const anchor = p(0, 0, 60);
  await page.mouse.click(anchor.x, anchor.y);
  await page.keyboard.press('r');
  await panel(page).getByRole('textbox', { name: 'Geometrian kierto Z', exact: true }).fill('90');
  await panel(page)
    .getByRole('textbox', { name: 'Geometrian kierto Z', exact: true })
    .press('Enter');
  await expect(
    panel(page).getByRole('textbox', { name: 'Geometrian kierto Z', exact: true }),
  ).toHaveValue('0');
  const result = await save(page);
  expect(bounds(result.bodies)).toEqual({ min: [-80, 0, 0], max: [0, 100, 60] });
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual([body]);
});
test('typing a dimension uses the chosen geometry axis without a separate form click', async ({
  page,
}) => {
  const body = makeBody(100, 80, 60);
  await ready(page, [body]);
  await open(page, body, 'Pisteet');
  await top(page);
  await page.getByTestId('viewport').focus();
  await page.keyboard.press('m');
  await page.keyboard.press('z');
  await page.keyboard.type('-12');
  await page.keyboard.press('Enter');
  await expect(
    panel(page).getByRole('textbox', { name: 'Geometrian siirtymä Z', exact: true }),
  ).toHaveValue('0');
  expect((await save(page)).bodies[0].feature.height).toBe(48);
});
test('axis handle previews without rebuilding CAD and commits on release', async ({ page }) => {
  const body = makeBody(100, 80, 60);
  await ready(page, [body]);
  await view(page, [body]);
  await open(page, body, 'Pisteet');
  await top(page);
  const p = await projected(page),
    c = p(50, 40, 60),
    canvas = page.locator('.viewport > canvas');
  const builds = await page.getByTestId('viewport').getAttribute('data-geometry-builds');
  await page.mouse.move(c.x + 45, c.y);
  await expect(canvas).toHaveAttribute('data-handle-axis', 'X');
  await page.mouse.down();
  await page.mouse.move(c.x + 80, c.y, { steps: 8 });
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-geometry-builds', builds!);
  await page.mouse.up();
  await expect(
    panel(page).getByRole('textbox', { name: 'Geometrian siirtymä X', exact: true }),
  ).toHaveValue('0');
  const result = (await save(page)).bodies[0];
  expect(result.feature.width).toBeGreaterThan(105);
  expect(result.feature.height).toBe(60);
  expect(result.origin).toEqual([0, 0, 0]);
});
test('typing reopens a hidden geometry inspector without a whole-part dimension popup', async ({
  page,
}) => {
  const body = makeBody(100, 80, 60);
  await ready(page, [body]);
  await open(page, body, 'Pisteet');
  await top(page);
  await page.getByTestId('viewport').focus();
  await page.keyboard.press('m');
  await page.keyboard.press('z');
  await page.getByRole('button', { name: 'Piilota ominaisuudet', exact: true }).click();
  await expect(panel(page)).toBeHidden();
  await page.getByTestId('viewport').focus();
  await page.keyboard.type('-12');
  await page.keyboard.press('Enter');
  await expect(panel(page)).toBeVisible();
  await expect(
    panel(page).getByRole('textbox', { name: 'Geometrian siirtymä Z', exact: true }),
  ).toHaveValue('0');
  expect((await save(page)).bodies[0].feature.height).toBe(48);
});
test('switching project views protects an unfinished geometry change', async ({ page }) => {
  const body = makeBody(100, 80, 60);
  await ready(page, [body]);
  await open(page, body, 'Pisteet');
  await top(page);
  const z = panel(page).getByRole('textbox', { name: 'Geometrian siirtymä Z', exact: true });
  await z.fill('10');
  await page.getByRole('button', { name: 'Projektikirjasto', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Projektikirjasto', exact: true })).toHaveCount(0);
  await expect(z).toHaveValue('10');
  await z.press('Enter');
  await expect(z).toHaveValue('0');
  await bar(page).getByRole('button', { name: 'Valmis', exact: true }).click();
  await page.getByRole('button', { name: 'Uusi projekti', exact: true }).click();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '0');
  await expect(bar(page)).toHaveCount(0);
  expect((await save(page)).bodies).toHaveLength(0);
});
