import { test, expect } from '@playwright/test';
import { makeBody, type Guide } from '../src/model/project';
import { ready, view, save } from './helpers';

test('box selection includes guides, Shift adds, orange remains on every selected line and Delete is one undoable action', async ({
  page,
}) => {
  const bodies = [makeBody(600, 600, 0)];
  const guides: Guide[] = [
    {
      id: 'free',
      mode: 'free',
      anchor: { point: [100, 100, 0] },
      endAnchor: { point: [250, 100, 0] },
      length: 150,
      angle: 0,
      plane: 'XY',
    },
    {
      id: 'guide',
      mode: 'guide',
      anchor: { point: [100, 400, 0] },
      length: 150,
      angle: 0,
      plane: 'XY',
    },
  ];
  await ready(page, bodies, guides);
  const p = await view(page, bodies);
  const box = async (a: { x: number; y: number }, b: { x: number; y: number }) => {
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 8 });
    await page.mouse.up();
  };
  await box(p(60, 150), p(290, 50));
  await expect(page.locator('.guide-label[data-selected="true"]')).toHaveCount(1);
  await page.keyboard.down('Shift');
  await box(p(60, 450), p(290, 350));
  await page.keyboard.up('Shift');
  await expect(page.locator('.guide-label[data-selected="true"]')).toHaveCount(2);
  await expect(page.getByRole('toolbar', { name: 'Viivojen valinta' })).toContainText('2 viivaa');
  // A context click on a selected line preserves the complete selection.
  const at = p(180, 100);
  await page.mouse.click(at.x, at.y, { button: 'right' });
  await expect(page.locator('.guide-label[data-selected="true"]')).toHaveCount(2);
  await page.keyboard.press('Escape');
  // Select again: Escape deliberately clears the selection.
  await box(p(60, 450), p(290, 50));
  await page.keyboard.press('Delete');
  expect((await save(page)).guides).toEqual([]);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).guides).toEqual(guides);
  await page.getByRole('button', { name: 'Palauta edellinen valinta', exact: true }).click();
  await expect(page.locator('.guide-label[data-selected="true"]')).toHaveCount(2);
  // Crossing can hit the long construction extension far beyond its reference span.
  await box(p(550, 420), p(500, 380));
  await expect(page.locator('.guide-label[data-selected="true"]')).toHaveCount(1);
  await page.keyboard.press('Delete');
  expect((await save(page)).guides.map((g) => g.id)).toEqual(['free']);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  // Enclose body + lines: all are removed and restored together.
  await box(p(-30, 630), p(630, -30));
  await expect(page.locator('.guide-label[data-selected="true"]')).toHaveCount(2);
  await page.keyboard.press('Delete');
  const empty = await save(page);
  expect(empty.bodies).toEqual([]);
  expect(empty.guides).toEqual([]);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  const restored = await save(page);
  expect(restored.bodies).toEqual(bodies);
  expect(restored.guides).toEqual(guides);
});
