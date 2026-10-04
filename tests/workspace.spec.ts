import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { bounds, freshProject, makeBody, type Body, type Project } from '../src/model/project';
import { rotationRadius } from '../src/model/transforms';

async function ready(page: Page, bodies: Body[]) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Piirrä suorakulmio', exact: true })).toBeEnabled();
  await page.getByTestId('project-file').setInputFiles({
    name: 'workspace.nivo',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...freshProject(), bodies })),
  });
  await expect(page.locator('.object-list .object-select')).toHaveCount(bodies.length);
}
async function top(page: Page, bodies: Body[]) {
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

test('subtle axes default, optional labels, and distant grid without shader errors', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await ready(page, [makeBody(400, 300, 80)]);
  await page.getByRole('button', { name: 'Näytä origo', exact: true }).click();
  await expect(page.getByTestId('world-origin')).toBeHidden();
  await page.screenshot({ path: info.outputPath('subtle-workspace.png') });
  await page.locator('.viewport-settings summary').click();
  await expect(page.getByRole('combobox', { name: 'Akselien tyyli', exact: true })).toHaveValue(
    'subtle',
  );
  await page.getByRole('combobox', { name: 'Akselien tyyli', exact: true }).selectOption('strong');
  await page
    .getByRole('checkbox', { name: 'Näytä akselien nimet ja origon teksti', exact: true })
    .check();
  await expect(page.getByTestId('world-origin')).toBeVisible();
  await page.locator('.viewport-settings summary').click();
  await page.screenshot({ path: info.outputPath('strong-workspace.png') });
  const canvas = (await page.getByTestId('viewport').boundingBox())!;
  const spacing = Number(await page.locator('.viewport').getAttribute('data-grid-spacing'));
  await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
  if (info.project.name === 'tablet') {
    const cdp = await page.context().newCDPSession(page);
    const x = canvas.x + canvas.width / 2,
      y = canvas.y + canvas.height / 2;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { x: x - 120, y, id: 1 },
        { x: x + 120, y, id: 2 },
      ],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: x - 20, y, id: 1 },
        { x: x + 20, y, id: 2 },
      ],
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  } else await page.mouse.wheel(0, 3000);
  await expect
    .poll(async () => Number(await page.locator('.viewport').getAttribute('data-grid-spacing')))
    .toBeGreaterThan(spacing);
  await page.screenshot({ path: info.outputPath('distant-grid.png') });
  await page.reload();
  expect((await save(page)).settings).toMatchObject({ axisStyle: 'strong', axisLabels: true });
  expect(errors).toEqual([]);
});

test('origin, hold, hide, names and groups survive undo and reload', async ({ page }) => {
  const body = makeBody(100, 60, 20, [800, 300, 100], 'Ovi');
  await ready(page, [body]);
  await page.getByTestId(`body-${body.id}`).click();
  await page
    .locator('summary')
    .filter({ hasText: /^Sijainti$/ })
    .click();
  await page.getByRole('button', { name: 'Siirrä origoon', exact: true }).click();
  await expect(page.locator('.origin-readout')).toContainText('X 0');
  expect((await save(page)).bodies[0].origin).toEqual([0, 0, 0]);
  await page.keyboard.press('g');
  await expect(
    page.getByRole('button', { name: 'Kiinnitä paikalleen', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Siirrä origoon', exact: true })).toBeDisabled();
  await page.keyboard.press('m');
  await page.getByTestId('move-x').fill('100');
  await page.getByTestId('move-x').press('Enter');
  await expect(page.getByRole('alert')).toContainText('kiinnitetty');
  expect((await save(page)).bodies[0].origin).toEqual([0, 0, 0]);
  await page.keyboard.press('Escape');
  await page.keyboard.press('v');
  await page.getByRole('button', { name: 'Pidä mallilista näkyvissä', exact: true }).focus();
  await page.getByRole('button', { name: 'Pidä mallilista näkyvissä', exact: true }).click();
  await page.getByTestId(`body-${body.id}`).click();
  await page.keyboard.press('g');
  await expect(
    page.getByRole('button', { name: 'Kiinnitä paikalleen', exact: true }),
  ).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Nimeä: Ovi', exact: true }).click();
  await page.getByRole('textbox', { name: 'Kappaleen nimi', exact: true }).fill('Etuovi');
  await page.getByRole('textbox', { name: 'Kappaleen nimi', exact: true }).press('Enter');
  await expect(page.getByTestId(`body-${body.id}`)).toHaveText('Etuovi');
  await page.getByRole('button', { name: 'Uusi ryhmä', exact: true }).click();
  await page.getByRole('button', { name: 'Valitse ryhmä: Ryhmä 1', exact: true }).dblclick();
  await page.getByRole('textbox', { name: 'Ryhmän nimi: Ryhmä 1', exact: true }).fill('Keittiö');
  await page.getByRole('textbox', { name: 'Ryhmän nimi: Ryhmä 1', exact: true }).press('Enter');
  await expect(page.getByRole('region', { name: 'Ryhmän toiminnot' })).toBeVisible();
  await page.getByRole('button', { name: 'Piilota ryhmä: Keittiö', exact: true }).click();
  let model = await save(page);
  expect(model.groups[0]).toMatchObject({ name: 'Keittiö', hidden: true });
  expect(model.bodies[0]).toMatchObject({ name: 'Etuovi', groupId: model.groups[0].id });
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Piilota ryhmä: Keittiö', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Piilota: Etuovi', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Näytä: Etuovi', exact: true })).toBeVisible();
  await expect(page.locator('.save-status')).toContainText('Tallessa selaimessa');
  await page.reload();
  await expect(page.locator('.busy-badge')).toHaveCount(0);
  model = await save(page);
  expect(model.bodies[0].hidden).toBe(true);
  expect(model.groups[0].name).toBe('Keittiö');
  await page.getByRole('button', { name: 'Valitse ryhmä: Keittiö', exact: true }).click();
  await page
    .locator('summary')
    .filter({ hasText: /^Ryhmän asetukset$/ })
    .click();
  await page.getByRole('button', { name: 'Poista ryhmä', exact: true }).click();
  model = await save(page);
  expect(model.groups).toHaveLength(0);
  expect(model.bodies).toHaveLength(1);
  expect(model.bodies[0].groupId).toBeUndefined();
});

test('R rotates about a picked edge with an exact angle and undo', async ({ page }, info) => {
  const body = makeBody(100, 60, 20, [80, 100, 0], 'Saranoitu');
  await ready(page, [body]);
  const point = await top(page, [body]);
  await page.getByTestId(`body-${body.id}`).click();
  await page.keyboard.press('r');
  await expect(page.getByRole('button', { name: 'Kierrä', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Poimi kiertoakseli reunasta', exact: true }).click();
  const edge = point(120, 100);
  await page.mouse.click(edge.x, edge.y);
  await page.getByTestId('rotation-angle').fill('90');
  await page.screenshot({ path: info.outputPath('edge-rotation.png') });
  await page.getByTestId('rotation-angle').press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  let model = await save(page);
  expect(model.bodies[0].origin[1]).toBeCloseTo(100, 4);
  expect(model.bodies[0].origin[2]).toBeCloseTo(20, 4);
  expect(model.bodies[0].feature.depth).toBeCloseTo(20, 4);
  expect(model.bodies[0].feature.height).toBeCloseTo(60, 4);
  await expect(page.getByRole('button', { name: 'Kierrä', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  model = await save(page);
  expect(model.bodies[0].origin).toEqual(body.origin);
  expect(model.bodies[0].feature).toEqual(body.feature);
});

test('rotation ring uses five-degree snapping and Shift allows a free angle', async ({ page }) => {
  const body = makeBody(120, 60, 20);
  await ready(page, [body]);
  const point = await top(page, [body]);
  await page.getByTestId(`body-${body.id}`).click();
  await page.keyboard.press('r');
  const radius = rotationRadius([body]);
  const a = point(60 + radius * Math.cos(Math.PI / 6), 30 + radius * Math.sin(Math.PI / 6));
  const b = point(
    60 + radius * Math.cos((113 * Math.PI) / 180),
    30 + radius * Math.sin((113 * Math.PI) / 180),
  );
  await page.mouse.move(a.x, a.y);
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-rotation-handle', 'Z');
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 10 });
  await expect(page.getByTestId('rotation-angle')).toHaveValue('85');
  await page.keyboard.down('Shift');
  await page.mouse.move(b.x + 1, b.y, { steps: 2 });
  const free = Number(await page.getByTestId('rotation-angle').inputValue());
  expect(free).toBeGreaterThan(80);
  expect(free).toBeLessThan(85);
  await page.keyboard.up('Shift');
  const c = point(
    60 + radius * Math.cos((117 * Math.PI) / 180),
    30 + radius * Math.sin((117 * Math.PI) / 180),
  );
  await page.mouse.move(c.x, c.y, { steps: 3 });
  await expect(page.getByTestId('rotation-angle')).toHaveValue('90');
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  const model = await save(page);
  expect(model.bodies[0].feature.width).toBeCloseTo(60, 4);
  expect(model.bodies[0].feature.depth).toBeCloseTo(120, 4);
  expect(model.bodies[0].origin[0]).toBeCloseTo(30, 4);
  expect(model.bodies[0].origin[1]).toBeCloseTo(-30, 4);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies[0].feature).toEqual(body.feature);
});
