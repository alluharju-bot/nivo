import { expect, test } from '@playwright/test';
import { ready, view, click, save, revealBrowser } from './helpers';
import { makeBody } from '../src/model/project';
import { toolGuides } from '../src/ui/guides/catalog';

const dialog = (page: import('@playwright/test').Page) =>
  page.getByRole('dialog', { name: 'Työkalujen ohjeet' });

test('every guide renders three seekable stages; search and reduced motion work without changing the project', async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page);
  const before = await save(page);
  await page.getByRole('button', { name: 'Käyttöohje', exact: true }).click();
  await expect(dialog(page)).toBeVisible();
  await expect(page.getByTestId('guide-player')).toHaveAttribute('data-playing', 'false');
  expect(toolGuides.length).toBe(33);
  await expect(dialog(page).locator('[data-guide]')).toHaveCount(toolGuides.length);
  for (const guide of toolGuides) {
    await dialog(page).locator(`[data-guide="${guide.id}"]`).click();
    await expect(dialog(page).locator('.guide-title')).toContainText(guide.title);
    for (let i = 0; i < guide.steps.length; i++) {
      await dialog(page)
        .getByRole('button', { name: `Vaihe ${i + 1}: ${guide.steps[i].title}`, exact: true })
        .click();
      await expect(page.getByTestId('guide-step-copy')).toHaveText(guide.steps[i].text);
      await expect(dialog(page).locator('svg.guide-scene')).toHaveAttribute('data-scene', guide.id);
      expect(await dialog(page).locator('svg.guide-scene').innerHTML()).not.toMatch(/NaN|Infinity/);
    }
  }
  const search = page.getByRole('textbox', { name: 'Etsi työkalun ohjetta' });
  await search.fill('pyoristys');
  await expect(dialog(page).locator('[data-guide="fillet"]')).toBeVisible();
  await search.fill('xyz-no-result');
  await expect(dialog(page)).toContainText('Ohjetta ei löytynyt');
  await search.fill('');
  await dialog(page).locator('[data-guide="offset"]').click();
  await dialog(page)
    .getByRole('button', { name: /^Vaihe 2:/ })
    .click();
  await page.screenshot({ path: info.outputPath('guide-desktop.png') });
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);
  expect(await save(page)).toEqual(before);
});

test('context help opens the actual tool mode, isolates modeling keys and preserves an unfinished rectangle', async ({
  page,
}) => {
  const body = makeBody(800, 600, 20);
  await ready(page, [body]);
  const at = await view(page, [body]);
  await page.keyboard.press('s');
  await click(page, at(100, 100, 20));
  await page.mouse.move(at(300, 250, 20).x, at(300, 250, 20).y);
  await page.getByTestId('width-input').fill('222');
  await page.getByRole('button', { name: 'Näytä esimerkki: Suorakulmio', exact: true }).click();
  await expect(dialog(page).locator('svg.guide-scene')).toHaveAttribute('data-scene', 'rectangle');
  const width = await page.getByTestId('width-input').inputValue();
  for (const key of ['x', 'y', 'z', 'e', 'h', '1', '2', '3']) await page.keyboard.press(key);
  await expect(page.getByRole('button', { name: 'Muodot', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByTestId('width-input')).toHaveValue(width);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('width-input')).toHaveValue('222');
  await expect(page.getByTestId('dynamic-input')).toBeVisible();
  await page.keyboard.press('Escape');
  expect((await save(page)).bodies).toEqual([body]);
  await page.keyboard.press('Escape');
  await page.keyboard.press('f');
  await page.getByRole('combobox', { name: 'Reunakäsittely', exact: true }).selectOption('chamfer');
  await page.getByRole('button', { name: 'Näytä esimerkki: Reunat', exact: true }).click();
  await expect(dialog(page).locator('svg.guide-scene')).toHaveAttribute('data-scene', 'chamfer');
});

test('playback pauses, seeks, restarts and remains keyboard accessible on narrow screens', async ({
  page,
}, info) => {
  await ready(page);
  await page.keyboard.press('m');
  await page.getByRole('button', { name: 'Näytä esimerkki: Siirrä', exact: true }).click();
  await expect(page.getByTestId('guide-player')).toHaveAttribute('data-playing', 'true');
  await expect
    .poll(async () =>
      Number(await dialog(page).locator('svg.guide-scene').getAttribute('data-progress')),
    )
    .toBeGreaterThan(0.02);
  await page.getByRole('button', { name: 'Pysäytä animaatio', exact: true }).click();
  const progress = await dialog(page).locator('svg.guide-scene').getAttribute('data-progress');
  await page.waitForTimeout(180);
  await expect(dialog(page).locator('svg.guide-scene')).toHaveAttribute('data-progress', progress!);
  await page.getByRole('slider', { name: 'Ohjeanimaation kohta' }).fill('1000');
  await expect(page.getByTestId('guide-player')).toHaveAttribute('data-playing', 'false');
  await page.getByRole('button', { name: 'Toista alusta' }).click();
  await expect(page.getByTestId('guide-player')).toHaveAttribute('data-playing', 'true');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.getByTestId('guide-player')).toHaveAttribute('data-playing', 'false');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('combobox', { name: 'Näytettävä ohje' }).selectOption('note');
  await expect(dialog(page).locator('svg.guide-scene')).toHaveAttribute('data-scene', 'note');
  await page.getByRole('button', { name: /Vaihe 3:/ }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await expect(page.getByRole('button', { name: 'Jatka mallintamista' })).toBeInViewport();
  await page.getByRole('button', { name: 'Sulje ohje', exact: true }).focus();
  await page.keyboard.press('Shift+Tab');
  expect(
    await page.evaluate(
      () => !!document.activeElement?.closest('[aria-label="Työkalujen ohjeet"]'),
    ),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath('guide-mobile.png') });
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.locator('svg.guide-scene')).toHaveCount(0);
});

test('panels keep primary actions visible and defer only secondary controls', async ({
  page,
}, info) => {
  const body = makeBody(600, 400, 20);
  await ready(page, [body]);
  await page.keyboard.press('k');
  await expect(page.getByTestId('tool-context')).toContainText('Napsauta alkupistettä');
  await expect(page.getByRole('button', { name: 'Valmis viiva', exact: true })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Piirtotapa', exact: true })).toHaveCount(0);
  const words = await page
    .getByRole('complementary', { name: 'Ominaisuudet', exact: true })
    .innerText();
  expect(words.trim().split(/\s+/).length).toBeLessThan(65);
  await page.getByRole('button', { name: 'Muodot', exact: true }).click();
  await page.getByRole('button', { name: 'Pallo', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Muodon paksuus', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await revealBrowser(page);
  await page.getByTestId(`body-${body.id}`).click();
  const edit = page.getByRole('button', { name: 'Muokkaa osaa', exact: true }),
    material = page.locator('summary').filter({ hasText: /^Materiaali$/ });
  await expect(edit).toBeVisible();
  expect((await edit.boundingBox())!.y).toBeLessThan((await material.boundingBox())!.y);
  await page.screenshot({ path: info.outputPath('selection-primary-actions.png') });
  await page.keyboard.press('m');
  await expect(page.getByRole('checkbox', { name: 'Siirrä kopio', exact: true })).toBeVisible();
  await expect(
    page.getByRole('checkbox', { name: 'Vapaa siirto (XYZ)', exact: true }),
  ).not.toBeVisible();
  await page
    .locator('summary')
    .filter({ hasText: /^Siirtotapa$/ })
    .click();
  await page.getByRole('checkbox', { name: 'Vapaa siirto (XYZ)', exact: true }).check();
  expect((await save(page)).settings.moveMode).toBe('free');
  await page.keyboard.press('r');
  await expect(page.getByRole('textbox', { name: 'Kiertopiste X', exact: true })).not.toBeVisible();
  await page
    .locator('summary')
    .filter({ hasText: /^Kiertopisteen koordinaatit$/ })
    .click();
  await expect(page.getByRole('textbox', { name: 'Kiertopiste X', exact: true })).toBeVisible();
});

test('a failed guide download leaves the model and active tool intact', async ({ page }) => {
  await ready(page, [makeBody(600, 400, 20)]);
  const before = await save(page);
  await page.route(/\/(?:assets\/ToolGuide-[^/]+\.js|src\/ui\/guides\/ToolGuide\.tsx)/, (route) =>
    route.abort('failed'),
  );
  await page.keyboard.press('k');
  await page.getByRole('button', { name: 'Näytä esimerkki: Kynä', exact: true }).click();
  await expect(page.getByRole('alertdialog', { name: 'Ohjetta ei voitu avata' })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Jatka mallintamista' })).toBeFocused();
  await page.getByRole('button', { name: 'Jatka mallintamista' }).click();
  await expect(page.getByTestId('tool-context')).toContainText('Kynä');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
  expect(await save(page)).toEqual(before);
});
