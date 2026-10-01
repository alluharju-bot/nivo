import { test, expect } from '@playwright/test';
import { makeBody, type BodyGroup } from '../src/model/project';
import { ready, save, view } from './helpers';
import { groupBodies } from '../src/model/groups';

const groups: BodyGroup[] = [
  { id: 'root', name: 'Runko', hidden: false },
  { id: 'child', name: 'Pystyt', parentId: 'root', hidden: false },
];

test('fifteen-part nested group copies and moves as one adjustable selection', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const parts = Array.from({ length: 15 }, (_, i) => ({
    ...makeBody(40, 100, 600, [i * 60, 0, 0], `Puu ${i + 1}`),
    groupId: i < 5 ? 'root' : 'child',
  }));
  const extra = makeBody(50, 50, 50, [1100, 0, 0], 'Lisäosa');
  await ready(page, [...parts, extra], [], groups);
  await page.getByRole('button', { name: 'Valitse ryhmä: Runko', exact: true }).click();
  const actions = page.getByRole('region', { name: 'Ryhmän toiminnot' });
  await expect(actions).toContainText('15 osaa valittu');
  // Plain clicks remove or add parts while refining the group selection.
  await page.getByTestId(`body-${parts[14].id}`).click();
  await expect(actions).toContainText('14 osaa valittu');
  await page.getByTestId(`body-${extra.id}`).click();
  await expect(actions).toContainText('15 osaa valittu');
  await actions.getByRole('button', { name: 'Sovita valinta', exact: true }).click();
  await page.screenshot({ path: info.outputPath('group-selection.png') });
  await actions.getByRole('button', { name: 'Kopioi valinta', exact: true }).click();
  await page.getByTestId('move-x').fill('1200');
  await page.getByTestId('move-x').press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  let result = await save(page);
  expect(result.bodies).toHaveLength(31);
  expect(result.bodies.slice(0, 16)).toEqual([...parts, extra]);
  const copyGroup = result.groups.find((g) => g.name === 'Runko kopio')!;
  expect(groupBodies(result, copyGroup.id)).toHaveLength(14);
  const copied = result.bodies.slice(16);
  copied.forEach((b, i) => expect(b.origin[0]).toBe((i < 14 ? parts[i] : extra).origin[0] + 1200));
  // The same M tool moves the entire copied selection, including the extra part.
  await page.keyboard.press('m');
  await page.getByTestId('move-y').fill('250');
  await page.getByTestId('move-y').press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  result = await save(page);
  result.bodies.slice(16).forEach((b) => expect(b.origin[1]).toBe(250));
  expect(result.bodies.slice(0, 16)).toEqual([...parts, extra]);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies.slice(16)).toEqual(copied);
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  await expect(page.locator('.save-status')).toContainText('Tallessa selaimessa');
  await page.reload();
  await expect(page.locator('.busy-badge')).toHaveCount(0);
  const restored = await save(page);
  expect(restored.bodies).toEqual(result.bodies);
  expect(restored.groups).toEqual(result.groups);
});

test('nested group rename, reparent, inherited visibility and Hold survive file reload', async ({
  page,
}) => {
  const part = { ...makeBody(400, 300, 40, [0, 0, 0], 'Levy'), groupId: 'child' };
  const other = { id: 'other', name: 'Kaluste', hidden: false };
  await ready(page, [part], [], [...groups, other]);
  const p = await view(page, [part]);
  await page.getByRole('textbox', { name: 'Ryhmän nimi: Pystyt', exact: true }).fill('Rimat');
  await page.getByRole('textbox', { name: 'Ryhmän nimi: Pystyt', exact: true }).press('Enter');
  await page.getByRole('combobox', { name: 'Ryhmän yläryhmä', exact: true }).selectOption('other');
  await expect(page.getByTestId('group-other').getByTestId('group-child')).toBeVisible();
  await page.getByRole('button', { name: 'Kiinnitä ryhmä: Kaluste', exact: true }).click();
  const center = p(200, 150, 40);
  await page.mouse.move(center.x, center.y);
  await page.keyboard.press('e');
  await page.mouse.click(center.x, center.y);
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-hover-face', '');
  expect((await save(page)).bodies).toEqual([part]);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Valitse ryhmä: Rimat', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Siirrä valinta', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Piilota ryhmä: Kaluste', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Näytä ryhmä: Kaluste', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.save-status')).toContainText('Tallessa selaimessa');
  await page.reload();
  await expect(page.locator('.busy-badge')).toHaveCount(0);
  const result = await save(page);
  expect(result.groups.find((g) => g.id === 'child')).toMatchObject({
    name: 'Rimat',
    parentId: 'other',
  });
  expect(result.groups.find((g) => g.id === 'other')).toMatchObject({ locked: true, hidden: true });
  await page.getByRole('button', { name: 'Näytä ryhmä: Kaluste', exact: true }).click();
  await page.getByRole('button', { name: 'Vapauta ryhmä: Kaluste', exact: true }).click();
  await page.getByRole('button', { name: 'Valitse ryhmä: Rimat', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Siirrä valinta', exact: true })).toBeEnabled();
});

test('Ctrl-drag copies every selected group member from the grabbed point', async ({ page }) => {
  const parts = [0, 200].map((x) => ({ ...makeBody(60, 100, 20, [x, 0, 0]), groupId: 'root' }));
  await ready(page, parts, [], [groups[0]]);
  const p = await view(page, parts);
  await page.getByRole('button', { name: 'Valitse ryhmä: Runko', exact: true }).click();
  await page.keyboard.press('m');
  const start = p(30, 40, 20),
    end = p(110, 40, 20);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 5 });
  await page.keyboard.down('Control');
  await page.mouse.up();
  await page.keyboard.up('Control');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  const result = await save(page);
  expect(result.bodies).toHaveLength(4);
  expect(result.bodies.slice(0, 2)).toEqual(parts);
  expect(result.bodies[2].origin).toEqual([80, 0, 0]);
  expect(result.bodies[3].origin).toEqual([280, 0, 0]);
  expect(result.groups).toHaveLength(2);
  expect(groupBodies(result, result.groups[1].id)).toHaveLength(2);
});
