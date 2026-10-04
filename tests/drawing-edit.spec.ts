import { test, expect } from '@playwright/test';
import { ready, save } from './helpers';
import { makeBody } from '../src/model/project';

test('third tap places a dimension, dragging changes only its offset and Escape cancels a drag', async ({
  page,
}, info) => {
  const body = makeBody(600, 400, 800);
  await ready(page, [body]);
  await page.getByTestId(`body-${body.id}`).click();
  await page.getByRole('button', { name: 'Mittakuva', exact: true }).click();
  await expect(page.locator('.drawing-paper svg')).toBeVisible();
  await page.getByRole('button', { name: 'Lisää mitta', exact: true }).click();
  await page.getByLabel('Mitan suunta', { exact: true }).selectOption('horizontal');
  const points = await page
    .locator('.drawing-paper svg')
    .first()
    .evaluate((svg) => {
      const matrix = (svg.querySelector('g[transform]') as SVGGElement).getScreenCTM()!;
      return [
        [0, 0],
        [600, 0],
        [300, 160],
      ].map(([x, y]) => {
        const p = new DOMPoint(x, y).matrixTransform(matrix);
        return { x: p.x, y: p.y };
      });
    });
  for (const p of points) {
    if (info.project.name === 'tablet') await page.touchscreen.tap(p.x, p.y);
    else await page.mouse.click(p.x, p.y);
  }
  await expect(page.locator('.dimension-list:visible > div')).toHaveCount(1);
  await page.getByRole('button', { name: 'Lopeta mitoitus', exact: true }).click();
  const original = await save(page),
    d = original.dimensions[0];
  expect(d).toMatchObject({ kind: 'points', axis: 'x' });
  if (!('offset' in d)) throw new Error('Expected a point dimension');
  expect(d.offset[2]).toBeCloseTo(-160, 0);
  const label = page.locator(`.drawing-paper [data-dimension="${d.id}"] text`);
  const at = (await label.boundingBox())!,
    x = at.x + at.width / 2,
    y = at.y + at.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 35, { steps: 6 });
  await page.mouse.up();
  const moved = await save(page);
  expect(moved.bodies).toEqual(original.bodies);
  expect(moved.dimensions[0]).toMatchObject({ ...d, offset: expect.any(Array) });
  expect(moved.dimensions[0]).not.toEqual(d);
  await page.getByRole('banner').getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).dimensions).toEqual(original.dimensions);
  const again = (await label.boundingBox())!;
  await page.mouse.move(again.x + again.width / 2, again.y + again.height / 2);
  await page.mouse.down();
  await page.mouse.move(again.x, again.y + 30, { steps: 5 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.getByRole('region', { name: 'Mittakuvan työtila' })).toBeVisible();
  expect((await save(page)).dimensions).toEqual(original.dimensions);
  await page.screenshot({ path: info.outputPath('drawing-edit.png') });
});
