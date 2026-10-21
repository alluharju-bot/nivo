import { test, expect } from '@playwright/test';
import { ready, save, view } from './helpers';
import { makeBody } from '../src/model/project';

test('fracture preview, gravity, cancel, commit and undo preserve the original', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const source = { ...makeBody(1000, 200, 2000), name: 'Rikottava seinä' };
  await ready(page, [source]);
  const at = await view(page, [source], 'front');
  const point = at(500, 0, 1000);
  await page.mouse.click(point.x, point.y);
  await page.getByRole('button', { name: 'Riko ja pudota…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Riko ja pudota', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Palojen määrä', { exact: true }).fill('8');
  await dialog.getByRole('button', { name: 'Muodosta palat', exact: true }).click();
  await expect(dialog.getByText('8 irtopalaa', { exact: true })).toBeVisible({ timeout: 45000 });
  await dialog.getByRole('button', { name: 'Pudota', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Tauko', exact: true })).toBeEnabled({
    timeout: 30000,
  });
  await dialog.getByRole('button', { name: 'Tauko', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Hyväksy nykyinen asento' })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Palauta', exact: true }).click();
  await expect(dialog.getByText('8 irtopalaa', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Peru', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect((await save(page)).bodies).toEqual([source]);
  await page.getByRole('button', { name: 'Riko ja pudota…', exact: true }).click();
  await dialog.getByRole('button', { name: 'Pääty', exact: true }).click();
  await dialog.getByLabel('Rikkomisen syvyys', { exact: true }).fill('300');
  await dialog.getByLabel('Palojen määrä', { exact: true }).fill('8');
  await dialog.getByRole('button', { name: 'Muodosta palat', exact: true }).click();
  await expect(dialog.getByText('8 irtopalaa', { exact: true })).toBeVisible({ timeout: 45000 });
  await page.screenshot({ path: '/private/tmp/nivo-fracture-preview.png' });
  await dialog.getByRole('button', { name: 'Hyväksy nykyinen asento' }).click();
  await expect(dialog).not.toBeVisible();
  const committed = await save(page);
  expect(committed.bodies).toHaveLength(10);
  expect(committed.bodies.find((b) => b.id === source.id)).toEqual({ ...source, hidden: true });
  expect(
    committed.bodies
      .filter((b) => b.id !== source.id)
      .every((b) => b.feature.type === 'mesh' && b.feature.solid),
  ).toBe(true);
  expect(committed.groups.some((g) => g.name.includes('rikottu'))).toBe(true);
  await page.getByRole('banner').getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual([source]);
  await page.getByRole('banner').getByRole('button', { name: 'Palauta', exact: true }).click();
  expect((await save(page)).bodies).toEqual(committed.bodies);
  expect(errors).toEqual([]);
});

test('fallen rubble is saved at the preview poses and opens as ordinary mesh parts', async ({
  page,
}) => {
  const source = {
    ...makeBody(600, 200, 1000),
    origin: [0, 0, 1500] as [number, number, number],
    name: 'Pudotettava seinä',
  };
  await ready(page, [source]);
  const at = await view(page, [source], 'front'),
    point = at(300, 0, 2000);
  await page.mouse.click(point.x, point.y);
  await page.getByRole('button', { name: 'Riko ja pudota…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Riko ja pudota', exact: true });
  await dialog.getByLabel('Palojen määrä', { exact: true }).fill('8');
  await dialog.getByRole('button', { name: 'Muodosta palat', exact: true }).click();
  await expect(dialog.getByText('8 irtopalaa', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Pudota', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Tauko', exact: true })).toBeEnabled();
  // Let real gravity settle the suspended pieces; no geometry or poses are injected.
  await page.waitForTimeout(2600);
  const pause = dialog.getByRole('button', { name: 'Tauko', exact: true });
  if (await pause.isVisible()) await pause.click();
  await dialog.getByRole('button', { name: 'Sovita palat näkymään', exact: true }).click();
  await page.screenshot({ path: `/private/tmp/nivo-rubble-${test.info().project.name}.png` });
  await dialog.getByRole('button', { name: 'Hyväksy nykyinen asento' }).click();
  await expect(dialog).not.toBeVisible();
  const saved = await save(page),
    fragments = saved.bodies.filter((b) => b.id !== source.id);
  expect(fragments).toHaveLength(8);
  expect(fragments.every((b) => b.origin[2] < source.origin[2] - 500)).toBe(true);
  expect(fragments.every((b) => b.origin[2] > -30)).toBe(true);
  await page.getByTestId('project-file').setInputFiles({
    name: 'rubble.nivo',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(saved)),
  });
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '8');
  expect((await save(page)).bodies).toEqual(saved.bodies);
});
