import { expect, test } from '@playwright/test';
import { makeBody } from '../src/model/project';
import { ready, view, click, save, editBody } from './helpers';

test('one dimension form, explicit new-part context and repeatable accept/cancel lifecycle', async ({
  page,
}, info) => {
  const support = makeBody(600, 400, 18, [0, 0, 0], 'Kaappi');
  await ready(page, [support]);
  const p = await view(page, [support]);
  await page.keyboard.press('s');
  await expect(page.getByTestId('tool-context')).toContainText('Napsauta alkukulmaa');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  await click(page, p(100, 100, 18));
  await page.mouse.move(p(250, 250, 18).x, p(250, 250, 18).y);
  await expect(page.getByTestId('tool-context')).toContainText('Uusi osa · Kaappi');
  await expect(page.getByTestId('width-input')).toHaveCount(1);
  await expect(page.getByRole('textbox', { name: 'Muodon leveys', exact: true })).toHaveCount(0);
  await page.getByTestId('width-input').fill('150');
  await page.getByTestId('width-input').press('Tab');
  await page.keyboard.type('120');
  await page.screenshot({ path: info.outputPath('shape-panel.png') });
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  await expect(page.getByTestId('tool-context')).toContainText('Suorakulmio');
  expect((await save(page)).bodies).toEqual([support]);
  await click(page, p(100, 100, 18));
  await click(page, p(250, 220, 18));
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '2');
  await expect(page.getByTestId('tool-context')).toContainText('Suorakulmio');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Valitse', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await editBody(page, support.id);
  await page.keyboard.press('s');
  await expect(page.getByTestId('tool-context')).toContainText('Muokkaa osaa · Kaappi');
});

test('search discovers actual actions, explains unavailability and closes without changing a preview', async ({
  page,
}, info) => {
  await ready(page);
  await page.getByRole('button', { name: 'Hae toiminto', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Hae toiminto' });
  const query = page.getByRole('combobox', { name: 'Etsi toimintoa' });
  await query.fill('Kopioi');
  await expect(dialog.getByRole('option', { name: /Kopioi ja siirrä/ })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await query.press('Enter');
  await expect(dialog).toBeVisible();
  await query.fill('peilaa');
  await expect(dialog).toContainText('Toimintoa ei löytynyt');
  await query.fill('pyoristys');
  await page.screenshot({ path: info.outputPath('command-search.png') });
  await query.press('Enter');
  await expect(page.getByTestId('tool-context')).toContainText('Reunat');
  await page.keyboard.press('s');
  await page.keyboard.type('600');
  await page.keyboard.press('Control+k');
  await expect(dialog).toBeVisible();
  await query.press('Escape');
  await expect(page.getByTestId('width-input')).toHaveValue('600');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('tool-context')).toHaveCount(0);
});

test('overlap choices preview occluded parts and cancel preserves selection; hidden parts stay excluded', async ({
  page,
}, info) => {
  const back = makeBody(400, 300, 20, [0, 0, 0], 'Takalevy');
  const front = makeBody(400, 300, 20, [0, 0, 80], 'Etulevy');
  const hidden = { ...makeBody(400, 300, 20, [0, 0, 140], 'Piilotettu'), hidden: true };
  await ready(page, [back, front, hidden]);
  const p = await view(page, [back, front]);
  await click(page, p(200, 150, 100));
  await page.mouse.click(p(200, 150, 100).x, p(200, 150, 100).y, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Valitse toinen', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Valitse toinen', exact: true });
  await expect(dialog.locator('[data-candidate]')).toHaveCount(2);
  await dialog.getByRole('button', { name: /Takalevy/ }).focus();
  await expect(page.getByTestId('viewport')).toHaveAttribute(
    'data-pick-hovered',
    JSON.stringify([back.id]),
  );
  await expect(page.getByTestId(`body-${front.id}`)).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: info.outputPath('overlap-preview.png') });
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-pick-hovered', '[]');
  await expect(page.getByTestId(`body-${front.id}`)).toHaveAttribute('aria-pressed', 'true');
  // Touch-accessible path through search: tap a point, then choose by name.
  await page.getByRole('button', { name: 'Hae toiminto', exact: true }).click();
  await page.getByRole('combobox', { name: 'Etsi toimintoa' }).fill('Valitse toinen');
  await page.getByRole('option', { name: /Valitse toinen/ }).click();
  await expect(page.locator('.pick-instruction')).toBeVisible();
  await click(page, p(200, 150, 100));
  await dialog.getByRole('button', { name: /Takalevy/ }).click();
  await expect(page.getByTestId(`body-${back.id}`)).toHaveAttribute('aria-pressed', 'true');
  expect((await save(page)).bodies).toEqual([back, front, hidden]);
});

test('Move search shortcut does not toggle copy and cancellation preserves the multiselection', async ({
  page,
}) => {
  const parts = [makeBody(200, 200, 20), makeBody(200, 200, 20, [300, 0, 0])];
  await ready(page, parts);
  const p = await view(page, parts);
  await click(page, p(100, 100, 20));
  await page.keyboard.down('Shift');
  await click(page, p(400, 100, 20));
  await page.keyboard.up('Shift');
  await page.keyboard.press('m');
  await expect(page.getByTestId('tool-context')).toContainText('Siirrä · 2 kappaletta');
  await page.getByTestId('move-x').fill('150');
  await page.getByTestId('move-x').blur();
  await page.keyboard.press('Control+k');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('checkbox', { name: 'Siirrä kopio', exact: true })).not.toBeChecked();
  await expect(page.getByTestId('move-x')).toHaveValue('150');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('tool-context')).toContainText('Siirrä · 2 kappaletta');
  for (const part of parts)
    await expect(page.getByTestId(`body-${part.id}`)).toHaveAttribute('aria-pressed', 'true');
  expect((await save(page)).bodies).toEqual(parts);
});

test('overlap candidates respect assembly selection and editing scope', async ({ page }) => {
  const group = {
    id: 'assembly',
    name: 'Kaappikokonaisuus',
    hidden: false,
    kind: 'assembly' as const,
  };
  const parts = [makeBody(200, 200, 20), makeBody(200, 200, 20, [0, 0, 80])].map((b) => ({
    ...b,
    groupId: group.id,
  }));
  const third = makeBody(200, 200, 20, [0, 0, 150], 'Erillinen');
  await ready(page, [...parts, third], [], [group]);
  const p = await view(page, [...parts, third]);
  await page.mouse.click(p(100, 100, 170).x, p(100, 100, 170).y, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Valitse toinen', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Valitse toinen', exact: true });
  await expect(dialog.locator('[data-candidate]')).toHaveCount(2);
  await dialog.getByRole('button', { name: /Kaappikokonaisuus/ }).focus();
  await expect(page.getByTestId('viewport')).toHaveAttribute(
    'data-pick-hovered',
    JSON.stringify(parts.map((b) => b.id)),
  );
  await dialog.getByRole('button', { name: /Kaappikokonaisuus/ }).click();
  for (const part of parts)
    await expect(page.getByTestId(`body-${part.id}`)).toHaveAttribute('aria-pressed', 'true');
  await editBody(page, third.id);
  await page.getByRole('button', { name: 'Hae toiminto', exact: true }).click();
  await page.getByRole('combobox', { name: 'Etsi toimintoa' }).fill('Valitse toinen');
  await page.getByRole('option', { name: /Valitse toinen/ }).click();
  await click(page, p(100, 100, 170));
  await expect(dialog.locator('[data-candidate]')).toHaveCount(1);
  await expect(dialog).toContainText('Erillinen');
});

test('touch previews an occluded part before confirming it', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Real touch input uses the tablet profile.');
  const back = makeBody(400, 300, 20, [0, 0, 0], 'Takalevy');
  const front = makeBody(400, 300, 20, [0, 0, 80], 'Etulevy');
  await ready(page, [back, front]);
  const p = await view(page, [back, front]);
  await click(page, p(200, 150, 100));
  await page.getByRole('button', { name: 'Hae toiminto', exact: true }).tap();
  await page.getByRole('combobox', { name: 'Etsi toimintoa' }).fill('Valitse toinen');
  await page.getByRole('option', { name: /Valitse toinen/ }).tap();
  const at = p(200, 150, 100);
  await page.touchscreen.tap(at.x, at.y);
  const picker = page.getByRole('dialog', { name: 'Valitse toinen', exact: true });
  await picker.getByRole('button', { name: /Takalevy/ }).tap();
  await expect(picker).toBeVisible();
  await expect(page.getByTestId('viewport')).toHaveAttribute(
    'data-pick-hovered',
    JSON.stringify([back.id]),
  );
  await expect(page.getByTestId(`body-${front.id}`)).toHaveAttribute('aria-pressed', 'true');
  await picker.getByRole('button', { name: 'Valitse korostettu' }).tap();
  await expect(page.getByTestId(`body-${back.id}`)).toHaveAttribute('aria-pressed', 'true');
});

test('opening overlap choices during drawing never accepts the unfinished shape', async ({
  page,
}) => {
  const part = makeBody(400, 300, 20);
  await ready(page, [part]);
  const p = await view(page, [part]);
  await page.keyboard.press('s');
  await click(page, p(50, 50, 20));
  await page.mouse.move(p(200, 150, 20).x, p(200, 150, 20).y);
  await page.getByRole('button', { name: 'Hae toiminto', exact: true }).click();
  await page.getByRole('combobox', { name: 'Etsi toimintoa' }).fill('Valitse toinen');
  await page.getByRole('option', { name: /Valitse toinen/ }).click();
  await click(page, p(200, 150, 20));
  const picker = page.getByRole('dialog', { name: 'Valitse toinen', exact: true });
  await expect(picker).toBeVisible();
  await expect(picker.locator('[data-candidate]').first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(picker).toHaveCount(0);
  expect((await save(page)).bodies).toEqual([part]);
  await expect(page.getByTestId('tool-context')).toContainText('Suorakulmio');
});

test('choosing another object from Cut leaves the tool and selects that object directly', async ({
  page,
}) => {
  const back = makeBody(400, 300, 20, [0, 0, 0], 'Takalevy');
  const front = makeBody(400, 300, 20, [0, 0, 80], 'Etulevy');
  await ready(page, [back, front]);
  const p = await view(page, [back, front]);
  await click(page, p(200, 150, 100));
  await page.keyboard.press('b');
  await page.getByRole('button', { name: 'Hae toiminto', exact: true }).click();
  await page.getByRole('combobox', { name: 'Etsi toimintoa' }).fill('Valitse toinen');
  await page.getByRole('option', { name: /Valitse toinen/ }).click();
  await click(page, p(200, 150, 100));
  await page
    .getByRole('dialog', { name: 'Valitse toinen', exact: true })
    .getByRole('button', { name: /Takalevy/ })
    .click();
  await expect(page.getByRole('button', { name: 'Valitse', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByTestId(`body-${back.id}`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId(`body-${front.id}`)).toHaveAttribute('aria-pressed', 'false');
  expect((await save(page)).bodies).toEqual([back, front]);
});

test('opening search during a held Move drag prevents release from committing behind the dialog', async ({
  page,
}) => {
  const part = makeBody(400, 300, 20);
  await ready(page, [part]);
  const p = await view(page, [part]);
  await click(page, p(150, 150, 20));
  await page.keyboard.press('m');
  await page.mouse.move(p(150, 150, 20).x, p(150, 150, 20).y);
  await page.mouse.down();
  await page.keyboard.press('x');
  await page.mouse.move(p(250, 150, 20).x, p(250, 150, 20).y, { steps: 8 });
  const offset = await page.getByTestId('move-x').inputValue();
  expect(Number(offset)).toBeGreaterThan(0);
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog', { name: 'Hae toiminto' })).toBeVisible();
  await page.mouse.up();
  await page.keyboard.press('Escape');
  expect((await save(page)).bodies).toEqual([part]);
  await expect(page.getByTestId('move-x')).toHaveValue(offset);
  await page.getByTestId('move-x').press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  expect((await save(page)).bodies[0].origin[0]).toBeCloseTo(Number(offset), 6);
});
