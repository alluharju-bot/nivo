import { test, expect } from '@playwright/test';
import { makeBody, makeProfileBody } from '../src/model/project';
import { sketchFrame } from '../src/model/sketch';
import { ready, view, click, save, revealBrowser } from './helpers';

test('opening targets toggle in the viewport, depth controls the red cutter and undo preserves excluded parts', async ({
  page,
}, info) => {
  const front = makeBody(200, 180, 20, [0, 0, 0], 'Etulevy');
  const back = makeBody(300, 180, 20, [0, 0, -80], 'Takalevy');
  const profile = makeProfileBody(
    { kind: 'circle', radius: 20 },
    sketchFrame([100, 90, 20]),
    0,
    'Aukko',
  );
  const parts = [front, back, profile];
  await ready(page, parts);
  const at = await view(page, parts);
  await revealBrowser(page);
  await page.getByTestId(`body-${profile.id}`).click();
  await page.getByRole('button', { name: 'Piilota mallilista' }).press('Enter');
  await page.getByRole('button', { name: 'Leikkaa aukko…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Leikkaa aukko', exact: true });
  const canvas = page.getByTestId('viewport');
  await expect(dialog).toHaveAttribute('aria-modal', 'false');
  await expect(canvas).toHaveAttribute('data-opening-cutters', '1');
  await expect(
    dialog.getByRole('textbox', { name: 'Leikkaussyvyys · mm', exact: true }),
  ).toHaveValue('');
  const frontCheck = dialog.getByRole('checkbox', { name: 'Etulevy', exact: true });
  const backCheck = dialog.getByRole('checkbox', { name: 'Takalevy', exact: true });
  await expect(frontCheck).toBeChecked();
  await expect(backCheck).toBeChecked();
  await click(page, at(250, 110, -60));
  await expect(backCheck).not.toBeChecked();
  await expect(canvas).toHaveAttribute('data-opening-targets', JSON.stringify([front.id]));
  await click(page, at(250, 110, -60));
  await expect(backCheck).toBeChecked();
  // Even the red opening surface hits the original part, not a component behind it.
  await click(page, at(100, 90, 20));
  await expect(frontCheck).not.toBeChecked();
  await click(page, at(100, 90, 20));
  await expect(frontCheck).toBeChecked();
  const depth = dialog.getByRole('textbox', { name: 'Leikkaussyvyys · mm', exact: true });
  await depth.fill('10');
  await expect(backCheck).toHaveCount(0);
  await expect(canvas).toHaveAttribute('data-opening-targets', JSON.stringify([front.id]));
  await page.getByRole('button', { name: 'Yleisnäkymä', exact: true }).click();
  await page.screenshot({ path: info.outputPath('opening-depth-blue-target-red-tool.png') });
  await depth.fill('');
  await expect(backCheck).toBeChecked();
  await backCheck.uncheck();
  await dialog.getByRole('button', { name: 'Leikkaa läpi · 1 osaa', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const result = await save(page);
  expect(result.bodies).toHaveLength(2);
  expect(result.bodies[1]).toEqual(back);
  expect(result.bodies[0].feature.type).toBe('brep');
  await expect(canvas).toHaveAttribute('data-opening-cutters', '0');
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual(parts);
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  expect((await save(page)).bodies).toEqual(result.bodies);
});

test('a completely covered part remains pickable in the opening preview; Escape preserves the project', async ({
  page,
}) => {
  const part = makeBody(100, 100, 20, [0, 0, 0], 'Pieni levy');
  const profile = makeBody(120, 120, 0, [-10, -10, 20], 'Suuri aukko');
  await ready(page, [part, profile]);
  const at = await view(page, [part, profile]);
  await revealBrowser(page);
  await page.getByTestId(`body-${profile.id}`).click();
  await page.getByRole('button', { name: 'Piilota mallilista' }).press('Enter');
  await page.getByRole('button', { name: 'Leikkaa aukko…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Leikkaa aukko', exact: true });
  const selected = dialog.getByRole('checkbox', { name: 'Pieni levy', exact: true });
  await expect(selected).toBeChecked();
  await click(page, at(50, 50, 20));
  await expect(selected).not.toBeChecked();
  await expect(
    dialog.getByRole('button', { name: 'Leikkaa läpi · 0 osaa', exact: true }),
  ).toBeDisabled();
  await click(page, at(50, 50, 20));
  await expect(selected).toBeChecked();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect((await save(page)).bodies).toEqual([part, profile]);
});
