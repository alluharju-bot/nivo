import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { ready, save } from './helpers';
import { makeBody } from '../src/model/project';

test('compact tool order and a single shape chooser work with pointer and keyboard', async ({
  page,
}, info) => {
  await ready(page, [makeBody(600, 400, 18)]);
  const buttons = page
    .getByRole('complementary', { name: 'Mallinnustyökalut' })
    .getByRole('button');
  expect(
    await buttons.evaluateAll((items) => items.map((e) => e.getAttribute('aria-label'))),
  ).toEqual([
    'Valitse',
    'Push / pull',
    'Kynä',
    'Muodot',
    'Kumita',
    'Siirrä',
    'Kierrä',
    'Offset',
    'Reunat',
    'Muotoile',
    'Mittatyökalu',
    'Navigoi',
  ]);
  if (info.project.name === 'desktop') {
    await page.setViewportSize({ width: 1366, height: 768 });
    expect(
      await page.locator('.tool-rail').evaluate((el) => el.scrollHeight <= el.clientHeight),
    ).toBe(true);
  }
  await page.getByRole('button', { name: 'Muodot', exact: true }).click();
  await page.getByRole('button', { name: 'Ympyrä', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ympyrä', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Muodot', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('group', { name: 'Valitse muoto' })).toBeHidden();
  await page.keyboard.press('s');
  await expect(page.getByRole('heading', { name: 'Suorakulmio', exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('compact-tools.png') });
});

test('drawing has its own controls, CAD picking, undo, SVG and vector PDF export', async ({
  page,
}, info) => {
  const body = makeBody(600, 400, 800, [0, 0, 0], 'Testikaappi');
  await ready(page, [body]);
  await page.getByTestId(`body-${body.id}`).click();
  await page.getByRole('button', { name: 'Mittakuva', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Mallinnustyökalut' })).toBeHidden();
  await expect(page.getByRole('complementary', { name: 'Ominaisuudet' })).toBeHidden();
  await expect(page.locator('.drawing-paper svg')).toBeVisible();
  await page.getByRole('button', { name: 'Lisää kokonaismitat', exact: true }).click();
  await expect(page.locator('.drawing-controls .dimension-list > div')).toHaveCount(2);
  await page.getByRole('button', { name: 'Lisää mitta', exact: true }).click();
  const points = await page
    .locator('.drawing-paper svg')
    .first()
    .evaluate((svg) => {
      const group = svg.querySelector('g[transform]') as SVGGElement;
      const matrix = group.getScreenCTM()!;
      return [
        [0, 0],
        [600, 0],
        [600, 130],
      ].map(([x, y]) => {
        const p = new DOMPoint(x, y).matrixTransform(matrix);
        return { x: p.x, y: p.y };
      });
    });
  await page.mouse.move(points[0].x, points[0].y);
  await expect(page.getByTestId('drawing-snap')).toHaveText('Kulmapiste');
  await page.mouse.click(points[0].x, points[0].y);
  await page.mouse.click(points[1].x, points[1].y);
  await page.mouse.move(points[2].x, points[2].y);
  await page.mouse.click(points[2].x, points[2].y);
  await expect(page.locator('.drawing-controls .dimension-list > div')).toHaveCount(3);
  await page.getByRole('button', { name: 'Lopeta mitoitus', exact: true }).click();
  const project = await save(page);
  expect(project.bodies).toEqual([body]);
  expect(project.dimensions.at(-1)).toMatchObject({ kind: 'points', axis: 'x' });
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  await expect(page.locator('.drawing-controls .dimension-list > div')).toHaveCount(2);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Vie PDF', exact: true }).click();
  const pdf = await readFile((await (await pending).path())!);
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  const svgPending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Vie SVG-mittakuva', exact: true }).click();
  const svg = await readFile((await (await svgPending).path())!, 'utf8');
  expect(svg).toContain('data-mm="600"');
  expect(svg).toContain('data-mm="800"');
  await page.screenshot({ path: info.outputPath('drawing-workspace.png') });
});

test('automatic part numbers, CSV and explosion leave the actual model unchanged', async ({
  page,
}, info) => {
  const bodies = [
    makeBody(18, 600, 800, [0, 0, 0], 'Vasen sivu'),
    makeBody(18, 600, 800, [582, 0, 0], 'Oikea sivu'),
    makeBody(564, 600, 18, [18, 0, 0], 'Pohja'),
  ];
  await ready(page, bodies);
  await page.getByRole('button', { name: 'Osat', exact: true }).click();
  await expect(page.locator('.parts-table tbody tr')).toHaveCount(3);
  await expect(page.getByTestId('render-canvas')).toHaveAttribute('data-body-count', '3');
  await page.getByRole('button', { name: 'Näytä osa: Pohja', exact: true }).click();
  await expect(page.locator('.parts-table tr[data-selected="true"]')).toContainText('Pohja');
  await page.getByRole('slider', { name: 'Räjäytyksen määrä' }).fill('1.4');
  await page.getByRole('button', { name: 'Sovita malli', exact: true }).click();
  await page.screenshot({ path: info.outputPath('parts-exploded.png') });
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Vie osaluettelo CSV' }).click();
  const csv = await readFile((await (await pending).path())!, 'utf8');
  expect(csv).toContain('Vasen sivu');
  expect(csv).toContain('"564";"600";"18"');
  expect((await save(page)).bodies).toEqual(bodies);
  await page.getByRole('button', { name: 'Koottu', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Räjäytyksen määrä' })).toHaveValue('0');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('viewport')).toBeVisible();
});

test('emission and spot controls persist, and progressive rendering accumulates samples', async ({
  page,
}, info) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await ready(page, [
    makeBody(100, 100, 20, [0, 0, 150], 'Valo'),
    makeBody(300, 300, 10, [-100, -100, 0], 'Lattia'),
  ]);
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  const target = page.getByRole('combobox', { name: 'Materiaalin kohde' });
  const id = await target
    .locator('option')
    .filter({ hasText: /^Valo$/ })
    .getAttribute('value');
  await target.selectOption(id!);
  await page.getByRole('combobox', { name: 'Materiaali', exact: true }).selectOption('led-warm');
  await page.getByRole('button', { name: 'Materiaali', exact: true }).click();
  await page.getByText('Osa valonlähteenä', { exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Valaiseva materiaali' })).toBeChecked();
  await page.getByRole('combobox', { name: 'Valon tyyppi' }).selectOption('spot');
  await page.getByRole('spinbutton', { name: 'Valon voimakkuus' }).fill('12');
  await page.getByRole('spinbutton', { name: 'Valon voimakkuus' }).press('Enter');
  expect((await save(page)).bodies[0].appearance?.emission).toMatchObject({
    enabled: true,
    type: 'spot',
    intensity: 12,
    direction: '-z',
  });
  await page.getByRole('button', { name: 'Kuva', exact: true }).click();
  await page.getByRole('button', { name: 'Tarkentuva', exact: true }).click();
  await expect
    .poll(
      async () =>
        Number(await page.getByTestId('render-canvas').getAttribute('data-trace-samples')),
      { timeout: 120000 },
    )
    .toBeGreaterThanOrEqual(1);
  await page.getByRole('button', { name: 'Tauota renderöinti', exact: true }).click();
  await expect(page.getByTestId('trace-status')).toContainText('Tauolla');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Tallenna tarkentuva kuva PNG' }).click();
  expect((await readFile((await (await pending).path())!)).subarray(0, 8).toString('hex')).toBe(
    '89504e470d0a1a0a',
  );
  await page.screenshot({ path: info.outputPath('progressive-render.png') });
  await page.getByRole('button', { name: 'Nopea', exact: true }).click();
  await page.getByRole('button', { name: 'Takaisin malliin', exact: true }).click();
  expect(errors).toEqual([]);
});

test('choosing a rectangle waits for an explicit first corner and draws only after it', async ({
  page,
}) => {
  const body = makeBody(100, 100, 100);
  await ready(page, [body]);
  const { view } = await import('./helpers');
  const point = await view(page, [body]);
  await page.getByRole('button', { name: 'Muodot', exact: true }).click();
  await page.getByRole('button', { name: 'Suorakulmio', exact: true }).click();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-shape-preview', 'false');
  await expect(page.getByTestId('dynamic-input')).toBeHidden();
  const start = point(20, 20, 100),
    end = point(80, 80, 100);
  await page.mouse.move(start.x, start.y);
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-shape-preview', 'false');
  await page.mouse.click(start.x, start.y);
  await page.mouse.move(end.x, end.y, { steps: 5 });
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-shape-preview', 'true');
  await page.mouse.click(end.x, end.y);
  const model = await save(page);
  expect(model.bodies).toHaveLength(2);
  expect(model.bodies[1].origin).toEqual([20, 20, 100]);
  // Preserve CAD coordinates without rounding them to display precision.
  expect(model.bodies[1].feature.width).toBeCloseTo(60, 10);
  expect(model.bodies[1].feature.depth).toBeCloseTo(60, 10);
  expect(model.bodies[1].feature.height).toBe(0);
});
