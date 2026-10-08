import { expect, test } from '@playwright/test';
import { makeBody } from '../src/model/project';
import { defaultAppearance } from '../src/model/materials';
import { click, ready, save, view } from './helpers';

for (const [preset, rotations] of [
  ['pbr-ash_veneer', [0, 90]],
  ['pbr-white_oak_veneer', [90, 0]],
] as const) {
  test(`painting ${preset} aligns X and Y panels and preserves a later colour change`, async ({
    page,
  }, info) => {
    const bodies = [makeBody(1000, 180, 18), makeBody(180, 1000, 18, [1100, 0, 0])];
    await ready(page, bodies);
    const point = await view(page, bodies);
    await page.keyboard.press('p');
    await page.getByLabel('Pensselin materiaali', { exact: true }).selectOption(preset);
    await click(page, point(500, 90, 18));
    await click(page, point(1190, 500, 18));
    expect((await save(page)).bodies.map((b) => b.appearance?.texture.rotation)).toEqual(rotations);
    await page.getByLabel('Pensselin väri', { exact: true }).fill('#bb9977');
    await click(page, point(1190, 500, 18));
    expect((await save(page)).bodies.map((b) => b.appearance?.texture.rotation)).toEqual(rotations);
    await page.mouse.move(10, 10);
    await page.screenshot({ path: info.outputPath('grain-directions.png') });
  });
}

test('existing crosswise grain can be aligned without random offsets and undone', async ({
  page,
}) => {
  const appearance = defaultAppearance('pbr-ash_veneer');
  appearance.texture.offsetX = 37;
  const body = { ...makeBody(180, 1000, 18), color: '#ffffff', appearance };
  await ready(page, [body]);
  const point = await view(page, [body]);
  await click(page, point(90, 500, 18));
  await page.keyboard.press('p');
  await page.getByRole('button', { name: 'Tekstuurin asettelu', exact: true }).click();
  await page.getByRole('button', { name: 'Suuntaa puunsyyt pituussuuntaan', exact: true }).click();
  expect((await save(page)).bodies[0].appearance?.texture).toMatchObject({
    rotation: 90,
    offsetX: 37,
  });
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies[0].appearance?.texture).toMatchObject({
    rotation: 0,
    offsetX: 37,
  });
});

test('the render material picker orients each selected panel independently', async ({ page }) => {
  await ready(page, [makeBody(1000, 180, 18), makeBody(180, 1000, 18, [1100, 0, 0])]);
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  await page
    .locator('.material-swatches')
    .getByRole('button', { name: 'Saarni · viilu', exact: true })
    .click();
  expect((await save(page)).bodies.map((b) => b.appearance?.texture.rotation)).toEqual([0, 90]);
});
