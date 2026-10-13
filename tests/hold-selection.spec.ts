import { expect, test } from '@playwright/test';
import { makeBody } from '../src/model/project';
import { ready, view, save, revealBrowser } from './helpers';

test('twenty selected panels identify individual and inherited Holds without losing selection', async ({
  page,
}, info) => {
  const groups = [
    { id: 'locked-group', name: 'Kiinnitetyt paneelit', hidden: false, locked: true },
  ];
  const parts = Array.from({ length: 20 }, (_, i) => ({
    ...makeBody(80, 400, 18, [(i % 5) * 120, Math.floor(i / 5) * 440, 0], `Paneeli ${i + 1}`),
    locked: i === 6,
    groupId: i === 13 ? 'locked-group' : undefined,
  }));
  await ready(page, parts, [], groups);
  const p = await view(page, parts);
  const viewport = page.getByTestId('viewport');
  const builds = await viewport.getAttribute('data-geometry-builds');
  const start = p(-20, 1740),
    end = p(580, -20);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 6 });
  await page.mouse.up();
  const notice = page.getByRole('region', { name: 'Valinnan lukitut osat' });
  await expect(notice).toContainText('Lukittu 2 / 20');
  await expect(notice.locator('li')).toHaveCount(2);
  await expect(notice).toContainText('Paneeli 7');
  await expect(notice).toContainText('Paneeli 14');
  await expect(notice).toContainText('Ryhmä: Kiinnitetyt paneelit');
  await expect(page.locator('.hold-marker')).toHaveCount(2);
  await expect(page.getByRole('img', { name: 'Hold: Paneeli 7', exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Hold: Paneeli 14', exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('twenty-panels-two-holds.png') });
  await page.keyboard.press('m');
  await expect(notice).toContainText('Lukittu 2 / 20');
  expect((await save(page)).bodies).toEqual(parts);
  const camera = await viewport.getAttribute('data-camera');
  await notice
    .getByRole('button', { name: 'Keskitä lukittuun osaan: Paneeli 7', exact: true })
    .click();
  await expect(viewport).not.toHaveAttribute('data-camera', camera!);
  await expect(notice).toContainText('Lukittu 2 / 20');
  await expect(page.getByRole('img', { name: 'Hold: Paneeli 7', exact: true })).toBeVisible();
  await revealBrowser(page);
  await expect(page.locator('.object-hold-badge')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Vapauta: Paneeli 7', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByRole('button', { name: 'Vapauta: Paneeli 14', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Vapauta: Paneeli 7', exact: true }).click();
  await expect(notice).toContainText('Lukittu 1 / 20');
  await expect(page.getByRole('img', { name: 'Hold: Paneeli 7', exact: true })).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Vapauta ryhmä: Kiinnitetyt paneelit', exact: true })
    .click();
  await expect(notice).toHaveCount(0);
  await expect(page.locator('.hold-marker')).toHaveCount(0);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  await expect(notice).toContainText('Lukittu 1 / 20');
  await expect(viewport).toHaveAttribute('data-geometry-builds', builds!);
  await expect(page.locator('.save-status')).toContainText('Tallessa selaimessa');
  await page.reload();
  await expect(page.locator('.busy-badge')).toHaveCount(0);
  await page.getByTestId(`body-${parts[13].id}`).click();
  await expect(notice).toContainText('Lukittu 1 / 1');
  await expect(notice).toContainText('Ryhmä: Kiinnitetyt paneelit');
});

test('a hidden held part is named but has no viewport marker and cannot be focused', async ({
  page,
}) => {
  const part = {
    ...makeBody(600, 400, 18, [0, 0, 0], 'Piilotettu paneeli'),
    hidden: true,
    locked: true,
  };
  await ready(page, [part]);
  await page.getByTestId(`body-${part.id}`).click();
  const notice = page.getByRole('region', { name: 'Valinnan lukitut osat' });
  await expect(notice).toContainText('Lukittu 1 / 1');
  await expect(notice).toContainText('Piilotettu');
  await expect(
    notice.getByRole('button', {
      name: 'Keskitä lukittuun osaan: Piilotettu paneeli',
      exact: true,
    }),
  ).toBeDisabled();
  await expect(page.locator('.hold-marker')).toHaveCount(0);
  await page.getByRole('button', { name: 'Näytä: Piilotettu paneeli', exact: true }).click();
  await expect(
    notice.getByRole('button', {
      name: 'Keskitä lukittuun osaan: Piilotettu paneeli',
      exact: true,
    }),
  ).toBeEnabled();
  await expect(
    page.getByRole('img', { name: 'Hold: Piilotettu paneeli', exact: true }),
  ).toHaveCount(1);
});
