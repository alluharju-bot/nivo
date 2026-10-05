import { test, expect, type Page } from '@playwright/test';
import { makeBody, type Body, type Guide, type Vec3 } from '../src/model/project';
import { guidePoints } from '../src/model/guides';
import { ready, view, click, save } from './helpers';

async function freeMeasure(page: Page) {
  await page.getByRole('button', { name: 'Valitse mittatyökalu', exact: true }).click();
  await page.getByRole('menuitemradio', { name: /^Vapaa mittaviiva/ }).click();
}
const line = (id: string, a: Vec3, b: Vec3): Guide => ({
  id,
  mode: 'free',
  anchor: { point: a },
  endAnchor: { point: b },
  length: Math.hypot(...b.map((n, i) => n - a[i])),
  plane: 'XY',
  angle: 0,
});
const points = (guide: Guide, bodies: Body[] = []) =>
  guidePoints(bodies, guide)!.map((p) => p.map((n) => Number(n.toFixed(3))));

test('backtracking from center through a corner produces one full diagonal, with no duplicate undo steps', async ({
  page,
}) => {
  const bodies = [makeBody(600, 600, 0)];
  await ready(page, bodies);
  const p = await view(page, bodies);
  await freeMeasure(page);
  await click(page, p(300, 300));
  await click(page, p(600, 600));
  await expect(page.locator('.guide-list>div')).toHaveCount(1);
  const first = (await save(page)).guides[0];
  await click(page, p(0, 0));
  await expect(page.getByTestId('guide-label').first()).toContainText('848');
  await page.keyboard.press('Enter');
  let result = await save(page);
  expect(result.guides).toHaveLength(1);
  expect(result.guides[0].id).toBe(first.id);
  expect(points(result.guides[0], result.bodies)).toEqual([
    [0, 0, 0],
    [600, 600, 0],
  ]);
  expect(result.bodies).toEqual(bodies);
  // Reverse duplicate and then a contained stroke: neither may add history or a second line.
  await click(page, p(600, 600));
  await click(page, p(0, 0));
  await page.keyboard.press('Enter');
  await click(page, p(300, 300));
  await click(page, p(600, 600));
  await page.keyboard.press('Enter');
  expect((await save(page)).guides).toEqual(result.guides);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).guides).toEqual([first]);
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Tallenna tiedosto', exact: true })).toBeEnabled();
  result = await save(page);
  await expect(page.locator('.save-status')).toContainText('Tallessa');
  await page.reload();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
  expect((await save(page)).guides).toEqual(result.guides);
});

test('one stroke joins several overlaps but the next stroke starts at the clicked interior endpoint', async ({
  page,
}) => {
  const bodies = [makeBody(600, 600, 0)];
  const guides = [line('a', [0, 150, 0], [200, 150, 0]), line('b', [400, 150, 0], [600, 150, 0])];
  await ready(page, bodies, guides);
  const p = await view(page, bodies);
  await freeMeasure(page);
  await click(page, p(100, 150));
  await click(page, p(500, 150));
  await expect(page.locator('.guide-list>div')).toHaveCount(1);
  await click(page, p(500, 300));
  await expect(page.locator('.guide-list>div')).toHaveCount(2);
  await page.keyboard.press('Enter');
  const result = await save(page);
  expect(points(result.guides[0], result.bodies)).toEqual([
    [0, 150, 0],
    [600, 150, 0],
  ]);
  expect(points(result.guides[1], result.bodies)).toEqual([
    [500, 150, 0],
    [500, 300, 0],
  ]);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  await expect(page.locator('.guide-list>div')).toHaveCount(1);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).guides).toEqual(guides);
});

test('moving an endpoint onto an overlapping line merges once and undo restores both independent lines', async ({
  page,
}) => {
  const bodies = [makeBody(600, 600, 0)];
  const guides = [line('a', [0, 150, 0], [200, 150, 0]), line('b', [400, 150, 0], [600, 150, 0])];
  await ready(page, bodies, guides);
  const p = await view(page, bodies);
  await page.mouse.dblclick(p(400, 150).x, p(400, 150).y);
  await click(page, p(100, 150));
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  const result = await save(page);
  expect(result.guides).toHaveLength(1);
  expect(result.guides[0].id).toBe('b');
  expect(points(result.guides[0], result.bodies)).toEqual([
    [0, 150, 0],
    [600, 150, 0],
  ]);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).guides).toEqual(guides);
});
