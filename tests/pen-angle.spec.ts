import { expect, test, type Page } from '@playwright/test';
import { ready, view, click } from './helpers';
import { makeBody } from '../src/model/project';

test('Shift in R mode projects an off-plane reference onto the chosen direction', async ({
  page,
}) => {
  const body = makeBody(100, 80, 70, [120, 180, 0]);
  await ready(page, [body]);
  const p = await view(page, [body]);
  await page.keyboard.press('k');
  await click(page, p(80, 160, 0));
  await page.mouse.move(p(100, 180, 0).x, p(100, 180, 0).y);
  await page.keyboard.press('r');
  await page.getByTestId('pen-angle').fill('45');
  await page.keyboard.press('Enter');
  await page.keyboard.down('Shift');
  await page.mouse.move(p(120, 180, 70).x, p(120, 180, 70).y);
  await preview(page, [110, 190, 0]);
  await expect(page.getByTestId('snap-hint')).toContainText('Pituus poimittu');
  await page.keyboard.up('Shift');
});

const data = async (page: Page, name: string) =>
  JSON.parse((await page.getByTestId('viewport').getAttribute(`data-pen-${name}`))!);
const preview = async (page: Page, expected: number[]) => {
  await expect
    .poll(async () => {
      const p = await data(page, 'hover');
      return p ? Math.hypot(...p.map((n: number, i: number) => n - expected[i])) : Infinity;
    })
    .toBeLessThan(0.0001);
};
test('R snaps angles around the last point; exact angle and signed length remain independent', async ({
  page,
}) => {
  await ready(page);
  const p = await view(page, []);
  await page.keyboard.press('k');
  await click(page, p(0, 0));
  await page.mouse.move(p(180, 60).x, p(180, 60).y);
  await page.keyboard.press('r');
  await page.mouse.move(p(190, 70).x, p(190, 70).y);
  await expect(page.getByTestId('pen-angle')).toHaveValue('22.5');
  await expect.poll(() => data(page, 'points')).toEqual([[0, 0, 0]]);
  await page.keyboard.type('137');
  await expect(page.getByTestId('pen-angle')).toHaveValue('137');
  await page.keyboard.press('Enter');
  await expect.poll(() => data(page, 'points')).toEqual([[0, 0, 0]]);
  await page.keyboard.type('92');
  const end = [92 * Math.cos((137 * Math.PI) / 180), 92 * Math.sin((137 * Math.PI) / 180), 0];
  await preview(page, end);
  await page.keyboard.press('Enter');
  await expect.poll(() => data(page, 'points')).toHaveLength(2);
  await expect(page.getByTestId('pen-angle')).toHaveCount(0);
  // The next segment starts from the new vertex, not the world origin.
  await page.mouse.move(p(end[0] + 100, end[1] + 100).x, p(end[0] + 100, end[1] + 100).y);
  await page.keyboard.press('r');
  await page.getByTestId('pen-angle').fill('-30');
  await page.keyboard.press('Enter');
  await page.keyboard.type('15');
  await preview(page, [end[0] + 15 * Math.cos(Math.PI / 6), end[1] - 7.5, 0]);
  await page.getByTestId('pen-length').fill('-15');
  await preview(page, [end[0] - 15 * Math.cos(Math.PI / 6), end[1] + 7.5, 0]);
});

test('mouse confirms only the direction, then length; axis and Escape release R without losing the path', async ({
  page,
}) => {
  await ready(page);
  const p = await view(page, []);
  await page.keyboard.press('k');
  await click(page, p(0, 0));
  await page.mouse.move(p(100, 100).x, p(100, 100).y);
  await page.keyboard.press('r');
  await click(page, p(100, 100));
  await expect.poll(() => data(page, 'points')).toHaveLength(1);
  await page.mouse.move(p(180, 180).x, p(180, 180).y);
  await click(page, p(180, 180));
  await expect.poll(() => data(page, 'points')).toHaveLength(2);
  await page.keyboard.press('r');
  await page.keyboard.press('x');
  await expect(page.getByTestId('pen-angle')).toHaveCount(0);
  await page.keyboard.press('r');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('pen-angle')).toHaveCount(0);
  await expect.poll(() => data(page, 'points')).toHaveLength(2);
});
