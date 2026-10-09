import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { bounds, freshProject, makeBody, type Body, type Project } from '../src/model/project';

async function ready(page: Page, bodies: Body[]) {
  await page.goto(process.env.NIVO_BASE_PATH ?? '/');
  await expect(page.getByRole('button', { name: 'Piirrä suorakulmio', exact: true })).toBeEnabled();
  await page.getByTestId('project-file').setInputFiles({
    name: 'interaction.nivo',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...freshProject(), bodies })),
  });
  await expect(page.locator('.object-list .object-select')).toHaveCount(bodies.length);
  await page.getByRole('button', { name: 'Näkymä: Ylhäältä', exact: true }).press('Enter');
  await page.getByRole('button', { name: 'Sovita näkymään', exact: true }).click();
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

test('one compact header, native fullscreen and narrow-screen actions', async ({ page }, info) => {
  await ready(page, [makeBody(400, 300, 40)]);
  const header = (await page.getByRole('banner').boundingBox())!;
  expect(header.height).toBe(60);
  expect((await page.getByTestId('viewport').boundingBox())!.y).toBe(60);
  await page.getByRole('button', { name: 'Käyttöohje', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(
    await page.evaluate(() => !!document.elementFromPoint(20, 20)?.closest('.guide-backdrop')),
  ).toBe(true);
  await page.getByRole('button', { name: 'Sulje ohje', exact: true }).click();
  for (const name of [
    'Malli',
    'Mittakuva',
    'Uusi projekti',
    'Avaa projektitiedosto',
    'Tallenna tiedosto',
    'Peru',
    'Palauta',
    'Käyttöohje',
  ])
    await expect(page.getByRole('banner').getByRole('button', { name, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Siirry koko näyttöön', exact: true }).click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await expect(
    page.getByRole('button', { name: 'Poistu koko näytöstä', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath('compact-fullscreen.png') });
  await page.getByRole('button', { name: 'Poistu koko näytöstä', exact: true }).click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
  // Also follow a browser-initiated exit (same fullscreenchange path as Escape).
  await page.getByRole('button', { name: 'Siirry koko näyttöön', exact: true }).click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await page.evaluate(() => document.exitFullscreen());
  await expect(
    page.getByRole('button', { name: 'Siirry koko näyttöön', exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Lisää toimintoja' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.getByRole('button', { name: 'Lisää toimintoja' }).click();
  await expect(page.getByRole('button', { name: 'Tallenna tiedosto', exact: true })).toBeVisible();
  await page.locator('.viewport-settings summary').click();
  const settings = (await page.locator('.viewport-settings-panel').boundingBox())!;
  expect(settings.x).toBeGreaterThanOrEqual(0);
  expect(settings.x + settings.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: info.outputPath('compact-mobile.png') });
});

test('hover O previews under the pointer, typed inset stays fixed and click commits once', async ({
  page,
}) => {
  const body = makeBody(400, 300, 40);
  const point = await ready(page, [body]);
  const a = point(100, 25),
    b = point(100, 65);
  await page.mouse.move(a.x, a.y);
  await page.keyboard.press('o');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-offset-preview', '18');
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await expect
    .poll(async () => Number(await page.getByTestId('offset-input').inputValue()))
    .toBeCloseTo(60, 8);
  await expect
    .poll(async () =>
      Number(await page.getByTestId('viewport').getAttribute('data-offset-preview')),
    )
    .toBeCloseTo(60, 8);
  await page.keyboard.type('22');
  await page.mouse.move(b.x + 20, b.y - 10);
  await expect(page.getByTestId('offset-input')).toHaveValue('22');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-offset-preview', '22');
  await page.mouse.click(b.x + 20, b.y - 10);
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  expect((await save(page)).bodies[0].feature.type).toBe('brep');
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies[0]).toEqual(body);
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-offset-preview', '');
});

test('tool-first Offset drags a selected body face and Escape discards the next preview', async ({
  page,
}) => {
  const body = makeBody(400, 300, 40);
  const point = await ready(page, [body]);
  await page.getByTestId(`body-${body.id}`).click();
  await page.getByRole('button', { name: 'Offset', exact: true }).click();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-offset-preview', '');
  const a = point(100, 25),
    b = point(100, 45);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await expect
    .poll(async () => Number(await page.getByTestId('offset-input').inputValue()))
    .toBeCloseTo(40, 8);
  await page.mouse.up();
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  const first = await save(page);
  await page.mouse.click(point(150, 140).x, point(150, 140).y);
  await page.getByTestId('offset-input').fill('300');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-offset-preview', '');
  await page.keyboard.press('Escape');
  expect((await save(page)).bodies[0]).toEqual(first.bodies[0]);
});

test('whole-object selection and late Ctrl copy keep the grabbed corner and original part', async ({
  page,
}) => {
  const source = makeBody(100, 80, 20, [3, 7, 0], 'Ovi');
  const target = makeBody(60, 60, 20, [303, 207, 0], 'Kohde');
  const point = await ready(page, [source, target]);
  const center = point(53, 47),
    a = point(103, 7),
    b = point(303, 207);
  await page.mouse.click(center.x, center.y);
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selection-kind', 'object');
  await expect(page.locator('.selection-tag')).toHaveText('CAD-kappale');
  await page.keyboard.press('m');
  await page
    .locator('summary')
    .filter({ hasText: /^Siirtotapa$/ })
    .click();
  await page.getByRole('checkbox', { name: 'Vapaa siirto (XYZ)', exact: true }).check();
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x + 20, a.y - 10);
  await page.keyboard.down('Control');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-copy-move', 'true');
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await expect(page.getByTestId('move-x')).toHaveValue('200');
  await expect(page.getByTestId('move-y')).toHaveValue('200');
  await page.mouse.up();
  await page.keyboard.up('Control');
  await expect(page.locator('.object-list .object-select')).toHaveCount(3);
  const model = await save(page);
  expect(model.bodies[0]).toMatchObject({ ...source, purpose: 'component' });
  expect(model.bodies[0].component?.id).toBeTruthy();
  expect(model.bodies[2].component?.id).toBe(model.bodies[0].component!.id);
  expect(model.bodies[1]).toEqual(target);
  expect(model.bodies[2].id).not.toBe(source.id);
  expect(model.bodies[2].feature).toEqual(source.feature);
  expect(model.bodies[2].origin).toEqual([203, 207, 0]);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual([source, target]);
});

test('copy can be cancelled and the copy checkbox supports an exact numeric placement', async ({
  page,
}) => {
  const source = makeBody(400, 300, 40);
  const point = await ready(page, [source]);
  const a = point(100, 100),
    b = point(160, 100);
  await page.getByTestId(`body-${source.id}`).click();
  await page.keyboard.press('m');
  await page.keyboard.down('Control');
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await page.keyboard.up('Control');
  expect((await save(page)).bodies).toEqual([source]);
  await page.getByRole('button', { name: 'Näytä mallilista', exact: true }).press('Enter');
  await page.getByTestId(`body-${source.id}`).click();
  await page.keyboard.press('m');
  await page.getByRole('checkbox', { name: 'Siirrä kopio', exact: true }).check();
  await page.getByTestId('move-x').fill('652');
  await page.getByTestId('move-x').press('Enter');
  await expect(page.locator('.object-list .object-select')).toHaveCount(2);
  const model = await save(page);
  expect(model.bodies[0]).toMatchObject({ ...source, purpose: 'component' });
  expect(model.bodies[0].component?.id).toBeTruthy();
  expect(model.bodies[1].component?.id).toBe(model.bodies[0].component!.id);
  expect(model.bodies[1].origin).toEqual([652, 0, 0]);
  expect(model.bodies[1].feature).toEqual(source.feature);
});
