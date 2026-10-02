import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import {
  freshProject,
  makeBody,
  bounds,
  type Body,
  type Project,
  type Guide,
} from '../src/model/project';

async function ready(page: Page, bodies: Body[] = [], guides: Guide[] = []) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Piirrä suorakulmio', exact: true })).toBeEnabled();
  if (bodies.length || guides.length) {
    await page.getByTestId('project-file').setInputFiles({
      name: 'fixture.nivo',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ ...freshProject(), bodies, guides })),
    });
    await expect(page.locator('.object-list .object-select')).toHaveCount(bodies.length);
  }
}
async function top(page: Page, bodies: Body[] = []) {
  await page.getByRole('button', { name: 'Ylhäältä', exact: true }).click();
  const rect = (await page.getByTestId('viewport').boundingBox())!;
  const { min, max } = bounds(bodies),
    center = min.map((n, i) => (n + max[i]) / 2);
  const radius =
    Math.max(Math.hypot(...max.map((n, i) => n - min[i])) * 0.65, 100) /
    Math.min(rect.width / rect.height, 1);
  return (x: number, y: number) => ({
    x: rect.x + rect.width / 2 + ((x - center[0]) * rect.height) / (2 * radius),
    y: rect.y + rect.height / 2 - ((y - center[1]) * rect.height) / (2 * radius),
  });
}
async function save(page: Page): Promise<Project> {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Tallenna tiedosto', exact: true }).click();
  return JSON.parse(await readFile((await (await pending).path())!, 'utf8'));
}
async function clickPoint(page: Page, p: { x: number; y: number }) {
  await page.mouse.click(p.x, p.y);
}

test('type directly, Tab cycles dimensions, Enter and drag release commit exactly once', async ({
  page,
}) => {
  await ready(page);
  await page.getByRole('button', { name: 'Suorakulmio', exact: true }).click();
  await page.keyboard.type('635');
  await expect(page.getByTestId('width-input')).toHaveValue('635');
  await page.keyboard.press('Tab');
  await page.keyboard.type('417');
  await page.keyboard.press('Enter');
  await expect(page.locator('.object-list .object-select')).toHaveCount(1);
  let model = await save(page);
  expect(model.bodies[0].feature.width).toBe(635);
  expect(model.bodies[0].feature.depth).toBe(417);
  const point = await top(page, model.bodies);
  await page.getByRole('button', { name: 'Suorakulmio', exact: true }).click();
  const a = point(700, 400),
    b = point(800, 300);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.keyboard.type('130');
  await page.keyboard.press('Tab');
  await page.keyboard.type('90');
  await page.mouse.up();
  await expect(page.locator('.object-list .object-select')).toHaveCount(2);
  model = await save(page);
  expect(model.bodies[1].feature.width).toBe(130);
  expect(model.bodies[1].feature.depth).toBe(90);
  expect(model.bodies[1].origin).toEqual([700, 310, 0]);
});

test('hover center, hold Shift and draw aligned to the acquired reference', async ({
  page,
}, info) => {
  const body = makeBody(400, 300, 40);
  await ready(page, [body]);
  const point = await top(page, [body]);
  await page.getByRole('button', { name: 'Kynä', exact: true }).click();
  const center = point(200, 150);
  await page.mouse.move(center.x, center.y);
  await page.keyboard.down('Shift');
  await expect(page.getByTestId('reference-lock')).toContainText('Kappaleen keskipiste');
  const end = point(201, 350);
  await page.mouse.move(end.x, end.y);
  await expect(page.getByTestId('snap-hint')).toContainText('Viite');
  await clickPoint(page, end);
  await page.keyboard.up('Shift');
  await expect(page.getByTestId('reference-lock')).toHaveCount(0);
  await clickPoint(page, point(350, 350));
  await clickPoint(page, point(350, 280));
  await page.keyboard.press('Enter');
  await expect(page.locator('.object-list .object-select')).toHaveCount(2);
  const model = await save(page);
  expect(model.bodies[1].origin[0]).toBe(200);
  await page.screenshot({ path: info.outputPath('reference-pen.png') });
});

test('measurement default, second-click mode menu, R rotation, Shift free angle and exact guide entry', async ({
  page,
}, info) => {
  const body = makeBody(400, 300, 0);
  await ready(page, [body]);
  const point = await top(page, [body]);
  const tool = page.getByRole('button', { name: 'Mittatyökalu', exact: true });
  await tool.click();
  await expect(page.getByRole('menu')).toHaveCount(0);
  await clickPoint(page, point(0, 0));
  const end = point(260, 100);
  await page.mouse.move(end.x, end.y);
  await expect(page.getByTestId('guide-angle')).toHaveValue('0');
  await page.keyboard.down('Shift');
  await page.mouse.move(end.x + 1, end.y);
  expect(Number(await page.getByTestId('guide-angle').inputValue())).toBeGreaterThan(10);
  expect(Number(await page.getByTestId('guide-angle').inputValue())).toBeLessThan(30);
  await page.keyboard.up('Shift');
  await page.mouse.move(end.x + 2, end.y);
  await page.keyboard.press('r');
  await expect(page.getByTestId('guide-angle')).toHaveValue('45');
  await page.getByTestId('guide-length').fill('500');
  await page.getByTestId('guide-angle').fill('22,5');
  await page.keyboard.press('Enter');
  await expect(page.locator('.guide-list')).toContainText('500');
  let model = await save(page);
  expect(model.guides[0].angle).toBe(22.5);
  expect(model.guides[0].mode).toBe('guide');
  expect(model.guides[0].anchor).toMatchObject({ bodyId: body.id });
  // The tool remains active after acceptance; one click opens its mode menu.
  await tool.click();
  await page.getByRole('menuitemradio', { name: /Vapaa mittaviiva/ }).click();
  const a = point(430, 80),
    b = point(530, 220);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator('.guide-list>div')).toHaveCount(2);
  model = await save(page);
  expect(model.guides[1].mode).toBe('free');
  await expect(page.getByTestId('guide-label')).toHaveCount(2);
  await page.screenshot({ path: info.outputPath('guides.png') });
});

test('construction guide attracts both drawing and moving, follows its source and survives reload', async ({
  page,
}) => {
  const source = makeBody(200, 200, 0),
    mover = makeBody(80, 80, 20, [320, 0, 0]);
  const guide: Guide = {
    id: 'guide',
    mode: 'guide',
    anchor: { bodyId: source.id, key: 'corner:0', local: [0, 0, 0] },
    plane: 'XY',
    angle: 45,
    length: 400,
  };
  await ready(page, [source, mover], [guide]);
  const point = await top(page, [source, mover]);
  await page.getByRole('button', { name: 'Kynä', exact: true }).click();
  const near = point(273, 270);
  await page.mouse.move(near.x, near.y);
  await expect(page.getByTestId('snap-hint')).toHaveText('Apuviiva');
  await clickPoint(page, near);
  await clickPoint(page, point(350, 280));
  // Keep the final vertex below the view controls in the narrower tablet canvas.
  await clickPoint(page, point(350, 320));
  await page.keyboard.press('Enter');
  await expect(page.locator('.object-list .object-select')).toHaveCount(3);
  let model = await save(page);
  expect(model.bodies[2].origin[0]).toBeCloseTo(model.bodies[2].origin[1], 3);
  await page.locator('.object-list .object-select').nth(1).click();
  await page.getByRole('button', { name: 'Siirrä', exact: true }).click();
  const a = point(320, 0),
    b = point(240, 243);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await expect(page.getByTestId('snap-hint')).toContainText('Apuviiva');
  await page.mouse.up();
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  model = await save(page);
  expect(model.bodies[1].origin[0]).toBeCloseTo(model.bodies[1].origin[1], 2);
  await expect(page.locator('.save-status')).toContainText('Tallessa selaimessa');
  await page.reload();
  await expect(page.getByTestId('guide-label')).toHaveCount(1);
});

test('pen numeric offsets create exact vertices without another mouse move', async ({ page }) => {
  await ready(page);
  const point = await top(page);
  await page.getByRole('button', { name: 'Kynä', exact: true }).click();
  await clickPoint(page, point(0, 0));
  await page.getByTestId('move-x').fill('abc');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByTestId('move-x').fill('200');
  await page.keyboard.press('Tab');
  await page.keyboard.type('0');
  await page.keyboard.press('Enter');
  await page.getByTestId('move-x').fill('0');
  await page.getByTestId('move-y').fill('100');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Sulje muoto', exact: true }).click();
  await expect(page.locator('.object-list .object-select')).toHaveCount(1);
  const model = await save(page);
  expect(model.bodies[0].feature).toMatchObject({
    type: 'polygon-extrusion',
    points: [
      [0, 0],
      [200, 0],
      [200, 100],
    ],
  });
});

test('tablet picks a reference without a keyboard and two-finger navigation never commits a shape', async ({
  page,
  context,
}, info) => {
  test.skip(info.project.name !== 'tablet');
  const body = makeBody(400, 300, 40);
  await ready(page, [body]);
  const point = await top(page, [body]);
  await page.getByRole('button', { name: 'Kynä', exact: true }).tap();
  await page.getByRole('button', { name: 'Poimi viite', exact: true }).tap();
  const center = point(200, 150);
  await page.touchscreen.tap(center.x, center.y);
  await expect(page.getByTestId('reference-lock')).toContainText('Kappaleen keskipiste');
  await page.getByRole('button', { name: 'Peruuta', exact: true }).tap();
  await page.getByRole('button', { name: 'Suorakulmio', exact: true }).tap();
  const cdp = await context.newCDPSession(page),
    a = point(50, 50),
    b = point(150, 180);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ ...a, id: 1 }],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { ...a, id: 1 },
      { ...b, id: 2 },
    ],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [
      { x: a.x + 40, y: a.y + 20, id: 1 },
      { x: b.x + 80, y: b.y - 20, id: 2 },
    ],
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.getByRole('button', { name: 'Peruuta', exact: true }).tap();
  await expect(page.locator('.object-list .object-select')).toHaveCount(1);
  expect((await save(page)).bodies).toHaveLength(1);
});

test('pen closure creates one mesh, extrudes, merges selected parts, undo restores sources', async ({
  page,
}) => {
  await ready(page);
  const point = await top(page);
  await page.getByRole('button', { name: 'Kynä', exact: true }).click();
  for (const p of [
    [0, 0],
    [200, 0],
    [200, 100],
    [100, 100],
    [100, 200],
    [0, 200],
    [0, 0],
  ])
    await clickPoint(page, point(...(p as [number, number])));
  await expect(page.locator('.object-list .object-select')).toHaveCount(1);
  await page.getByRole('button', { name: 'Anna paksuus', exact: true }).click();
  await page.keyboard.type('20');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('selected-height')).toContainText('20');
  await page.getByRole('button', { name: 'Kopioi kappale', exact: true }).click();
  await page.getByTestId('move-x').fill('250');
  await page.getByTestId('move-x').press('Enter');
  await expect(page.locator('.object-list .object-select')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await page.locator('.object-list .object-select').last().click();
  await page.getByRole('button', { name: 'Monivalinta', exact: true }).click();
  await page.locator('.object-list .object-select').first().click();
  await page
    .locator('summary')
    .filter({ hasText: /^Mitat ja mallinnus$/ })
    .click();
  await page.getByRole('button', { name: 'Yhdistä valitut', exact: true }).click();
  await expect(page.locator('.object-list .object-select')).toHaveCount(1);
  let model = await save(page);
  expect(model.bodies[0].feature.type).toBe('union');
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  await expect(page.locator('.object-list .object-select')).toHaveCount(2);
  model = await save(page);
  expect(model.bodies.every((b) => b.feature.type === 'polygon-extrusion')).toBe(true);
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  await expect(page.locator('.object-list .object-select')).toHaveCount(1);
  await expect(page.locator('.save-status')).toContainText('Tallessa selaimessa');
  await page.reload();
  await expect(page.locator('.object-list .object-select')).toHaveCount(1);
});
