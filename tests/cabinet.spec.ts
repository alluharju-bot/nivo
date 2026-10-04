import { expect, test } from '@playwright/test';
import { ready, save, revealBrowser } from './helpers';
import { makeBody } from '../src/model/project';

test('cabinet preview creates real panels, named group, parts and a single undo step', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await ready(page);
  await page.getByRole('button', { name: 'Muodot', exact: true }).click();
  await page.getByRole('button', { name: 'Levyrunko', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Levyrunko', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Rungon nimi', { exact: true }).fill('Työhuoneen kaappi');
  await dialog.getByLabel('Rungon korkeus', { exact: true }).fill('2,4 m');
  await dialog.getByLabel('Hyllyjen määrä', { exact: true }).selectOption('3');
  await dialog.getByLabel('Rungon ovet', { exact: true }).selectOption('double');
  await expect(dialog.getByTestId('render-canvas')).toHaveAttribute('data-body-count', '10');
  await dialog.getByLabel('Levyn paksuus', { exact: true }).fill('400');
  await expect(dialog.getByRole('button', { name: 'Luo levyrunko', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('alert')).toContainText('vapaata');
  await dialog.getByLabel('Levyn paksuus', { exact: true }).fill('18');
  await page.screenshot({ path: info.outputPath('cabinet-builder.png') });
  await dialog.getByRole('button', { name: 'Luo levyrunko', exact: true }).click();
  await expect(dialog).toBeHidden();
  const project = await save(page);
  expect(project.groups).toHaveLength(1);
  expect(project.groups[0].name).toBe('Työhuoneen kaappi');
  expect(project.groups[0].kind).toBe('assembly');
  expect(project.bodies).toHaveLength(10);
  expect(
    project.bodies.every((b) => b.groupId === project.groups[0].id && b.purpose === 'component'),
  ).toBe(true);
  expect(project.bodies.find((b) => b.name === 'Vasen sivu')?.feature).toMatchObject({
    width: 18,
    depth: 600,
    height: 2400,
  });
  // A selected group must never offer to replace its first member as if it were the whole cabinet.
  await page.getByRole('button', { name: 'Muodot', exact: true }).click();
  await page.getByRole('button', { name: 'Levyrunko', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: /Korvaa lähtöosa/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Osat', exact: true }).click();
  await expect(page.locator('.parts-table tbody tr')).toHaveCount(10);
  await page.getByRole('banner').getByRole('button', { name: 'Peru', exact: true }).click();
  await expect(page.locator('.parts-table tbody tr')).toHaveCount(0);
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  await expect(page.locator('.parts-table tbody tr')).toHaveCount(10);
  expect(errors).toEqual([]);
});

test('cancel preserves the selected object and explicit replacement is reversible after reload', async ({
  page,
}) => {
  const source = makeBody(700, 500, 2000, [800, 100, 0], 'Alkuperäinen kaappi');
  await ready(page, [source]);
  const open = async () => {
    await revealBrowser(page);
    await page.getByTestId(`body-${source.id}`).click();
    await page.getByRole('button', { name: 'Muodot', exact: true }).click();
    await page.getByRole('button', { name: 'Levyrunko', exact: true }).click();
  };
  await open();
  await expect(page.getByLabel('Rungon leveys', { exact: true })).toHaveValue('700');
  await page.keyboard.press('Escape');
  expect((await save(page)).bodies).toEqual([source]);
  await open();
  await page.getByRole('checkbox', { name: 'Korvaa lähtöosa: Alkuperäinen kaappi' }).check();
  await page.getByRole('button', { name: 'Luo levyrunko', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  const generated = await save(page);
  expect(generated.bodies).toHaveLength(6);
  expect(generated.bodies[0].origin).toEqual(source.origin);
  await expect(page.locator('.save-status')).toContainText('Tallessa selaimessa');
  await page.reload();
  await expect(
    page.getByRole('banner').getByRole('button', { name: 'Peru', exact: true }),
  ).toBeEnabled();
  await page.getByRole('banner').getByRole('button', { name: 'Peru', exact: true }).click();
  await expect(page.getByTestId(`body-${source.id}`)).toBeVisible();
  expect((await save(page)).bodies).toEqual([source]);
});
