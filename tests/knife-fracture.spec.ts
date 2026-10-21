import { test, expect } from '@playwright/test';
import { ready, save, view, click } from './helpers';
import { makeBody } from '../src/model/project';

test('knife silhouette selects one piece, throws it, bakes the rubble and undoes without changing the wall', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const wall = { ...makeBody(1000, 150, 2000), name: 'Seinä' };
  // Visible cellar floor ensures the workflow does not inject an invisible floor at Z=0.
  const floor = { ...makeBody(2000, 3000, 100, [-500, -200, -800]), name: 'Kellarin lattia' };
  await ready(page, [wall, floor]);
  const at = await view(page, [wall, floor], 'front');
  await click(page, at(500, 0, 1000));
  await page.keyboard.press('n');
  await page.getByLabel('Veitsen reitti').selectOption('polyline');
  for (const [x, z] of [
    [300, 800],
    [700, 800],
    [650, 1400],
    [300, 1400],
    [300, 800],
  ])
    await click(page, at(x, 0, z));
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '3');
  const panel = page.getByRole('region', { name: 'Veitsen asetukset' });
  await expect(panel.getByRole('button', { name: 'Valitse pala', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(
    panel.getByRole('button', { name: 'Murenna ja heitä…', exact: true }),
  ).toBeDisabled();
  await click(page, at(500, 0, 1100));
  await expect(panel.getByRole('button', { name: 'Murenna ja heitä…', exact: true })).toBeEnabled();
  const split = await save(page);
  const pieces = split.bodies.filter((b) => b.id !== floor.id);
  const cutout = pieces.find((b) => b.feature.width < 500)!;
  expect(cutout).toBeTruthy();
  const remainder = pieces.find((b) => b.id !== cutout.id)!;
  await panel.getByRole('button', { name: 'Murenna ja heitä…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Murenna ja heitä', exact: true });
  await dialog.getByLabel('Palojen määrä').fill('6');
  await dialog.getByRole('button', { name: 'Muodosta palat', exact: true }).click();
  await expect(dialog.getByText('6 irtopalaa', { exact: true })).toBeVisible();
  await expect(dialog.getByLabel('Apulattia', { exact: true })).not.toBeChecked();
  // View-ray direction from the knife points into the room, +Y in the front view.
  await expect(
    dialog.getByRole('button', { name: 'Heiton suunta Y+', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  const azimuth = dialog.getByLabel('Heiton suunta suuntakulma', { exact: true });
  await azimuth.focus();
  await azimuth.press('ControlOrMeta+a');
  await azimuth.pressSequentially('-45');
  await expect(azimuth).toHaveValue('-45');
  await azimuth.press('Tab');
  await expect(azimuth).toHaveValue('-45');
  await dialog.getByRole('button', { name: 'Heiton suunta Y+', exact: true }).click();
  await dialog.getByLabel('Heiton hajonta').fill('0');
  await dialog.getByLabel('Heiton nopeus').fill('2');
  await dialog.getByText('Painovoima · 9.81 m/s²', { exact: true }).click();
  await dialog.getByLabel('Painovoiman voimakkuus').fill('0');
  await dialog.getByRole('button', { name: 'Heitä palat', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Tauko', exact: true })).toBeEnabled();
  await page.waitForTimeout(900);
  await dialog.getByRole('button', { name: 'Tauko', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Hyväksy nykyinen asento' })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Sovita palat näkymään' }).click();
  await page.screenshot({
    path: `/private/tmp/nivo-knife-fracture-${test.info().project.name}.png`,
  });
  await dialog.getByRole('button', { name: 'Hyväksy nykyinen asento' }).click();
  await expect(dialog).not.toBeVisible();
  const baked = await save(page);
  expect(baked.bodies.find((b) => b.id === remainder.id)).toEqual(remainder);
  expect(baked.bodies.find((b) => b.id === floor.id)).toEqual(floor);
  expect(baked.bodies.find((b) => b.id === cutout.id)?.hidden).toBe(true);
  const rubble = baked.bodies.filter((b) => !split.bodies.some((s) => s.id === b.id));
  expect(rubble).toHaveLength(6);
  expect(rubble.every((b) => b.origin[1] > cutout.origin[1] + 500)).toBe(true);
  await page.getByRole('banner').getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual(split.bodies);
  await page.getByRole('banner').getByRole('button', { name: 'Palauta', exact: true }).click();
  expect((await save(page)).bodies).toEqual(baked.bodies);
  expect(errors).toEqual([]);
});

test('knife piece deletion is explicit, undoable, and locked parts cannot be fractured', async ({
  page,
}) => {
  const source = makeBody(600, 400, 100);
  await ready(page, [source]);
  const at = await view(page, [source]);
  await page.keyboard.press('n');
  await click(page, at(200, -50, 100));
  await click(page, at(200, 450, 100));
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '2');
  const split = await save(page);
  await click(page, at(100, 200, 100));
  await page.getByRole('button', { name: 'Poista pala', exact: true }).click();
  expect((await save(page)).bodies).toHaveLength(1);
  await page.getByRole('banner').getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual(split.bodies);
  await click(page, at(100, 200, 100));
  await page.keyboard.press('g');
  await expect(page.getByRole('button', { name: 'Murenna ja heitä…', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Poista pala', exact: true })).toBeDisabled();
});
