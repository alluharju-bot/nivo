import { test, expect } from '@playwright/test';
import { makeBody } from '../src/model/project';
import { ready, view, click, save } from './helpers';

async function reveal(page: import('@playwright/test').Page) {
  const browser = page.getByRole('complementary', { name: 'Mallilista' });
  if ((await browser.getAttribute('data-expanded')) === 'false')
    await page.getByRole('button', { name: 'Näytä mallilista' }).click();
}
test('browser retracts transparently, pins, renames directly and toolbar docks with persistence', async ({
  page,
}) => {
  const part = makeBody(200, 200, 50, [0, 0, 0], 'Ovi');
  await ready(page, [part]);
  await reveal(page);
  const list = page.getByRole('complementary', { name: 'Mallilista' });
  await page.getByTestId(`body-${part.id}`).click();
  await page.getByRole('button', { name: 'Nimeä: Ovi', exact: true }).click();
  await page.getByRole('textbox', { name: 'Kappaleen nimi', exact: true }).fill('Uusi ovi');
  await page.getByRole('textbox', { name: 'Kappaleen nimi', exact: true }).press('Enter');
  await expect(page.getByRole('button', { name: 'Nimeä: Uusi ovi', exact: true })).toBeVisible();
  await page.getByTestId('viewport').click({ position: { x: 650, y: 400 } });
  await expect(list).toHaveAttribute('data-expanded', 'false');
  await expect(list).toHaveCSS('backdrop-filter', 'none');
  await reveal(page);
  await page.getByRole('button', { name: 'Pidä mallilista näkyvissä' }).click();
  await page.getByTestId('viewport').click({ position: { x: 650, y: 400 } });
  await expect(list).toHaveAttribute('data-expanded', 'true');
  await page.getByRole('button', { name: 'Siirrä työkalupalkkia' }).click();
  await page.getByRole('button', { name: 'Ala', exact: true }).click();
  await expect(page.locator('.workspace')).toHaveAttribute('data-dock', 'bottom');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Valitse', exact: true })).toBeEnabled();
  await expect(page.locator('.workspace')).toHaveAttribute('data-dock', 'bottom');
  await expect(list).toHaveAttribute('data-expanded', 'true');
  const grip = (await page.getByRole('button', { name: 'Siirrä työkalupalkkia' }).boundingBox())!,
    workspace = (await page.locator('.workspace').boundingBox())!;
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(workspace.x + workspace.width - 10, workspace.y + workspace.height / 2, {
    steps: 10,
  });
  await expect(page.locator('.dock-drop')).toHaveAttribute('data-side', 'right');
  await page.mouse.up();
  await expect(page.locator('.workspace')).toHaveAttribute('data-dock', 'right');
});

test('assemblies select, open and close as a unit; X deletes all and one undo restores', async ({
  page,
}) => {
  const parts = [makeBody(200, 200, 50), makeBody(200, 200, 50, [300, 0, 0])];
  await ready(page, parts);
  await reveal(page);
  await page.getByTestId(`body-${parts[0].id}`).click();
  await page.getByTestId(`body-${parts[1].id}`).click({ modifiers: ['Shift'] });
  await page.getByRole('button', { name: 'Luo kokoonpano', exact: true }).click();
  let saved = await save(page);
  expect(saved.groups[0].kind).toBe('assembly');
  const point = await view(page, parts);
  await click(page, point(450, 250, 50));
  await click(page, point(400, 100, 50));
  await expect(page.locator('.object-select[aria-pressed="true"]')).toHaveCount(2);
  await page.mouse.dblclick(point(400, 100, 50).x, point(400, 100, 50).y);
  await expect(page.getByTestId('assembly-context')).toBeVisible();
  await click(page, point(400, 100, 50));
  await expect(page.locator('.object-select[aria-pressed="true"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Sulje kokoonpano' }).click();
  await click(page, point(400, 100, 50));
  await page.keyboard.press('x');
  await expect(page.locator('.object-select')).toHaveCount(0);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  saved = await save(page);
  expect(saved.bodies).toHaveLength(2);
  expect(saved.groups[0].kind).toBe('assembly');
});

test('linked painting respects shared and instance material, and make unique severs updates', async ({
  page,
}) => {
  const a = makeBody(200, 200, 50, [0, 0, 0], 'Ovi'),
    b = makeBody(200, 200, 50, [350, 0, 0], 'Ovi 2');
  await ready(page, [a, b]);
  await reveal(page);
  await page.getByTestId(`body-${a.id}`).click();
  await page.getByTestId(`body-${b.id}`).click({ modifiers: ['Shift'] });
  await page.getByText('Komponentti ja linkitys', { exact: true }).click();
  await page.getByRole('button', { name: 'Linkitä valitut tähän osaan' }).click();
  let saved = await save(page);
  expect(saved.bodies[0].component?.id).toBeTruthy();
  expect(saved.bodies[0].component?.id).toBe(saved.bodies[1].component?.id);
  const point = await view(page, [a, b]);
  await click(page, point(450, 260, 50));
  await page.getByRole('button', { name: 'Maalipensseli', exact: true }).click();
  await page.getByLabel('Pensselin väri', { exact: true }).fill('#123456');
  await click(page, point(450, 100, 50));
  saved = await save(page);
  expect(saved.bodies.map((b) => b.color)).toEqual(['#123456', '#123456']);
  await page.getByLabel('Pensselin linkitetyt osat').selectOption('local');
  await page.getByLabel('Pensselin väri', { exact: true }).fill('#abcdef');
  await click(page, point(450, 100, 50));
  saved = await save(page);
  expect(saved.bodies.map((b) => b.color)).toEqual(['#123456', '#abcdef']);
  await page.keyboard.press('Escape');
  await click(page, point(450, 100, 50));
  await page.getByText('Komponentti ja linkitys', { exact: true }).click();
  await page
    .getByRole('checkbox', { name: 'Esiintymäkohtainen materiaali', exact: true })
    .uncheck();
  saved = await save(page);
  expect(saved.bodies.map((b) => b.color)).toEqual(['#123456', '#123456']);
  await page.getByRole('button', { name: 'Tee uniikiksi', exact: true }).click();
  saved = await save(page);
  expect(saved.bodies[1].component).toBeUndefined();
});

test('right click opens actions, right drag orbits and move shows the axis at the part', async ({
  page,
}) => {
  const part = makeBody(200, 200, 50);
  await ready(page, [part]);
  const point = await view(page, [part]),
    at = point(120, 100, 50);
  await page.mouse.click(at.x, at.y, { button: 'right' });
  await expect(page.getByRole('menu', { name: 'Valinnan toiminnot' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Siirrä · M' }).click();
  await page.keyboard.press('x');
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x + 100, at.y, { steps: 5 });
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-visible-move-axis', 'x');
  await expect(page.locator('.move-axis-label')).toContainText('X lukittu');
  await page.mouse.up();
  await page.keyboard.press('Escape');
  await page.mouse.move(at.x, at.y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(at.x + 80, at.y + 60, { steps: 8 });
  await page.mouse.up({ button: 'right' });
  await expect(page.getByRole('menu')).toHaveCount(0);
});

test('an ordinary part copy becomes linked by default through push/pull, undo and reload', async ({
  page,
}) => {
  const part = makeBody(200, 200, 50);
  await ready(page, [part]);
  await reveal(page);
  await page.getByTestId(`body-${part.id}`).click();
  await page.getByRole('button', { name: 'Kopioi kappale', exact: true }).click();
  await page.getByTestId('move-x').fill('350');
  await page.getByTestId('move-x').press('Enter');
  await expect(page.locator('.object-select')).toHaveCount(2);
  let saved = await save(page);
  expect(saved.bodies[0].component?.id).toBe(saved.bodies[1].component?.id);
  await page.keyboard.press('Escape');
  const point = await view(page, saved.bodies),
    at = point(450, 100, 50);
  await page.mouse.move(at.x, at.y);
  await page.keyboard.press('e');
  await page.getByTestId('height-input').fill('25');
  await page.getByTestId('height-input').press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  saved = await save(page);
  expect(saved.bodies.map((b) => b.feature.height)).toEqual([75, 75]);
  expect(saved.bodies[0].origin).toEqual([0, 0, 0]);
  expect(saved.bodies[1].origin).toEqual([350, 0, 0]);
  const changed = structuredClone(saved);
  await page.reload();
  await expect(page.locator('.object-select')).toHaveCount(2);
  saved = await save(page);
  expect(saved.bodies[0].component?.id).toBe(saved.bodies[1].component?.id);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  saved = await save(page);
  expect(saved.bodies.map((b) => b.feature.height)).toEqual([50, 50]);
  await page.getByTestId('project-file').setInputFiles({
    name: 'same-project.nivo',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(changed)),
  });
  await expect(page.locator('.busy-badge')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect((await save(page)).bodies.map((b) => b.feature.height)).toEqual([75, 75]);
});

test('an assembly copies its nested hierarchy, moves all members and honours group Hold and visibility', async ({
  page,
}) => {
  const groups = [
    { id: 'assembly', name: 'Kaappi', kind: 'assembly' as const, hidden: false },
    { id: 'folder', name: 'Laudat', parentId: 'assembly', hidden: false },
  ];
  const parts = Array.from({ length: 15 }, (_, i) => ({
    ...makeBody(40, 100, 600, [i * 60, 0, 0], `Lauta ${i}`),
    groupId: i < 2 ? 'assembly' : 'folder',
    purpose: 'component' as const,
  }));
  await ready(page, parts, [], groups);
  await page.getByRole('button', { name: 'Valitse ryhmä: Kaappi', exact: true }).click();
  await page.getByRole('button', { name: 'Nimeä: Kaappi', exact: true }).click();
  await page.getByRole('textbox', { name: 'Ryhmän nimi', exact: true }).fill('Runko');
  await page.getByRole('textbox', { name: 'Ryhmän nimi', exact: true }).press('Enter');
  await page.getByRole('button', { name: 'Kopioi valinta', exact: true }).click();
  await page.getByTestId('move-x').fill('1200');
  await page.getByTestId('move-x').press('Enter');
  await expect(page.locator('.object-select')).toHaveCount(30);
  let saved = await save(page);
  expect(saved.groups).toHaveLength(4);
  const group = saved.groups.find((g) => g.name === 'Runko kopio')!;
  expect(group.kind).toBe('assembly');
  expect(saved.bodies.slice(15).map((b) => b.origin[0])).toEqual(
    parts.map((b) => b.origin[0] + 1200),
  );
  saved.bodies
    .slice(15)
    .forEach((b, i) => expect(b.component?.id).toBe(saved.bodies[i].component?.id));
  await page.keyboard.press('Escape');
  await reveal(page);
  await page.getByRole('button', { name: 'Valitse ryhmä: Runko kopio', exact: true }).click();
  await page.getByRole('button', { name: 'Kiinnitä · G', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Vapauta Hold', exact: true })).toBeEnabled();
  await page.keyboard.press('x');
  await expect(page.getByRole('alert')).toContainText('Hold');
  expect((await save(page)).bodies).toHaveLength(30);
  await page.getByRole('button', { name: 'Vapauta Hold', exact: true }).click();
  await page.getByRole('button', { name: 'Piilota', exact: true }).click();
  saved = await save(page);
  expect(saved.groups.find((g) => g.id === group.id)?.hidden).toBe(true);
  await page.getByRole('button', { name: 'Näytä', exact: true }).click();
  await page.getByRole('button', { name: 'Siirrä valinta', exact: true }).click();
  await page.getByTestId('move-y').fill('250');
  await page.getByTestId('move-y').press('Enter');
  saved = await save(page);
  expect(saved.bodies.slice(15).every((b) => b.origin[1] === 250)).toBe(true);
  expect(saved.bodies.slice(0, 15).every((b) => b.origin[1] === 0)).toBe(true);
});
