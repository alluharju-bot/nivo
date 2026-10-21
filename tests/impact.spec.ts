import { test, expect } from '@playwright/test';
import { ready, save, view, click } from './helpers';
import { makeBody } from '../src/model/project';

// All editing in this test uses the ordinary viewport, panel and dialog controls.
test('click wall, adjust explosion sliders, throw debris, bake and undo', async ({ page }) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const source = { ...makeBody(1000, 150, 2000, [-1200, -500, -400]), name: 'Räjäytettävä seinä' };
  const floor = { ...makeBody(3000, 4000, 100, [-2000, -700, -800]), name: 'Lattia' };
  await ready(page, [source, floor]);
  const at = await view(page, [source, floor], 'front');
  await page.keyboard.press('n');
  const panel = page.getByRole('region', { name: 'Veitsen asetukset' });
  await panel.getByRole('button', { name: 'Räjähdys', exact: true }).click();
  await click(page, at(-700, -500, 600));
  const dialog = page.getByRole('dialog', { name: 'Räjähdys', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Osumakohta', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(dialog.getByLabel('Seinän läpi', { exact: true })).toBeChecked();
  const count = dialog.getByRole('slider', { name: 'Liukusäädin: palojen määrä', exact: true });
  await count.focus();
  await count.press('Home');
  for (let i = 0; i < 4; i++) await count.press('ArrowRight');
  await expect(dialog.getByRole('spinbutton', { name: 'Palojen määrä', exact: true })).toHaveValue(
    '6',
  );
  await dialog.getByRole('spinbutton', { name: 'Osumakohdan halkaisija', exact: true }).fill('400');
  await expect(
    dialog.getByRole('slider', { name: 'Liukusäädin: osumakohdan halkaisija', exact: true }),
  ).toHaveValue('400');
  await dialog.getByLabel('Seinän läpi', { exact: true }).uncheck();
  await dialog.getByRole('spinbutton', { name: 'Osumakohdan syvyys', exact: true }).fill('40');
  await expect(
    dialog.getByRole('slider', { name: 'Liukusäädin: osumakohdan syvyys', exact: true }),
  ).toHaveValue('40');
  await dialog.getByLabel('Seinän läpi', { exact: true }).check();
  await page.screenshot({
    path: `/private/tmp/nivo-impact-region-${test.info().project.name}.png`,
  });
  await dialog.getByRole('button', { name: 'Muodosta palat', exact: true }).click();
  await expect(dialog.getByText('6 irtopalaa', { exact: true })).toBeVisible({ timeout: 45000 });
  await expect(
    dialog.getByRole('button', { name: 'Heiton suunta Y+', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  // Changing the damage area must leave surface-direction picking, otherwise
  // the next source click unexpectedly changes the throw instead of the impact.
  await dialog.getByRole('button', { name: 'Poimi pinnasta', exact: true }).click();
  await dialog.locator('details.fracture-settings > summary').click();
  await dialog.getByRole('spinbutton', { name: 'Osumakohdan halkaisija', exact: true }).fill('450');
  await dialog.getByRole('button', { name: 'Muodosta palat', exact: true }).click();
  await expect(dialog.getByText('6 irtopalaa', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Poimi pinnasta', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  // Sliders and precise fields must stay synchronized in both directions.
  const angle = dialog.getByRole('slider', {
    name: 'Liukusäädin: heiton suunta suuntakulma',
    exact: true,
  });
  await angle.focus();
  await angle.press('Home');
  await angle.press('ArrowRight');
  await expect(
    dialog.getByRole('spinbutton', { name: 'Heiton suunta suuntakulma', exact: true }),
  ).toHaveValue('-179');
  await dialog.getByRole('button', { name: 'Heiton suunta Y+', exact: true }).click();
  await dialog.getByRole('spinbutton', { name: 'Heiton nopeus', exact: true }).fill('2');
  await dialog.getByRole('spinbutton', { name: 'Heiton hajonta', exact: true }).fill('0');
  await dialog.getByText('Painovoima · 9.81 m/s²', { exact: true }).click();
  const gravity = dialog.getByRole('slider', {
    name: 'Liukusäädin: painovoiman voimakkuus',
    exact: true,
  });
  await gravity.focus();
  await gravity.press('Home');
  await dialog.getByRole('button', { name: 'Heitä palat', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Tauko', exact: true })).toBeEnabled({
    timeout: 45000,
  });
  await page.waitForTimeout(1100);
  await dialog.getByRole('button', { name: 'Tauko', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Hyväksy nykyinen asento' })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Sovita palat näkymään' }).click();
  await page.screenshot({
    path: `/private/tmp/nivo-impact-thrown-${test.info().project.name}.png`,
  });
  await dialog.getByRole('button', { name: 'Hyväksy nykyinen asento' }).click();
  await expect(dialog).not.toBeVisible();
  const baked = await save(page);
  expect(baked.bodies.find((b) => b.id === source.id)?.hidden).toBe(true);
  expect(baked.bodies.find((b) => b.id === floor.id)).toEqual(floor);
  const created = baked.bodies.filter((b) => b.id !== source.id && b.id !== floor.id);
  expect(created).toHaveLength(7);
  expect(created.filter((b) => b.origin[1] > source.origin[1] + 500)).toHaveLength(6);
  await page.getByRole('banner').getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual([source, floor]);
  await page.getByRole('banner').getByRole('button', { name: 'Palauta', exact: true }).click();
  expect((await save(page)).bodies).toEqual(baked.bodies);
  expect(errors).toEqual([]);
});

test('impact cancel preserves model and locked wall cannot be exploded', async ({ page }) => {
  const wall = makeBody(1000, 150, 2000);
  await ready(page, [wall]);
  const at = await view(page, [wall], 'front');
  await click(page, at(500, 0, 1000));
  await page.keyboard.press('g');
  const locked = await save(page);
  await page.keyboard.press('n');
  await page.getByRole('button', { name: 'Räjähdys', exact: true }).click();
  await click(page, at(500, 0, 1000));
  await expect(page.getByRole('dialog', { name: 'Räjähdys', exact: true })).not.toBeVisible();
  expect((await save(page)).bodies).toEqual(locked.bodies);
  await page.keyboard.press('Escape');
  await click(page, at(500, 0, 1000));
  await page.keyboard.press('g');
  await page.keyboard.press('n');
  await page.getByRole('button', { name: 'Räjähdys', exact: true }).click();
  await click(page, at(500, 0, 1000));
  const dialog = page.getByRole('dialog', { name: 'Räjähdys', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual([wall]);
});
