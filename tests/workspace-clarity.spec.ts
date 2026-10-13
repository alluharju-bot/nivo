import { test, expect } from '@playwright/test';
import { makeBody, type BodyGroup } from '../src/model/project';
import { ready, save, revealBrowser } from './helpers';
const groups: BodyGroup[] = [
  { id: 'root', name: 'Kaapit', hidden: false },
  { id: 'child', name: 'Kaappi A', parentId: 'root', hidden: false, locked: true },
];
test('parent lock cascades, names retain space, and group selection offers the shared part actions', async ({
  page,
}) => {
  const parts = [
    { ...makeBody(100, 40, 200, [0, 0, 0], 'Vasen ovi'), groupId: 'root', locked: true },
    { ...makeBody(100, 40, 200, [120, 0, 0], 'Oikea ovi'), groupId: 'child' },
  ];
  await ready(page, parts, [], groups);
  await revealBrowser(page);
  await page.getByRole('button', { name: 'Pidä mallilista näkyvissä', exact: true }).click();
  await expect(page.locator('.object-hold-badge')).toHaveCount(0);
  await page.getByRole('button', { name: 'Kiinnitä ryhmä: Kaapit', exact: true }).click();
  let p = await save(page);
  expect(p.bodies.every((b) => b.locked)).toBe(true);
  expect(p.groups.every((g) => g.locked)).toBe(true);
  await page.getByRole('button', { name: 'Vapauta ryhmä: Kaapit', exact: true }).click();
  p = await save(page);
  expect(p.bodies.every((b) => !b.locked)).toBe(true);
  expect(p.groups.every((g) => !g.locked)).toBe(true);
  await page.getByRole('button', { name: 'Valitse ryhmä: Kaapit', exact: true }).click();
  const inspector = page.getByRole('complementary', { name: 'Ominaisuudet', exact: true });
  for (const name of [
    'Siirrä valinta',
    'Kopioi valinta',
    'Kierrä valittuja',
    'Skaalaa valittuja',
    'Komponentin linkitys',
    'Piilota valinta',
    'Valinnan haamunäkymä',
  ])
    await expect(inspector.getByRole('button', { name, exact: true })).toBeEnabled();
  await expect(inspector.getByRole('button', { name: 'Muokkaa osaa', exact: true })).toBeDisabled();
  await expect(
    inspector
      .locator('summary')
      .filter({ hasText: /^Materiaali/ })
      .first(),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  p = await save(page);
  expect(p.bodies.every((b) => b.locked)).toBe(true);
});
test('top dock leaves edit context visible, and drawing controls stay inside the inspector beside a pinned list', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('nivo-tool-dock', 'top');
    localStorage.setItem('nivo-browser-pinned', 'true');
  });
  const part = makeBody(200, 100, 30);
  await ready(page, [part]);
  await revealBrowser(page);
  await page.getByTestId(`body-${part.id}`).click();
  await page.getByRole('button', { name: 'Muokkaa osaa', exact: true }).click();
  const bar = page.getByTestId('edit-context'),
    rail = page.getByRole('complementary', { name: 'Mallinnustyökalut', exact: true });
  await expect(bar).toBeVisible();
  const a = (await bar.boundingBox())!,
    b = (await rail.boundingBox())!;
  expect(a.y).toBeGreaterThanOrEqual(b.y + b.height - 1);
  const button = bar.getByRole('button', { name: 'Lopeta muokkaus', exact: true });
  await expect(button).toBeVisible();
  const buttonRect = (await button.boundingBox())!;
  expect(
    await page.evaluate(
      ({ x, y }) =>
        document.elementFromPoint(x, y)?.closest('[data-testid="edit-context"]') !== null,
      { x: buttonRect.x + buttonRect.width / 2, y: buttonRect.y + buttonRect.height / 2 },
    ),
  ).toBe(true);
  await page.screenshot({ path: test.info().outputPath('top-dock-editing.png') });
  await button.click();
  await page.keyboard.press('s');
  const inspector = page.getByRole('complementary', { name: 'Ominaisuudet', exact: true });
  await expect(
    inspector.getByRole('button', { name: 'Mittaus/rakennusviiva', exact: true }),
  ).toBeVisible();
  await expect(inspector.getByRole('button', { name: 'Poimi viite', exact: true })).toBeVisible();
  await inspector.getByRole('button', { name: 'Mittaus/rakennusviiva', exact: true }).click();
  await expect(
    inspector.getByRole('button', { name: 'Mittaus/rakennusviiva', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: test.info().outputPath('top-dock-pinned.png') });
});

test('mixed multi-selection unlocks only chosen parts, toggles ghost and hides with undo', async ({
  page,
}) => {
  const parts = [
    { ...makeBody(100, 40, 200, [0, 0, 0], 'Ovi A'), groupId: 'held' },
    makeBody(100, 40, 200, [120, 0, 0], 'Ovi B'),
    { ...makeBody(100, 40, 200, [240, 0, 0], 'Muu ovi'), groupId: 'held' },
  ];
  await ready(page, parts, [], [{ id: 'held', name: 'Kaapit', hidden: false, locked: true }]);
  await revealBrowser(page);
  await page.getByTestId(`body-${parts[0].id}`).click();
  await page.getByTestId(`body-${parts[1].id}`).click({ modifiers: ['ControlOrMeta'] });
  const panel = page.getByRole('complementary', { name: 'Ominaisuudet', exact: true });
  await expect(page.locator('.object-select[aria-pressed="true"]')).toHaveCount(2);
  const hold = panel.getByRole('button', { name: 'Hold-lukitus', exact: true });
  await expect(hold).toContainText('Vapauta');
  await hold.click();
  let p = await save(page);
  expect(p.bodies.slice(0, 2).every((b) => !b.locked)).toBe(true);
  expect(p.groups[0].locked).toBe(false);
  expect(p.bodies[2].locked).toBe(true);
  await expect(hold).toContainText('Lukitse');
  const ghost = panel.getByRole('button', { name: 'Valinnan haamunäkymä', exact: true });
  await ghost.click();
  await expect(ghost).toHaveAttribute('aria-pressed', 'true');
  p = await save(page);
  expect(p.settings.modelDisplay?.overrides).toEqual({
    [parts[0].id]: 'ghost',
    [parts[1].id]: 'ghost',
  });
  await ghost.click();
  await expect(ghost).toHaveAttribute('aria-pressed', 'false');
  await panel.getByRole('button', { name: 'Piilota valinta', exact: true }).click();
  p = await save(page);
  expect(p.bodies.map((b) => b.hidden)).toEqual([true, true, false]);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  p = await save(page);
  expect(p.bodies.every((b) => !b.hidden)).toBe(true);
  await hold.click();
  p = await save(page);
  expect(p.bodies.every((b) => b.locked)).toBe(true);
});
