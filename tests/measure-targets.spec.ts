import { test, expect } from '@playwright/test';
import { makeBody } from '../src/model/project';
import { resolveAnchor } from '../src/model/guides';
import { ready, view, click, save } from './helpers';

const parts = () => [
  makeBody(100, 30, 600, [0, 0, 0], 'Lähtö'),
  makeBody(40, 30, 320, [283, 0, 0], 'Kohde'),
];

test('edge-started guide highlights and snaps its target edge, midpoint and vertex exactly', async ({
  page,
}, info) => {
  const bodies = parts();
  await ready(page, bodies);
  const p = await view(page, bodies, 'front');
  await page.keyboard.press('t');
  await click(page, p(0, 0, 170));
  const edge = p(283, 0, 110);
  await page.mouse.move(edge.x + 3, edge.y);
  await expect(page.getByTestId('snap-hint')).toHaveText('Reuna');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-hover-edge', /283/);
  await expect(page.getByTestId('guide-length')).toHaveValue('283');
  const mid = p(283, 0, 160);
  await page.mouse.move(mid.x + 2, mid.y + 2);
  await expect(page.getByTestId('snap-hint')).toHaveText('Reunan keskipiste');
  await expect(page.getByTestId('guide-length')).toHaveValue('283');
  const vertex = p(323, 0, 320);
  await page.mouse.move(vertex.x + 2, vertex.y + 2);
  await expect(page.getByTestId('snap-hint')).toHaveText('Verteksi');
  await expect(page.getByTestId('guide-length')).toHaveValue('323');
  await page.screenshot({ path: info.outputPath('measure-target.png') });
  await click(page, { x: vertex.x + 2, y: vertex.y + 2 });
  const result = await save(page);
  expect(result.guides).toHaveLength(1);
  expect(result.guides[0].offset![0]).toBeCloseTo(323, 5);
  expect(result.bodies).toEqual(bodies);
  // An explicit movement lock retains the target snap, without grid rounding.
  await click(page, p(0, 0, 110));
  await page.keyboard.press('x');
  await page.mouse.move(edge.x + 2, edge.y);
  await expect(page.getByTestId('snap-hint')).toHaveText('Reuna');
  await expect(page.getByTestId('guide-length')).toHaveValue('283');
  await click(page, { x: edge.x + 2, y: edge.y });
  expect((await save(page)).guides.at(-1)!.offset![0]).toBeCloseTo(283, 5);
});

test('free measurement starting on an edge snaps its other end to an edge and saves that anchor', async ({
  page,
}) => {
  const bodies = parts();
  await ready(page, bodies);
  const p = await view(page, bodies, 'front');
  await page.keyboard.press('t');
  await page.getByRole('button', { name: 'Valitse mittatyökalu', exact: true }).click();
  await page.getByRole('menuitemradio', { name: /Vapaa mittaviiva/ }).click();
  await click(page, p(0, 0, 170));
  const target = p(283, 0, 110);
  await page.mouse.move(target.x + 3, target.y);
  await expect(page.getByTestId('snap-hint')).toHaveText('Reuna');
  await click(page, { x: target.x + 3, y: target.y });
  const result = await save(page);
  const guide = result.guides[0];
  expect(guide.mode).toBe('free');
  expect(guide.endAnchor).toHaveProperty('edge');
  const end = resolveAnchor(result.bodies, guide.endAnchor!)!;
  expect(end[0]).toBeCloseTo(283, 5);
  expect(end[2]).toBeCloseTo(110, 3);
});
