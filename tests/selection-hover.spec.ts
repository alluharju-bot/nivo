import { expect, test } from '@playwright/test';
import { makeBody } from '../src/model/project';
import { ready, view, click } from './helpers';

test('Shift highlights the whole selectable part immediately and preserves multiselection', async ({
  page,
}) => {
  const parts = [makeBody(100, 100, 100), makeBody(100, 100, 100, [200, 0, 0])];
  await ready(page, parts);
  const p = await view(page, parts);
  const canvas = page.getByTestId('viewport');
  await page.mouse.move(p(50, 50, 100).x, p(50, 50, 100).y);
  await expect(canvas).toHaveAttribute('data-hover-face', 'z:max');
  const builds = await canvas.getAttribute('data-geometry-builds');
  await page.keyboard.down('Shift');
  await expect(canvas).toHaveAttribute('data-selection-hovered', JSON.stringify([parts[0].id]));
  await expect(canvas).toHaveAttribute('data-hover-face', '');
  await page.keyboard.up('Shift');
  await expect(canvas).toHaveAttribute('data-selection-hovered', '[]');
  await expect(canvas).toHaveAttribute('data-hover-face', 'z:max');
  await click(page, p(50, 50, 100));
  await page.keyboard.down('Shift');
  await page.mouse.move(p(250, 50, 100).x, p(250, 50, 100).y);
  await expect(canvas).toHaveAttribute('data-selection-hovered', JSON.stringify([parts[1].id]));
  await click(page, p(250, 50, 100));
  await expect(page.locator('.object-select[aria-pressed="true"]')).toHaveCount(2);
  await click(page, p(250, 50, 100));
  await expect(page.locator('.object-select[aria-pressed="true"]')).toHaveCount(1);
  await page.keyboard.up('Shift');
  await expect(canvas).toHaveAttribute('data-geometry-builds', builds!);
});

test('Shift previews the closed assembly, clears on leaving the canvas and retains E direct targeting', async ({
  page,
}, info) => {
  const group = { id: 'assembly', name: 'Kaappi', kind: 'assembly' as const, hidden: false };
  const parts = [makeBody(100, 100, 100), makeBody(100, 100, 100, [200, 0, 0])].map((b) => ({
    ...b,
    groupId: group.id,
  }));
  await ready(page, parts, [], [group]);
  const p = await view(page, parts);
  const canvas = page.getByTestId('viewport');
  await page.mouse.move(p(50, 50, 100).x, p(50, 50, 100).y);
  await page.keyboard.down('Shift');
  await expect(canvas).toHaveAttribute(
    'data-selection-hovered',
    JSON.stringify(parts.map((b) => b.id)),
  );
  await page.screenshot({ path: info.outputPath('whole-assembly-hover.png') });
  await page.mouse.move(5, 5);
  await expect(canvas).toHaveAttribute('data-selection-hovered', '[]');
  await page.keyboard.up('Shift');
  await page.keyboard.down('Shift');
  await expect(canvas).toHaveAttribute('data-selection-hovered', '[]');
  await page.mouse.move(p(50, 50, 100).x, p(50, 50, 100).y);
  await expect(canvas).toHaveAttribute(
    'data-selection-hovered',
    JSON.stringify(parts.map((b) => b.id)),
  );
  await page.keyboard.press('e');
  await expect(canvas).toHaveAttribute('data-selection-hovered', '[]');
  await expect(page.getByTestId('dynamic-input')).toBeVisible();
  await page.keyboard.up('Shift');
});
