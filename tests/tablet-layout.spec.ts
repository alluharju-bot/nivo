import { test, expect, type Page, type Locator } from '@playwright/test';
import { ready } from './helpers';
import { makeBody } from '../src/model/project';

async function fullyInside(page: Page, locator: Locator) {
  await expect(locator).toBeVisible();
  const bounds = (await locator.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height + 1);
}
async function start(page: Page) {
  await page.addInitScript(() => localStorage.setItem('nivo-mobile-start', 'off'));
  await ready(page, [makeBody(180, 120, 60)]);
}

test.describe('compact tablet chrome', () => {
  // Representative Android tablet CSS viewports, not a claim of physical device testing.
  test.use({
    viewport: { width: 1280, height: 752 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 1,
  });
  test('landscape keeps fullscreen visible, reduces chrome and retains reachable commands', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await start(page);
    await expect(page.locator('.app-shell')).toHaveAttribute('data-compact', 'false');
    expect((await page.getByRole('banner').boundingBox())!.height).toBe(48);
    expect((await page.locator('.tool-rail').boundingBox())!.width).toBe(72);
    expect((await page.locator('.inspector').boundingBox())!.width).toBe(236);
    expect((await page.getByTestId('viewport').boundingBox())!.width).toBeGreaterThanOrEqual(970);
    const fullscreen = page.getByRole('button', { name: 'Siirry koko näyttöön', exact: true });
    await fullyInside(page, fullscreen);
    const box = (await fullscreen.boundingBox())!;
    expect(
      await page.evaluate(
        ({ x, y }) =>
          document.elementFromPoint(x, y)?.closest('button')?.getAttribute('aria-label'),
        { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      ),
    ).toBe('Siirry koko näyttöön');
    await page.getByRole('button', { name: 'Push / pull', exact: true }).tap();
    await page.getByRole('button', { name: 'Lisää toimintoja', exact: true }).tap();
    for (const name of [
      'Avaa projektitiedosto',
      'Tallenna tiedosto',
      'Lisää malli nykyiseen projektiin',
    ]) {
      const command = page.getByRole('button', { name, exact: true });
      await command.scrollIntoViewIfNeeded();
      await fullyInside(page, command);
    }
    await fullscreen.tap();
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
    const exit = page.getByRole('button', { name: 'Poistu koko näytöstä', exact: true });
    await fullyInside(page, exit);
    await exit.tap();
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
    await expect(page.getByRole('button', { name: 'Push / pull', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('#header-controls')).not.toBeVisible();
    await page.getByRole('button', { name: 'Muodot', exact: true }).tap();
    await fullyInside(page, page.getByRole('group', { name: 'Valitse muoto' }));
    await page
      .getByRole('group', { name: 'Valitse muoto' })
      .getByRole('button', { name: 'Ympyrä', exact: true })
      .tap();
    await expect(page.getByRole('button', { name: 'Muodot', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.screenshot({ path: test.info().outputPath('tablet-landscape.png') });
    expect(errors).toEqual([]);
  });
  test('portrait keeps the canvas wide and both side panels can be opened without clipping', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 800, height: 1232 });
    await start(page);
    await expect(page.locator('.app-shell')).toHaveAttribute('data-compact', 'true');
    const canvas = (await page.getByTestId('viewport').boundingBox())!;
    expect(canvas.width).toBe(752);
    await fullyInside(
      page,
      page.getByRole('button', { name: 'Siirry koko näyttöön', exact: true }),
    );
    await page.getByRole('button', { name: 'Avaa ominaisuudet', exact: true }).tap();
    const inspector = page.getByRole('complementary', { name: 'Ominaisuudet', exact: true });
    await fullyInside(page, inspector);
    expect((await inspector.boundingBox())!.width).toBe(248);
    expect((await page.getByTestId('viewport').boundingBox())!.width).toBe(canvas.width);
    await inspector.getByRole('button', { name: 'Sulje ominaisuudet', exact: true }).tap();
    await page.getByRole('button', { name: 'Näytä mallilista', exact: true }).tap();
    const list = page.getByRole('complementary', { name: 'Mallilista', exact: true });
    await fullyInside(page, list);
    await list.getByRole('button', { name: 'Piilota mallilista', exact: true }).tap();
    await page.getByRole('button', { name: 'Mittatyökalu', exact: true }).tap();
    await page.getByRole('button', { name: 'Mittatyökalu', exact: true }).tap();
    const menu = page.getByRole('menu', { name: 'Mittatyökalun tila' });
    await fullyInside(page, menu);
    await menu.getByRole('menuitemradio', { name: /Dimensio/ }).tap();
    await page.screenshot({ path: test.info().outputPath('tablet-portrait.png') });
    // Rotation restores the ordinary tablet layout and does not lose the active tool.
    await page.setViewportSize({ width: 1280, height: 752 });
    await expect(page.locator('.app-shell')).toHaveAttribute('data-compact', 'false');
    await expect(page.getByRole('button', { name: 'Mittatyökalu', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await fullyInside(
      page,
      page.getByRole('button', { name: 'Siirry koko näyttöön', exact: true }),
    );
  });
  test('all tool docks keep the inspector and fullscreen inside the tablet', async ({ page }) => {
    await start(page);
    for (const [name, dock] of [
      ['Oikea', 'right'],
      ['Ylä', 'top'],
      ['Ala', 'bottom'],
      ['Vasen', 'left'],
    ]) {
      await page.getByRole('button', { name: 'Siirrä työkalupalkkia', exact: true }).tap();
      await page
        .getByRole('group', { name: 'Työkalupalkin sijainti' })
        .getByRole('button', { name, exact: true })
        .tap();
      await expect(page.locator('.workspace')).toHaveAttribute('data-dock', dock);
      await fullyInside(page, page.locator('.inspector'));
      await fullyInside(page, page.locator('.tool-rail'));
      await fullyInside(
        page,
        page.getByRole('button', { name: 'Siirry koko näyttöön', exact: true }),
      );
    }
  });
});

test('mouse desktop retains its rail, inspector and header sizes; fullscreen also fits narrow windows', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1680, height: 960 });
  await start(page);
  expect((await page.getByRole('banner').boundingBox())!.height).toBe(60);
  expect((await page.locator('.tool-rail').boundingBox())!.width).toBe(82);
  expect((await page.locator('.inspector').boundingBox())!.width).toBe(286);
  await fullyInside(page, page.getByRole('button', { name: 'Siirry koko näyttöön', exact: true }));
  for (const width of [1440, 1280, 1024, 800, 390, 320]) {
    await page.setViewportSize({ width, height: 960 });
    await fullyInside(
      page,
      page.getByRole('button', { name: 'Siirry koko näyttöön', exact: true }),
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  }
});
