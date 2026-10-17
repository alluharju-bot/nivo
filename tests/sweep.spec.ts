import { test, expect, type Page } from '@playwright/test';
import { makeBody } from '../src/model/project';
import { ready, view, save, click } from './helpers';
async function tool(page: Page, name: string) {
  await page.getByRole('button', { name: 'Muodot', exact: true }).click();
  await page
    .getByRole('group', { name: 'Valitse muoto', exact: true })
    .getByRole('button', { name, exact: true })
    .click();
}
test('Bézier to hollow pipe: live preview, cancellation, independent source and undo/redo', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const floor = makeBody(600, 400, 0, [0, 0, 0], 'Alusta');
  await ready(page, [floor]);
  const p = await view(page, [floor]);
  await tool(page, 'Bézier-käyrä');
  await click(page, p(100, 100));
  await click(page, p(300, 100));
  await click(page, p(450, 250));
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '2');
  const before = await save(page),
    curve = before.bodies[1];
  await tool(page, 'Polkua pitkin');
  const panel = page.getByRole('region', { name: 'Polkua pitkin', exact: true });
  await panel.getByLabel('Pursotuksen polku').selectOption(curve.id);
  await panel.getByLabel('Halkaisija · mm').fill('24');
  await panel.getByLabel('Halkaisija · mm').press('Tab');
  await panel.getByLabel('Seinämä · mm').fill('2');
  await panel.getByLabel('Seinämä · mm').press('Tab');
  await expect(panel.getByRole('button', { name: 'Luo kappale', exact: true })).toBeEnabled();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-surface-preview', 'true');
  await page.screenshot({ path: info.outputPath('pipe-preview.png') });
  await panel.getByRole('button', { name: 'Luo kappale', exact: true }).click();
  const done = await save(page);
  expect(done.bodies).toHaveLength(3);
  expect(done.bodies[1]).toEqual({ ...curve, hidden: true });
  expect(done.bodies[2].feature.type).toBe('brep');
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual(before.bodies);
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  expect((await save(page)).bodies).toEqual(done.bodies);
  await tool(page, 'Polkua pitkin');
  await panel.getByLabel('Pursotuksen polku').selectOption(curve.id);
  await panel.getByLabel('Polun poikkileikkaus').selectOption('rectangle');
  await panel.getByLabel('Seinämä · mm').fill('100');
  await panel.getByLabel('Seinämä · mm').press('Tab');
  await expect(panel.getByRole('status')).toContainText('Seinämän');
  await expect(panel.getByRole('button', { name: 'Luo kappale', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  expect((await save(page)).bodies).toEqual(done.bodies);
  await page.reload();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '2');
  expect((await save(page)).bodies).toEqual(done.bodies);
  expect(errors).toEqual([]);
});
test('ordinary circle and sphere tools retain the requested finite side count', async ({
  page,
}) => {
  const floor = makeBody(600, 400, 0);
  await ready(page, [floor]);
  const p = await view(page, [floor]);
  await tool(page, 'Ympyrä');
  await page.getByLabel('Pyöreän muodon toteutus').selectOption('faceted');
  await page.getByLabel('Pyöreän muodon sivujen määrä').fill('8');
  await click(page, p(150, 200));
  await page.mouse.move(p(200, 200).x, p(200, 200).y);
  await page.keyboard.type('100');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '2');
  const first = (await save(page)).bodies[1];
  expect(
    first.feature.type === 'profile-extrusion' &&
      first.feature.profile.kind === 'polygon' &&
      first.feature.profile.points.length,
  ).toBe(8);
  await tool(page, 'Pallo');
  await page.getByLabel('Pyöreän muodon sivujen määrä').fill('12');
  await click(page, p(400, 200));
  await page.mouse.move(p(450, 200).x, p(450, 200).y);
  await page.keyboard.type('100');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '3');
  const sphere = (await save(page)).bodies[2];
  expect(sphere.feature.type === 'mesh' && sphere.feature.triangles.length / 3).toBe(120);
  await tool(page, 'Ympyrä');
  await page.getByLabel('Pyöreän muodon toteutus').selectOption('exact');
  await click(page, p(300, 320));
  await page.mouse.move(p(325, 320).x, p(325, 320).y);
  await page.keyboard.type('50');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '4');
  const exact = (await save(page)).bodies[3];
  expect(exact.feature.type === 'profile-extrusion' && exact.feature.profile.kind).toBe('circle');
});
