import { test, expect } from '@playwright/test';
import { makeBody, makeProfileBody } from '../src/model/project';
import { sketchFrame } from '../src/model/sketch';
import { ready, save, revealBrowser } from './helpers';
const profiles = () => [
  { ...makeBody(2110, 2750, 0), name: 'Lattian ulkoraja' },
  {
    ...makeBody(900, 900, 0),
    name: 'Suihkualue',
    origin: [100, 100, 0] as [number, number, number],
  },
  makeProfileBody({ kind: 'circle', radius: 50 }, sketchFrame([550, 550, 0]), 0, 'Kaivo'),
];
async function open(page: import('@playwright/test').Page, bodies: ReturnType<typeof profiles>) {
  await page.getByRole('button', { name: 'Muodot', exact: true }).click();
  await page.getByRole('button', { name: 'Pinnan korkeudet', exact: true }).click();
  for (const body of bodies)
    await page.getByRole('combobox', { name: 'Lisää korkeusrajaus' }).selectOption(body.id);
  await page.getByRole('textbox', { name: 'Pohjan syvyys' }).fill('60');
  await expect(page.getByRole('button', { name: 'Luo pinta', exact: true })).toBeEnabled();
}
test('sloped floor previews, saves, reopens, edits and undoes as a single part', async ({
  page,
}, info) => {
  const bodies = profiles();
  await ready(page, bodies);
  await open(page, bodies);
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-surface-preview', 'true');
  await expect(page.getByLabel('Pinnan kaltevuudet')).toContainText('laskee sisäänpäin');
  await page.getByRole('button', { name: 'Luo pinta', exact: true }).click();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
  const first = await save(page),
    floor = first.bodies.at(-1)!;
  expect(
    floor.feature.type === 'brep' && floor.feature.surfaceLevels?.boundaries.map((b) => b.height),
  ).toEqual([0, -10, -20]);
  expect(first.bodies.slice(0, 3).every((b) => b.hidden)).toBe(true);
  await page.screenshot({ path: info.outputPath('floor-surface.png') });
  await expect(page.locator('.save-status')).toContainText('Tallessa');
  await page.reload();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
  await revealBrowser(page);
  await page.getByTestId(`body-${floor.id}`).click();
  await page.getByRole('button', { name: 'Muokkaa pinnan korkeuksia', exact: true }).click();
  await page.getByRole('textbox', { name: 'Rajaus 2 korkeus' }).fill('-15 mm');
  await page.getByRole('textbox', { name: 'Rajaus 3 korkeus' }).fill('-25');
  await expect(page.getByRole('button', { name: 'Päivitä pinta', exact: true })).toBeEnabled();
  await page.screenshot({ path: info.outputPath('floor-levels.png') });
  await page.getByRole('button', { name: 'Päivitä pinta', exact: true }).click();
  const edited = await save(page);
  expect(edited.bodies).toHaveLength(4);
  const f = edited.bodies.at(-1)!.feature;
  expect(f.type === 'brep' && f.surfaceLevels?.boundaries.map((b) => b.height)).toEqual([
    0, -15, -25,
  ]);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual(first.bodies);
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  expect((await save(page)).bodies).toEqual(edited.bodies);
});
test('invalid heights clear stale preview; Escape and switching tools preserve sources', async ({
  page,
}) => {
  const bodies = profiles();
  await ready(page, bodies);
  await open(page, bodies);
  await page.getByRole('textbox', { name: 'Pohjan syvyys' }).fill('10');
  await expect(page.getByRole('button', { name: 'Luo pinta', exact: true })).toBeDisabled();
  await expect(page.getByRole('region', { name: 'Pinnan korkeudet' })).toContainText(
    'Pohja on liian lähellä',
  );
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-surface-preview', 'false');
  await page.getByRole('textbox', { name: 'Rajaus 2 korkeus' }).fill('-');
  await expect(page.getByRole('region', { name: 'Pinnan korkeudet' })).toContainText(
    'Anna korkeudet',
  );
  await page.keyboard.press('Escape');
  expect((await save(page)).bodies).toEqual(bodies);
  await open(page, bodies);
  await page.getByRole('button', { name: 'Siirrä', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Pinnan korkeudet' })).toHaveCount(0);
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-surface-preview', 'false');
  expect((await save(page)).bodies).toEqual(bodies);
});
test('selecting boundaries from the model list is direct and cancellation keeps the model', async ({
  page,
}) => {
  const bodies = profiles();
  await ready(page, bodies);
  await page.getByRole('button', { name: 'Muodot', exact: true }).click();
  await page.getByRole('button', { name: 'Pinnan korkeudet', exact: true }).click();
  await revealBrowser(page);
  for (const b of bodies) await page.getByTestId(`body-${b.id}`).click();
  await expect(page.getByRole('button', { name: 'Luo pinta', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Peru · Esc', exact: true }).click();
  expect((await save(page)).bodies).toEqual(bodies);
});
