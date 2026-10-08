import { expect, test } from '@playwright/test';
import { makeBody } from '../src/model/project';
import { materialPresets, defaultAppearance } from '../src/model/materials';
import { ready, save } from './helpers';

test('metal collection renders, refines, changes finish and saves the patina', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop');
  test.setTimeout(150000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  const metals = materialPresets.filter((p) => p.category === 'Metallit');
  const bodies = metals.map((p, i) => ({
    ...makeBody(160, 160, 60, [(i % 4) * 200, Math.floor(i / 4) * 200, 0], p.name),
    color: p.color,
    appearance: defaultAppearance(p.id),
  }));
  await ready(page, bodies);
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  await page.getByLabel('Materiaaliryhmä', { exact: true }).selectOption('Metallit');
  await expect(page.locator('.material-swatches').getByRole('button')).toHaveCount(13);
  await page.getByRole('button', { name: 'Kuva', exact: true }).click();
  await page.getByRole('button', { name: 'Tarkentuva', exact: true }).click();
  await page.getByLabel('Tarkennuksen tavoite', { exact: true }).selectOption('8');
  await expect(page.getByTestId('trace-status')).toContainText('Tavoite saavutettu', {
    timeout: 120000,
  });
  await page.screenshot({ path: info.outputPath('metals-refined.png') });
  await page.getByRole('button', { name: 'Materiaali', exact: true }).click();
  await page
    .locator('.material-swatches')
    .getByRole('button', { name: 'Hapettunut kupari', exact: true })
    .click();
  await page.getByLabel('Pintakäsittely', { exact: true }).selectOption('matte');
  const saved = await save(page);
  expect(
    saved.bodies.every(
      (b) => b.appearance?.preset === 'copper-patina' && b.appearance.roughness === 1,
    ),
  ).toBe(true);
  await expect(page.getByTestId('trace-status')).toContainText('Tavoite saavutettu', {
    timeout: 120000,
  });
  expect(errors).toEqual([]);
});
