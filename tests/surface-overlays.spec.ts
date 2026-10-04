import { expect, test } from '@playwright/test';
import { makeBody } from '../src/model/project';
import { ready, view, click, save } from './helpers';

test('a sketch on a vertical off-grid face is selected and extruded at its exact plane', async ({
  page,
}) => {
  const support = makeBody(600, 18.125, 400, [0, 7.125, 0]);
  await ready(page, [support]);
  const p = await view(page, [support], 'front');
  await page.keyboard.press('s');
  await click(page, p(100, 7.125, 100));
  await click(page, p(300, 7.125, 250));
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '2');
  let result = await save(page);
  const sketch = result.bodies[1];
  expect(sketch.origin[1]).toBeCloseTo(7.125, 8);
  expect(sketch.feature.depth).toBeCloseTo(0, 8);
  await page.keyboard.press('Escape');
  await click(page, p(170, 7.125, 160));
  await expect(page.getByTestId(`body-${sketch.id}`)).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('e');
  await page.keyboard.type('5');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  result = await save(page);
  expect(result.bodies[0]).toEqual(support);
  expect(result.bodies[1].feature.depth).toBeCloseTo(5, 6);
  expect(result.bodies[1].origin[1]).toBeCloseTo(2.125, 8);
});

test('Move grabs the flat shape at a corner shared with its supporting component', async ({
  page,
}) => {
  const support = makeBody(600, 400, 18.125);
  const sketch = makeBody(600, 400, 0, [0, 0, 18.125], 'Pintamuoto');
  await ready(page, [support, sketch]);
  const p = await view(page, [support, sketch]);
  await page.keyboard.press('m');
  const corner = p(600, 400, 18.125);
  await page.mouse.move(corner.x, corner.y);
  await expect(page.getByTestId('viewport')).toHaveAttribute(
    'data-move-hovered',
    JSON.stringify([sketch.id]),
  );
  await page.mouse.down();
  await page.keyboard.press('x');
  await page.mouse.move(p(700, 400, 18.125).x, p(700, 400, 18.125).y, { steps: 8 });
  await page.mouse.up();
  const result = await save(page);
  expect(result.bodies[0]).toEqual(support);
  expect(result.bodies[1].origin).toEqual([100, 0, 18.125]);
});

test('a rectangle drawn exactly on a component stays visible and selectable, then E extrudes only it', async ({
  page,
}, info) => {
  const support = makeBody(600, 400, 18.125, [0, 0, 0], 'Taustalevy');
  await ready(page, [support]);
  const p = await view(page, [support]);
  await page.keyboard.press('s');
  await click(page, p(100, 100, 18.125));
  await click(page, p(300, 250, 18.125));
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '2');
  let result = await save(page);
  expect(result.bodies[0]).toEqual(support);
  const sketch = result.bodies[1];
  expect(sketch.origin[2]).toBeCloseTo(18.125, 8);
  expect(sketch.feature.height).toBeCloseTo(0, 8);
  await page.keyboard.press('Escape');
  const inside = p(170, 160, 18.125);
  await click(page, inside);
  await expect(page.getByTestId(`body-${sketch.id}`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId(`body-${support.id}`)).toHaveAttribute('aria-pressed', 'false');
  await page.mouse.move(p(500, 300, 18.125).x, p(500, 300, 18.125).y);
  await page.screenshot({ path: info.outputPath('surface-sketch.png') });
  await click(page, p(500, 300, 18.125));
  await click(page, inside);
  await expect(page.getByTestId(`body-${sketch.id}`)).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await page.keyboard.press('m');
  await page.mouse.move(inside.x, inside.y);
  await expect(page.getByTestId('viewport')).toHaveAttribute(
    'data-move-hovered',
    JSON.stringify([sketch.id]),
  );
  await page.keyboard.press('v');
  await page.mouse.move(inside.x, inside.y);
  await page.keyboard.press('e');
  await page.keyboard.type('5');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  result = await save(page);
  expect(result.bodies[0]).toEqual(support);
  expect(result.bodies[1].feature.height).toBeCloseTo(5, 6);
  expect(result.bodies[1].origin[2]).toBeCloseTo(18.125, 8);
});

test('overlapping flat shapes keep creation priority after selection changes; foreground occludes them', async ({
  page,
}, info) => {
  const support = makeBody(600, 400, 18.125);
  const sketch = { ...makeBody(300, 250, 0, [100, 75, 18.125], 'Piirros'), color: '#e75040' };
  const newest = {
    ...makeBody(150, 150, 0, [180, 100, 18.125], 'Uusin piirros'),
    color: '#3185df',
  };
  const foreground = makeBody(50, 80, 10, [210, 130, 30]);
  const parts = [support, sketch, newest, foreground];
  await ready(page, parts);
  const p = await view(page, parts);
  for (const [part, point] of [
    [newest, p(280, 170, 18.125)],
    [sketch, p(130, 180, 18.125)],
    [support, p(500, 280, 18.125)],
    [newest, p(280, 170, 18.125)],
    [foreground, p(235, 170, 40)],
  ] as const) {
    await click(page, point);
    await expect(page.getByTestId(`body-${part.id}`)).toHaveAttribute('aria-pressed', 'true');
  }
  await page.keyboard.press('Escape');
  await page.mouse.move(p(550, 350, 18.125).x, p(550, 350, 18.125).y);
  await page.screenshot({ path: info.outputPath('coplanar-colors.png') });
  expect((await save(page)).bodies).toEqual(parts);
});
