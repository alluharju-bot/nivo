import { test, expect } from '@playwright/test';
import { makeBody } from '../src/model/project';
import { ready, revealBrowser, view, click, save } from './helpers';

test('folds survive closing, tabs and reload; selecting a part reveals only its own branch', async ({
  page,
}) => {
  const parts = Array.from({ length: 30 }, (_, i) => ({
    ...makeBody(70, 80, 20, [i * 100, 0, 0], `Levy ${i + 1}`),
    groupId: 'child',
  }));
  const groups = [
    { id: 'root', name: 'Kalusteet', hidden: false },
    { id: 'child', name: 'Ovet', parentId: 'root', hidden: false },
    { id: 'other', name: 'Muut', hidden: false },
  ];
  await ready(page, parts, [], groups);
  await revealBrowser(page);
  await page.getByRole('button', { name: 'Sulje ryhmä: Ovet', exact: true }).click();
  await page.getByRole('button', { name: 'Sulje ryhmä: Muut', exact: true }).click();
  await page.getByRole('button', { name: 'Piilota mallilista', exact: true }).click();
  await revealBrowser(page);
  await expect(page.getByRole('button', { name: 'Avaa ryhmä: Ovet', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Mitat 0$/ }).click();
  await page.getByRole('button', { name: /^Kappaleet 30$/ }).click();
  await expect(page.getByRole('button', { name: 'Avaa ryhmä: Ovet', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Valitse', exact: true })).toBeEnabled();
  await revealBrowser(page);
  await expect(page.getByRole('button', { name: 'Avaa ryhmä: Ovet', exact: true })).toBeVisible();
  const p = await view(page, parts);
  await click(page, p(2935, 40, 20));
  await revealBrowser(page);
  const target = page.getByTestId(`body-${parts[29].id}`);
  await expect(target).toHaveAttribute('aria-pressed', 'true');
  await expect(target).toBeInViewport();
  await expect(
    page.getByTestId('group-root').locator('.object-group-heading').first(),
  ).toHaveAttribute('data-contains-selection', 'true');
  await expect(page.getByTestId('group-child').locator('.object-group-heading')).toHaveAttribute(
    'data-contains-selection',
    'true',
  );
  await expect(page.getByRole('button', { name: 'Avaa ryhmä: Muut', exact: true })).toBeVisible();
  // Explicitly closing the selected branch must stick until selection actually changes.
  await page.getByRole('button', { name: 'Sulje ryhmä: Ovet', exact: true }).click();
  await page.getByRole('button', { name: /^Mitat 0$/ }).click();
  await page.getByRole('button', { name: /^Kappaleet 30$/ }).click();
  await expect(page.getByRole('button', { name: 'Avaa ryhmä: Ovet', exact: true })).toBeVisible();
});

test('row colors persist without changing held parts or materials; locate is temporary and does not rebuild meshes', async ({
  page,
}) => {
  const part = { ...makeBody(200, 100, 18, [0, 0, 0], 'Ovi'), locked: true, groupId: 'g' };
  const wall = makeBody(600, 20, 800, [-200, -60, -100], 'Seinä');
  await ready(page, [part, wall], [], [{ id: 'g', name: 'Kaappi', hidden: false }]);
  await revealBrowser(page);
  await page.getByTestId(`body-${part.id}`).click();
  await page.getByRole('button', { name: 'Valinnan riviväri', exact: true }).click();
  await page.getByRole('button', { name: 'Riviväri: Sininen', exact: true }).click();
  let p = await save(page);
  expect(p.bodies[0]).toEqual({ ...part, listColor: '#5486b3' });
  await page
    .getByRole('button', { name: 'Valitse ryhmä: Kaappi', exact: true })
    .click({ button: 'right' });
  await page.getByRole('button', { name: 'Riviväri: Vihreä', exact: true }).click();
  await page.reload();
  await revealBrowser(page);
  await expect(page.locator(`[data-tree-body="${part.id}"]`)).toHaveAttribute(
    'data-list-color',
    '#5486b3',
  );
  await expect(page.getByTestId('group-g').locator('.object-group-heading')).toHaveAttribute(
    'data-list-color',
    '#668d70',
  );
  const canvas = page.getByTestId('viewport');
  const builds = await canvas.getAttribute('data-geometry-builds');
  await page.getByRole('button', { name: 'Keskitä: Ovi', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-located-ids', JSON.stringify([part.id]));
  await page.screenshot({ path: test.info().outputPath('located-through-wall.png') });
  await expect(canvas).toHaveAttribute('data-located-ids', '[]', { timeout: 7000 });
  await expect(canvas).toHaveAttribute('data-geometry-builds', builds!);
  p = await save(page);
  expect(p.bodies[0]).toEqual({ ...part, listColor: '#5486b3' });
});

test('a selected part is revealed in a virtualized tree', async ({ page }) => {
  const parts = Array.from({ length: 410 }, (_, i) =>
    makeBody(10, 10, 10, [i * 12, 0, 0], `Osa ${i + 1}`),
  );
  await ready(page, parts);
  const p = await view(page, parts);
  await click(page, p(409 * 12 + 5, 5, 10));
  await revealBrowser(page);
  await expect(page.getByTestId(`body-${parts[409].id}`)).toBeInViewport();
  await expect(page.getByTestId(`body-${parts[409].id}`)).toHaveAttribute('aria-pressed', 'true');
  expect(await page.locator('.object-select').count()).toBeLessThan(50);
});
