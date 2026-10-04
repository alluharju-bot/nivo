import { test, expect } from '@playwright/test';
import { makeBody } from '../src/model/project';
import { ready, view, click, save } from './helpers';

test('overall width remains 500 mm when its original end parts pass each other', async ({
  page,
}) => {
  const a = makeBody(200, 100, 20),
    b = makeBody(200, 100, 20, [300, 0, 0]);
  await ready(page, [a, b]);
  await page.getByRole('button', { name: 'Mittakuva', exact: true }).click();
  await page.getByRole('combobox', { name: 'Mittakuvan kohde', exact: true }).selectOption('all');
  await page.getByRole('button', { name: 'Lisää kokonaismitat', exact: true }).click();
  await expect(page.locator('.drawing-paper [data-mm="500"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Malli', exact: true }).click();
  const p = await view(page, [a, b]);
  await click(page, p(100, 50, 20));
  await page.keyboard.press('m');
  await click(page, p(100, 50, 20));
  await page.getByTestId('move-x').fill('600');
  await page.getByTestId('move-x').press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  await expect(page.locator('[data-testid="dimension-3d"][data-mm="500"]')).toHaveCount(1);
  expect((await save(page)).bodies[0].origin[0]).toBe(600);
  await page.getByRole('button', { name: 'Mittakuva', exact: true }).click();
  await page.getByRole('combobox', { name: 'Mittakuvan kohde', exact: true }).selectOption('all');
  await expect(page.locator('.drawing-paper [data-mm="500"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies[0].origin[0]).toBe(0);
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  await expect(page.locator('.save-status')).toContainText('Tallessa');
  await page.reload();
  await expect(page.locator('[data-testid="dimension-3d"][data-mm="500"]')).toHaveCount(1);
});
