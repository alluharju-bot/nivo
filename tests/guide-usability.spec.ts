import { test, expect } from '@playwright/test';
import { makeBody, type Guide } from '../src/model/project';
import { ready, view, click, save } from './helpers';

const wall = () => makeBody(400, 30, 600, [0, 0, 0], 'Seinä');
const guides: Guide[] = [
  {
    id: 'vertical',
    mode: 'guide',
    anchor: { point: [100, 0, 0] },
    direction: [0, 0, 1],
    length: 600,
    plane: 'XZ',
    angle: 90,
  },
  {
    id: 'horizontal',
    mode: 'guide',
    anchor: { point: [0, 0, 200] },
    direction: [1, 0, 0],
    length: 400,
    plane: 'XZ',
    angle: 0,
  },
];

test('wall guides show distance from their source and can start on another guide', async ({
  page,
}, info) => {
  const body = wall();
  await ready(page, [body]);
  const p = await view(page, [body], 'front');
  await page.keyboard.press('t');
  await click(page, p(0, 0, 170));
  await page.mouse.move(p(80, 0, 170).x, p(80, 0, 170).y);
  await expect(page.getByTestId('guide-length')).toHaveValue('80');
  await expect(page.getByTestId('guide-label')).toHaveText('80 mm');
  await click(page, p(80, 0, 170));
  let result = await save(page);
  expect(result.guides).toHaveLength(1);
  expect(result.guides[0].offset![0]).toBeCloseTo(80, 1);
  await expect(page.locator('.guide-list')).toContainText('80 mm');
  await page.mouse.move(p(80, 0, 300).x, p(80, 0, 300).y);
  await expect(page.getByTestId('snap-hint')).toHaveText('Apuviiva');
  await click(page, p(80, 0, 300));
  await page.mouse.move(p(150, 0, 300).x, p(150, 0, 300).y);
  await expect(page.getByTestId('guide-length')).toHaveValue('70');
  await click(page, p(150, 0, 300));
  result = await save(page);
  expect(result.guides).toHaveLength(2);
  expect(result.guides[1].offset![0]).toBeCloseTo(70, 1);
  await expect(page.getByTestId('guide-label').filter({ hasText: '70 mm' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('guide-distances.png') });
});

test('guide tool acquires exact crossings both as an origin and as an offset target', async ({
  page,
}) => {
  const body = wall();
  await ready(page, [body], guides);
  const p = await view(page, [body], 'front');
  await page.keyboard.press('t');
  const crossing = p(100, 0, 200);
  await page.mouse.move(crossing.x + 3, crossing.y + 2);
  await expect(page.getByTestId('snap-hint')).toHaveText('Apuviivojen risteys');
  await click(page, { x: crossing.x + 3, y: crossing.y + 2 });
  await click(page, p(180, 0, 280));
  let result = await save(page);
  expect(result.guides).toHaveLength(3);
  expect(result.guides[2].anchor).toEqual({ point: [100, 0, 200] });
  await click(page, p(0, 0, 120));
  await page.mouse.move(crossing.x + 3, crossing.y + 2);
  await expect(page.getByTestId('snap-hint')).toHaveText('Apuviivojen risteys');
  await expect(page.getByTestId('guide-length')).toHaveValue('100');
  await click(page, { x: crossing.x + 3, y: crossing.y + 2 });
  result = await save(page);
  expect(result.guides.at(-1)!.offset![0]).toBeCloseTo(100, 1);
});

test('guide selection never moves it; eraser removes only the highlighted guide with undo and reload', async ({
  page,
}, info) => {
  const body = wall();
  await ready(page, [body], guides);
  const p = await view(page, [body], 'front');
  await page.keyboard.press('v');
  await click(page, p(100, 0, 350));
  const actions = page.getByRole('toolbar', { name: 'Viivan toiminnot' });
  await expect(actions).toBeVisible();
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  await page.mouse.move(p(180, 0, 420).x, p(180, 0, 420).y);
  await click(page, p(180, 0, 420));
  expect((await save(page)).guides).toEqual(guides);
  await click(page, p(100, 0, 350));
  await actions.getByRole('button', { name: 'Muokkaa', exact: true }).click();
  await expect(page.getByTestId('dynamic-input')).toBeVisible();
  await page.keyboard.press('Escape');
  expect((await save(page)).guides).toEqual(guides);
  await page.keyboard.press('u');
  await page.mouse.move(p(100, 0, 350).x, p(100, 0, 350).y);
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-erase-guide', 'vertical');
  await page.screenshot({ path: info.outputPath('guide-eraser.png') });
  await click(page, p(100, 0, 350));
  let result = await save(page);
  expect(result.guides).toEqual([guides[1]]);
  expect(result.bodies).toEqual([body]);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).guides).toEqual(guides);
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  await expect(page.locator('.save-status')).toContainText('Tallessa selaimessa');
  await page.reload();
  await expect(page.locator('.busy-badge')).toHaveCount(0);
  result = await save(page);
  expect(result.guides).toEqual([guides[1]]);
  expect(result.bodies).toEqual([body]);
});
