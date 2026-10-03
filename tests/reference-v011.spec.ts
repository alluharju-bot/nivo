import { test, expect } from '@playwright/test';
import { makeBody } from '../src/model/project';
import { ready, view, click, save } from './helpers';

for (const key of ['s', 'c'])
  test(`Shift acquires a body center as a reference with shape tool ${key}`, async ({ page }) => {
    const body = makeBody(600, 400, 100);
    await ready(page, [body]);
    const p = await view(page, [body]);
    await page.keyboard.press(key);
    const center = p(300, 200, 50);
    await page.mouse.move(center.x, center.y);
    await page.keyboard.down('Shift');
    await expect(page.getByTestId('reference-lock')).toContainText('Kappaleen keskipiste');
    const start = p(301, 500, 0);
    await page.mouse.move(start.x, start.y);
    await expect(page.getByTestId('snap-hint')).toContainText('Viite');
    await click(page, start);
    await page.keyboard.up('Shift');
    await click(page, p(450, 620, 0));
    await expect(page.locator('.object-list .object-select')).toHaveCount(2);
    const shape = (await save(page)).bodies[1];
    if (key === 's') expect(shape.origin[0]).toBe(300);
    else expect(shape.origin[0] + shape.feature.width / 2).toBe(300);
    expect(shape.origin[2]).toBe(0);
  });
