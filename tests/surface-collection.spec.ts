import { expect, test } from '@playwright/test';
import { ready, save } from './helpers';
import { makeBody } from '../src/model/project';
import { defaultAppearance } from '../src/model/materials';
import { collectionPaints, surfaceCollectionName } from '../src/model/surfaceCollection';

test('surface collection filters woods, upholstery and paints, applies a finish and saves it', async ({
  page,
}, info) => {
  const body = {
    ...makeBody(600, 400, 20),
    color: '#ffffff',
    appearance: defaultAppearance('pbr-ash_veneer'),
  };
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => {
    if (r.url().includes('/materials/') && r.status() >= 400)
      errors.push(`${r.status()} ${r.url()}`);
  });
  await ready(page, [body]);
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  await expect(page.getByLabel('Materiaaliryhmä', { exact: true })).toHaveValue(
    surfaceCollectionName,
  );
  const group = page.getByLabel('Pintakokoelman pinnat', { exact: true });
  await expect(group).toHaveValue('Puut');
  const swatches = page.locator('.material-swatches');
  await expect(swatches.getByRole('button')).toHaveCount(12);
  await swatches.getByRole('button', { name: 'Valkotammi · viilu', exact: true }).click();
  expect((await save(page)).bodies[0].appearance?.texture.width).toBe(500);
  await group.selectOption('Tekstiilit ja nahka');
  await expect(swatches.getByRole('button')).toHaveCount(3);
  await swatches.getByRole('button', { name: 'Pellava · siniharmaa', exact: true }).click();
  expect((await save(page)).bodies[0].appearance?.preset).toBe('pbr-rough_linen');
  await group.selectOption('Maalit');
  await expect(swatches.getByRole('button')).toHaveCount(collectionPaints.length);
  await swatches.getByRole('button', { name: 'Maali · salvia', exact: true }).click();
  const painted = (await save(page)).bodies[0];
  expect(painted.color).toBe('#9ca58f');
  expect(painted.appearance?.preset).toBe('collection-paint-sage');
  await page.getByLabel('Pintakäsittely', { exact: true }).selectOption('satin');
  await page.screenshot({ path: info.outputPath('surface-collection-paints.png') });
  await page.getByLabel('Etsi materiaalia', { exact: true }).fill('saarni');
  await expect(swatches.getByRole('button')).toHaveCount(1);
  await swatches.getByRole('button', { name: 'Saarni · viilu', exact: true }).click();
  expect((await save(page)).bodies[0].appearance?.preset).toBe('pbr-ash_veneer');
  await page.getByLabel('Etsi materiaalia', { exact: true }).fill('');
  await expect(group).toHaveValue('Puut');
  await expect(swatches.getByRole('button')).toHaveCount(12);
  await page.screenshot({ path: info.outputPath('surface-collection-woods.png') });
  expect(errors).toEqual([]);
});
