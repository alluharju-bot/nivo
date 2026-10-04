import { expect, test } from '@playwright/test';
import { makeBody } from '../src/model/project';
import { ready, revealBrowser, save } from './helpers';

test('296 parts copy twice to 1184 and survive undo, redo and reload', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const parts = Array.from({ length: 296 }, (_, i) => ({
    ...makeBody(500, 400, 18, [(i % 20) * 600, Math.floor(i / 20) * 500, 0]),
    groupId: 'cabinet-row',
  }));
  await ready(
    page,
    parts,
    [],
    [
      { id: 'site', name: 'Työmaa', hidden: false },
      { id: 'cabinet-row', name: 'Kaappirivi', parentId: 'site', hidden: false },
    ],
  );
  await page.getByRole('button', { name: 'Valitse ryhmä: Kaappirivi', exact: true }).click();
  await page.getByRole('button', { name: 'Kopioi valinta', exact: true }).click();
  await page.getByTestId('move-y').fill('10000');
  await page.getByTestId('move-y').press('Enter');
  await expect(page.locator('.busy-badge')).toHaveCount(0);
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '592');
  await page.keyboard.press('Escape');
  await revealBrowser(page);
  await page.locator('.object-list').evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.getByRole('button', { name: 'Valitse ryhmä: Työmaa', exact: true }).click();
  await page.getByRole('button', { name: 'Kopioi valinta', exact: true }).click();
  await page.getByTestId('move-y').fill('20000');
  // Repeated parts also stay batched during the live group-copy preview.
  await expect
    .poll(async () => Number(await page.getByTestId('viewport').getAttribute('data-draw-calls')))
    .toBeLessThan(80);
  await page.getByTestId('move-y').press('Enter');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1184', {
    timeout: 60_000,
  });
  const copied = await save(page);
  expect(copied.bodies.slice(0, 296)).toEqual(parts);
  expect(new Set(copied.bodies.map((b) => b.id)).size).toBe(1184);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '592');
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1184');
  await expect(page.locator('.save-status')).toContainText('Tallessa selaimessa');
  await page.reload();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1184', {
    timeout: 60_000,
  });
  const restored = await save(page);
  expect(restored.bodies).toEqual(copied.bodies);
  expect(restored.groups).toEqual(copied.groups);
  expect(errors).toEqual([]);
});
