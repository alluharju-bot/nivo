import { test, expect, type Page, type Locator } from '@playwright/test';
import { makeBody, type BodyGroup } from '../src/model/project';
import { ready, save } from './helpers';

const groups: BodyGroup[] = [
  { id: 'cabinet', name: 'Kaappi', hidden: false },
  { id: 'doors', name: 'Ovet', hidden: false, parentId: 'cabinet' },
  { id: 'other', name: 'Hylly', hidden: false },
];
const groupButton = (page: Page, name: string) =>
  page.getByRole('button', { name: `Valitse ryhmä: ${name}`, exact: true });

test('a thousand-part tree keeps a small DOM and supports regrouping an off-screen row', async ({
  page,
}) => {
  const parts = Array.from({ length: 1000 }, (_, i) => ({
    ...makeBody(20, 20, 40, [(i % 40) * 30, Math.floor(i / 40) * 30, 0], `Osa ${i + 1}`),
    groupId: 'cabinet',
  }));
  await ready(page, parts, [], groups);
  const list = page.locator('.virtual-object-list');
  await expect(list).toBeVisible();
  expect(await page.locator('.object-list .object-select').count()).toBeLessThan(50);
  // Reveal row 500 by scrolling; no selector has to mount all preceding rows.
  await list.evaluate((el) => {
    el.scrollTop = 500 * (matchMedia('(pointer:coarse)').matches ? 46 : 40);
  });
  const source = page.getByTestId(`body-${parts[499].id}`);
  await expect(source).toBeVisible();
  await source.click();
  await drag(page, source, page.getByTestId('tree-root-drop'));
  const model = await save(page);
  expect(model.bodies[499].groupId).toBeUndefined();
  expect(model.bodies.filter((b) => b.groupId === 'cabinet')).toHaveLength(999);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual(parts);
  expect(await page.locator('.object-list .object-select').count()).toBeLessThan(50);
});
async function drag(page: Page, source: Locator, target: Locator, release = true) {
  const browser = page.getByRole('complementary', { name: 'Mallilista' });
  if ((await browser.getAttribute('data-expanded')) === 'false')
    await page.getByRole('button', { name: 'Näytä mallilista' }).click();
  await expect(source).toBeEnabled();
  await source.scrollIntoViewIfNeeded();
  await source.hover();
  const a = (await source.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await target.scrollIntoViewIfNeeded();
  const b = (await target.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
  await expect(page.getByTestId('tree-drag-preview')).toBeVisible();
  if (release) await page.mouse.up();
}

test('drag selected parts into a collapsed group and out to root, with undo and persistence', async ({
  page,
}, info) => {
  const a = makeBody(100, 200, 18, [0, 0, 0], 'Ovi A'),
    b = makeBody(100, 200, 18, [120, 0, 0], 'Ovi B');
  await ready(page, [a, b], [], groups);
  await page.getByTestId(`body-${a.id}`).click();
  await page.getByTestId(`body-${b.id}`).click({ modifiers: ['Shift'] });
  await page.getByRole('button', { name: 'Sulje ryhmä: Kaappi', exact: true }).click();
  await drag(page, page.getByTestId(`body-${a.id}`), groupButton(page, 'Kaappi'), false);
  await expect(page.getByTestId('tree-drag-preview')).toContainText('2 kappaletta');
  await page.screenshot({ path: info.outputPath('tree-drop.png') });
  await page.mouse.up();
  await expect(page.getByTestId('group-cabinet').getByTestId(`body-${a.id}`)).toBeVisible();
  let model = await save(page);
  expect(model.bodies).toEqual([a, b].map((part) => ({ ...part, groupId: 'cabinet' })));
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual([a, b]);
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  await drag(page, page.getByTestId(`body-${b.id}`), page.getByTestId('tree-root-drop'));
  model = await save(page);
  expect(model.bodies).toEqual([a, b]);
  await drag(page, page.getByTestId(`body-${a.id}`), groupButton(page, 'Hylly'));
  await expect(page.locator('.save-status')).toContainText('Tallessa selaimessa');
  model = await save(page);
  await page.reload();
  await expect(page.getByTestId('body-' + a.id)).toBeVisible();
  expect((await save(page)).bodies).toEqual(model.bodies);
  await groupButton(page, 'Hylly').click();
  await page.screenshot({ path: info.outputPath('object-panel.png') });
});

test('nested group dragging preserves contents, blocks cycles, cancels safely and keeps click selection', async ({
  page,
}) => {
  const a = { ...makeBody(100, 100, 30), groupId: 'doors' };
  await ready(page, [a], [], groups);
  await drag(page, groupButton(page, 'Kaappi'), groupButton(page, 'Ovet'), false);
  await expect(page.getByTestId('tree-drag-preview')).toContainText('Ei oman ryhmän sisään');
  await page.mouse.up();
  expect((await save(page)).groups).toEqual(groups);
  await drag(page, groupButton(page, 'Ovet'), groupButton(page, 'Hylly'), false);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect((await save(page)).groups).toEqual(groups);
  await drag(page, groupButton(page, 'Ovet'), groupButton(page, 'Hylly'));
  await expect(page.getByTestId('group-other').getByTestId('group-doors')).toBeVisible();
  let model = await save(page);
  expect(model.bodies).toEqual([a]);
  expect(model.groups.find((g) => g.id === 'doors')?.parentId).toBe('other');
  await drag(page, groupButton(page, 'Ovet'), page.getByTestId('tree-root-drop'));
  expect((await save(page)).groups.find((g) => g.id === 'doors')?.parentId).toBeUndefined();
  await page.keyboard.press('Escape');
  await page.getByTestId(`body-${a.id}`).click();
  await expect(page.getByTestId(`body-${a.id}`)).toHaveAttribute('aria-pressed', 'true');
  await drag(page, page.getByTestId(`body-${a.id}`), page.getByTestId('viewport'));
  expect((await save(page)).bodies).toEqual([a]);
  await page.getByTestId(`body-${a.id}`).press('F2');
  await page.getByRole('textbox', { name: 'Kappaleen uusi nimi' }).fill('Peruttu nimi');
  await page.getByRole('textbox', { name: 'Kappaleen uusi nimi' }).press('Escape');
  expect((await save(page)).bodies[0].name).toBe(a.name);
});

test('touch grip arranges parts while the list and current tool remain accessible', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'tablet', 'Touch emulation');
  const a = makeBody(100, 100, 30, [0, 0, 0], 'Levy');
  await ready(page, [a], [], [groups[2]]);
  const grip = page.getByTestId(`body-${a.id}`).locator('.tree-drag-grip');
  const r = (await grip.boundingBox())!,
    t = (await groupButton(page, 'Hylly').boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  const from = { x: r.x + r.width / 2, y: r.y + r.height / 2 },
    to = { x: t.x + t.width / 2, y: t.y + t.height / 2 };
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ ...from, id: 1 }],
  });
  for (let i = 1; i <= 10; i++)
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: from.x + ((to.x - from.x) * i) / 10, y: from.y + ((to.y - from.y) * i) / 10, id: 1 },
      ],
    });
  await expect(page.getByTestId('tree-drag-preview')).toContainText('Hylly');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  expect((await save(page)).bodies[0]).toEqual({ ...a, groupId: 'other' });
  await page.getByTestId(`body-${a.id}`).tap();
  await page.keyboard.press('m');
  await expect(page.getByTestId('move-x')).toBeInViewport();
  await expect(page.getByTestId(`body-${a.id}`)).toBeInViewport();
  await page.screenshot({ path: info.outputPath('tool-and-tree.png') });
});

test('a long list scrolls during dragging; an unselected part moves alone and menus support keyboard regrouping', async ({
  page,
}, info) => {
  const parts = Array.from({ length: 18 }, (_, i) =>
    makeBody(20, 20, 40, [i * 30, 0, 0], `Osa ${i + 1}`),
  );
  await ready(page, parts, [], [groups[2]]);
  await page.getByTestId(`body-${parts[1].id}`).click();
  const source = page.getByTestId(`body-${parts[0].id}`),
    r = (await source.boundingBox())!;
  const list = page.locator('.object-list'),
    box = (await list.boundingBox())!;
  await page.mouse.move(r.x + 70, r.y + r.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 70, box.y + box.height - 12, { steps: 8 });
  await expect(page.getByTestId('tree-drag-preview')).toContainText('Osa 1');
  await expect(groupButton(page, 'Hylly')).toBeInViewport({ ratio: 1 });
  const t = (await groupButton(page, 'Hylly').boundingBox())!;
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2);
  await expect(page.getByTestId('tree-drag-preview')).toContainText('→ Hylly');
  await page.mouse.up();
  const result = await save(page);
  expect(result.bodies[0]).toEqual({ ...parts[0], groupId: 'other' });
  expect(result.bodies.slice(1)).toEqual(parts.slice(1));
  // Keyboard-generated clicks still work after a pointer drag.
  await groupButton(page, 'Hylly').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: 'Ryhmän toiminnot' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByTestId(`body-${parts[0].id}`).click();
  await page
    .locator('summary')
    .filter({ hasText: /^Ryhmä$/ })
    .click();
  await page.getByRole('combobox', { name: 'Kappaleen ryhmä', exact: true }).selectOption('');
  expect((await save(page)).bodies).toEqual(parts);
  await page.screenshot({ path: info.outputPath('long-list.png') });
});

test('opening a tool brings its measurements into view after scrolling properties', async ({
  page,
}) => {
  const parts = Array.from({ length: 15 }, (_, i) =>
    makeBody(20, 20, 40, [i * 30, 0, 0], `Osa ${i + 1}`),
  );
  await ready(page, parts, [], [groups[2]]);
  await page.getByTestId(`body-${parts[0].id}`).click();
  for (const name of ['Ryhmä', 'Väri', 'Sijainti', 'Mitat ja mallinnus'])
    await page
      .locator('summary')
      .filter({ hasText: new RegExp(`^\\s*${name}\\s*$`) })
      .click();
  await page.getByRole('button', { name: 'Yhdistä valitut', exact: true }).scrollIntoViewIfNeeded();
  expect(await page.locator('.inspector-details').evaluate((el) => el.scrollTop)).toBeGreaterThan(
    0,
  );
  await page.keyboard.press('m');
  await expect(page.getByTestId('move-x')).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Kappaleet 15', exact: true })).toBeInViewport();
  await page.keyboard.press('Escape');
  expect((await save(page)).bodies).toEqual(parts);
});

test('group settings still combine the selected parts into one body', async ({ page }) => {
  const parts = [0, 40].map((x) => ({ ...makeBody(20, 20, 40, [x, 0, 0]), groupId: 'other' }));
  await ready(page, parts, [], [groups[2]]);
  await groupButton(page, 'Hylly').click();
  await page
    .locator('summary')
    .filter({ hasText: /^Ryhmän asetukset$/ })
    .click();
  await page.getByRole('button', { name: 'Yhdistä valitut', exact: true }).click();
  await expect(page.locator('.object-list .object-select')).toHaveCount(1);
  expect((await save(page)).bodies[0].feature.type).toBe('union');
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual(parts);
});

test('Shift selects the visible row range, Ctrl toggles one part, and focus preserves selection', async ({
  page,
}) => {
  const parts = Array.from({ length: 6 }, (_, i) =>
    makeBody(100, 100, 50, [i * 300, 0, 0], `Osa ${i + 1}`),
  );
  await ready(page, parts);
  await page.getByTestId(`body-${parts[1].id}`).click();
  await page.getByTestId(`body-${parts[4].id}`).click({ modifiers: ['Shift'] });
  for (let i = 0; i < 6; i++)
    await expect(page.getByTestId(`body-${parts[i].id}`)).toHaveAttribute(
      'aria-pressed',
      String(i >= 1 && i <= 4),
    );
  await page.getByTestId(`body-${parts[2].id}`).click({ modifiers: ['ControlOrMeta'] });
  await expect(page.getByTestId(`body-${parts[2].id}`)).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Keskitä: Osa 6', exact: true }).click();
  await expect
    .poll(
      async () =>
        JSON.parse((await page.getByTestId('viewport').getAttribute('data-camera'))!).target,
    )
    .toEqual([1550, 50, 25]);
  await expect(page.getByTestId(`body-${parts[1].id}`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId(`body-${parts[5].id}`)).toHaveAttribute('aria-pressed', 'false');
});

test('dropping on a part creates a folder; undo and existing parent hierarchy are preserved', async ({
  page,
}) => {
  const parts = [0, 200, 400].map((x, i) => ({
    ...makeBody(100, 100, 40, [x, 0, 0], `Levy ${i + 1}`),
    groupId: i === 2 ? 'doors' : undefined,
  }));
  await ready(page, parts, [], groups);
  await page.getByTestId(`body-${parts[0].id}`).click();
  await page.getByTestId(`body-${parts[1].id}`).click({ modifiers: ['Shift'] });
  await drag(
    page,
    page.getByTestId(`body-${parts[0].id}`),
    page.getByTestId(`body-${parts[2].id}`),
    false,
  );
  await expect(page.getByTestId('tree-drag-preview')).toContainText('Luo ryhmä: Levy 3');
  await page.mouse.up();
  const model = await save(page),
    g = model.groups.find((g) => g.name === 'Levy 3 · ryhmä')!;
  expect(g).toMatchObject({ parentId: 'doors', kind: 'folder' });
  expect(model.bodies.map((b) => b.groupId)).toEqual([g.id, g.id, g.id]);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual(parts);
});

test('move group dialog lists all folders and can move selected parts into a child', async ({
  page,
}) => {
  const parts = [0, 100].map((x) => ({ ...makeBody(50, 50, 50, [x, 0, 0]), groupId: 'cabinet' }));
  await ready(
    page,
    parts,
    [],
    [...groups, { id: 'hidden', name: 'Piilotettu', hidden: true, parentId: 'other' }],
  );
  await groupButton(page, 'Kaappi').click();
  await page.getByRole('button', { name: 'Valinnan toiminnot', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Siirrä ryhmään…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Siirrä ryhmään', exact: true }),
    dest = dialog.getByRole('combobox', { name: 'Kohderyhmä' });
  await expect(dest.locator('option')).toHaveCount(5);
  await expect(dest.locator('option[value="doors"]')).toHaveJSProperty('disabled', true);
  await expect(dest.locator('option[value="hidden"]')).toHaveJSProperty('disabled', false);
  await dialog.getByRole('combobox', { name: 'Siirrettävä kokonaisuus' }).selectOption('bodies');
  await expect(dest.locator('option[value="doors"]')).toHaveJSProperty('disabled', false);
  await dest.selectOption('doors');
  await dialog.getByRole('button', { name: 'Siirrä', exact: true }).click();
  expect((await save(page)).bodies.map((b) => b.groupId)).toEqual(['doors', 'doors']);
});
