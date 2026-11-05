import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { makeBody, type Project } from '../src/model/project';
import { ready, view } from './helpers';

test.use({
  viewport: { width: 1280, height: 752 },
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 1,
});

async function drag(page: Page, from: { x: number; y: number }, dy: number, dx = 0) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
  for (let i = 1; i <= 6; i++)
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: from.x + (dx * i) / 6, y: from.y + (dy * i) / 6 }],
    });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

async function save(page: Page): Promise<Project> {
  await page.getByRole('button', { name: 'Lisää toimintoja', exact: true }).tap();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Tallenna tiedosto', exact: true }).tap();
  const project = JSON.parse(await readFile((await (await pending).path())!, 'utf8'));
  await page.getByRole('button', { name: 'Lisää toimintoja', exact: true }).tap();
  return project;
}

test('push/pull keeps the focused final-size input when the tablet keyboard opens', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('nivo-mobile-start', 'off'));
  const body = makeBody(180, 120, 60);
  await ready(page, [body]);
  const point = await view(page, [body], 'right');
  await page.getByRole('button', { name: 'Push / pull', exact: true }).tap();
  await drag(page, point(180, 60, 30), -35);
  const review = page.getByRole('region', { name: 'Tarkista mitat' });
  await expect(review).toBeVisible();
  const finalSize = page.getByRole('textbox', { name: 'Toteutuva kokonaismitta', exact: true });
  await finalSize.tap();
  await expect(finalSize).toBeFocused();
  const original = await finalSize.elementHandle();

  // Android's interactive-widget=resizes-content shrinks the layout viewport.
  // Headless Chromium has no OS keyboard, so reproduce that resize explicitly.
  await page.setViewportSize({ width: 1280, height: 400 });
  expect(await original!.evaluate((el) => el.isConnected && document.activeElement === el)).toBe(
    true,
  );
  await expect(page.locator('.app-shell')).toHaveAttribute('data-compact', 'false');
  await expect(finalSize).toBeFocused();
  await expect(finalSize).toBeInViewport();
  // Use the current selection rather than fill(), which would refocus a replacement node.
  await page.keyboard.insertText('150');
  await expect(finalSize).toHaveValue('150');
  await expect(page.getByTestId('height-input')).toHaveValue('-30');
  await page.getByTestId('height-input').tap();
  await expect(page.getByTestId('height-input')).toBeFocused();
  await page.keyboard.insertText('-20');
  await expect(finalSize).toHaveValue('160');
  await finalSize.tap();
  await page.keyboard.insertText('150');
  await page.keyboard.press('Enter');
  await expect(review).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 752 });
  await review.getByRole('button', { name: 'Hyväksy muoto', exact: true }).tap();
  await expect(review).toBeHidden();
  const edited = await save(page);
  expect(edited.bodies[0].feature.width).toBeCloseTo(150);
  expect(edited.bodies[0].origin).toEqual(body.origin);
  await page.getByRole('button', { name: 'Lisää toimintoja', exact: true }).tap();
  await page.getByRole('button', { name: 'Peru', exact: true }).tap();
  await expect(page.getByRole('contentinfo').getByRole('status')).toHaveText('Muokkaus peruttu.');
  await page.getByRole('button', { name: 'Lisää toimintoja', exact: true }).tap();
  expect((await save(page)).bodies[0]).toEqual(body);
});

test('tap-started push/pull retains the docked input and accepts its exact dimension', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('nivo-mobile-start', 'off'));
  const body = makeBody(180, 120, 60);
  await ready(page, [body]);
  const point = await view(page, [body], 'right');
  await page.getByRole('button', { name: 'Push / pull', exact: true }).tap();
  const face = point(180, 60, 30);
  await page.touchscreen.tap(face.x, face.y);
  const finalSize = page.getByTestId('remaining-input');
  await expect(finalSize).toHaveValue('180');
  await expect(page.getByTestId('dynamic-input')).toHaveClass(/docked/);
  await finalSize.tap();
  const original = await finalSize.elementHandle();
  await page.setViewportSize({ width: 1280, height: 400 });
  expect(await original!.evaluate((el) => el.isConnected && document.activeElement === el)).toBe(
    true,
  );
  await page.keyboard.insertText('148');
  await expect(finalSize).toHaveValue('148');
  await page.keyboard.press('Enter');
  await expect(finalSize).toBeHidden();
  await page.setViewportSize({ width: 1280, height: 752 });
  expect((await save(page)).bodies[0].feature.width).toBeCloseTo(148);
});

test('rectangle dimensions retain focus through keyboard resizing and advance to the next field', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('nivo-mobile-start', 'off'));
  await ready(page);
  await page.getByRole('button', { name: 'Piirrä suorakulmio', exact: true }).tap();
  await page.getByRole('button', { name: 'Piilota mallilista', exact: true }).tap();
  const canvas = (await page.getByTestId('viewport').boundingBox())!;
  await drag(page, { x: canvas.x + 300, y: canvas.y + 250 }, 80, 100);
  const review = page.getByRole('region', { name: 'Tarkista mitat' });
  await expect(review).toBeVisible();
  const width = page.getByTestId('width-input');
  await width.tap();
  const original = await width.elementHandle();
  await page.setViewportSize({ width: 1280, height: 400 });
  expect(await original!.evaluate((el) => el.isConnected && document.activeElement === el)).toBe(
    true,
  );
  await page.keyboard.insertText('123');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('depth-input')).toBeFocused();
  await page.keyboard.insertText('98');
  await page.keyboard.press('Enter');
  await expect(review).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 752 });
  await review.getByRole('button', { name: 'Hyväksy muoto', exact: true }).tap();
  await expect(review).toBeHidden();
  const model = await save(page);
  expect(model.bodies).toHaveLength(1);
  expect(
    [model.bodies[0].feature.width, model.bodies[0].feature.depth].sort((a, b) => a - b),
  ).toEqual([98, 123]);
});

test.describe('mouse and hardware keyboard', () => {
  test.use({ hasTouch: false, isMobile: false });
  test('typed push/pull, Tab transfer and Enter acceptance remain immediate', async ({ page }) => {
    const body = makeBody(180, 120, 60);
    await ready(page, [body]);
    const point = await view(page, [body], 'right');
    await page.getByRole('button', { name: 'Push / pull', exact: true }).click();
    const face = point(180, 60, 30);
    await page.mouse.click(face.x, face.y);
    await expect(page.getByTestId('remaining-input')).toHaveValue('180');
    await page.keyboard.type('150');
    await expect(page.getByTestId('height-input')).toBeFocused();
    await expect(page.getByTestId('remaining-input')).toHaveValue('330');
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('remaining-input')).toBeFocused();
    await expect(page.getByTestId('remaining-input')).toHaveValue('150');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('dynamic-input')).toBeHidden();
    await page.getByRole('button', { name: 'Lisää toimintoja', exact: true }).click();
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Tallenna tiedosto', exact: true }).click();
    const model: Project = JSON.parse(await readFile((await (await pending).path())!, 'utf8'));
    expect(model.bodies[0].feature.width).toBeCloseTo(150);
  });
});
