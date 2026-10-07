import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { freshProject, makeBody, bounds, type Body, type Project } from '../src/model/project';

async function ready(page: Page, body: Body, front = false) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Piirrä suorakulmio', exact: true })).toBeEnabled();
  await page.getByTestId('project-file').setInputFiles({
    name: 'offset.nivo',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...freshProject(), bodies: [body] })),
  });
  await expect(page.getByTestId(`body-${body.id}`)).toBeVisible();
  await page
    .getByRole('button', { name: front ? 'Näkymä: Edestä' : 'Näkymä: Ylhäältä', exact: true })
    .press('Enter');
  await page.getByRole('button', { name: 'Sovita näkymään', exact: true }).click();
  const rect = (await page.getByTestId('viewport').boundingBox())!;
  const { min, max } = bounds([body]),
    center = min.map((n, i) => (n + max[i]) / 2);
  const radius =
    Math.max(Math.hypot(...max.map((n, i) => n - min[i])) * 0.65, 100) /
    Math.min(rect.width / rect.height, 1);
  return (x: number, y: number) => ({
    x: rect.x + rect.width / 2 + ((x - center[0]) * rect.height) / (2 * radius),
    y: rect.y + rect.height / 2 - ((y - center[front ? 2 : 1]) * rect.height) / (2 * radius),
  });
}
async function save(page: Page): Promise<Project> {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Tallenna tiedosto', exact: true }).click();
  return JSON.parse(await readFile((await (await pending).path())!, 'utf8'));
}

test('hover selects a free face for E without a selection click, held faces stay inactive', async ({
  page,
}) => {
  const body = makeBody(400, 300, 40);
  const point = await ready(page, body);
  const p = point(200, 150);
  await page.mouse.move(p.x, p.y);
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-hover-face', 'z:max');
  await page.keyboard.press('e');
  await expect(page.getByTestId('remaining-input')).toHaveValue('40');
  await page.getByTestId('height-input').fill('10');
  await page.getByTestId('height-input').press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  expect((await save(page)).bodies[0].feature.height).toBe(50);
  await page.keyboard.press('Escape');
  await page.getByTestId(`body-${body.id}`).click();
  await page.keyboard.press('g');
  await expect(
    page.getByRole('button', { name: 'Kiinnitä paikalleen', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.mouse.move(p.x, p.y);
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-hover-face', '');
  await page.keyboard.press('e');
  await page.mouse.click(p.x, p.y);
  await expect(page.getByTestId('height-input')).toHaveCount(0);
  await page.keyboard.press('o');
  await page.mouse.click(p.x, p.y);
  await expect(page.getByTestId('offset-input')).toHaveCount(0);
  expect((await save(page)).bodies[0].feature.height).toBe(50);
});

test('600 by 600 by 2400 cabinet: hover O 18, E leaves an 18 mm back, then opens through', async ({
  page,
}, info) => {
  const body = makeBody(600, 600, 2400);
  const point = await ready(page, body, true);
  const p = point(300, 1200);
  await page.mouse.move(p.x, p.y);
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-hover-face', 'y:min');
  await page.keyboard.press('o');
  await page.keyboard.type('18');
  await expect(page.getByTestId('offset-input')).toHaveValue('18');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Offset', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.keyboard.press('e');
  await expect(page.getByTestId('remaining-input')).toHaveValue('600');
  await page.getByTestId('remaining-input').fill('18');
  await page.getByTestId('remaining-input').press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  const pocket = await save(page);
  expect(pocket.bodies).toHaveLength(1);
  expect(pocket.bodies[0].feature).toMatchObject({
    type: 'brep',
    width: 600,
    depth: 600,
    height: 2400,
  });
  await page.getByRole('button', { name: 'Yleisnäkymä', exact: true }).click();
  await page.screenshot({ path: info.outputPath('18mm-cabinet.png') });
  await page.getByRole('button', { name: 'Näkymä: Edestä', exact: true }).press('Enter');
  await page.mouse.click(p.x, p.y);
  await expect(page.getByTestId('remaining-input')).toHaveValue('18');
  await page.getByRole('button', { name: 'Leikkaa läpi', exact: true }).click();
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  const through = await save(page);
  expect(through.bodies[0].feature).not.toEqual(pocket.bodies[0].feature);
  await page.getByRole('button', { name: 'Yleisnäkymä', exact: true }).click();
  await page.screenshot({ path: info.outputPath('cabinet-through.png') });
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  await expect(page.getByRole('contentinfo').getByRole('status')).toHaveText('Muokkaus peruttu.');
  expect((await save(page)).bodies[0]).toEqual(pocket.bodies[0]);
  await page.reload();
  expect((await save(page)).bodies[0]).toEqual(pocket.bodies[0]);
});

test('Offset tool first, invalid inset keeps the body, zero remaining cuts through the selected region', async ({
  page,
}) => {
  const body = makeBody(200, 200, 20);
  const point = await ready(page, body);
  await page.getByRole('button', { name: 'Offset', exact: true }).click();
  const p = point(100, 100);
  await page.mouse.click(p.x, p.y);
  await page.getByTestId('offset-input').fill('120');
  await page.getByTestId('offset-input').press('Enter');
  await expect(page.getByRole('alert')).toContainText('Sisenn');
  expect((await save(page)).bodies[0]).toEqual(body);
  await page.getByTestId('offset-input').fill('18');
  await page.getByTestId('offset-input').press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  // The active tool keeps its last inset and can immediately split another region.
  await page.mouse.click(p.x, p.y);
  await expect(page.getByTestId('offset-input')).toHaveValue('18');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  await page.keyboard.press('e');
  await expect(page.getByTestId('remaining-input')).toHaveValue('20');
  await page.getByTestId('remaining-input').fill('0');
  await page.getByTestId('remaining-input').press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  expect((await save(page)).bodies[0].feature).toMatchObject({ type: 'brep', height: 20 });
});
