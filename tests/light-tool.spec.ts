import { test, expect } from '@playwright/test';
import { makeBody } from '../src/model/project';
import { defaultAppearance } from '../src/model/materials';
import { asComponent } from '../src/model/components';
import { click, ready, save, view } from './helpers';

test('P light controls aim a spotlight, preview its beam and preserve materials through undo and reload', async ({
  page,
}, info) => {
  const floor = makeBody(800, 600, 20, [-400, -300, -20], 'Taso');
  const lamp = {
    ...makeBody(80, 60, 10, [-40, -30, 300], 'Valaisin'),
    color: '#886633',
    appearance: defaultAppearance('oak'),
  };
  await ready(page, [floor, lamp]);
  const point = await view(page, [floor, lamp]);
  await click(page, point(0, 0, 310));
  await page.keyboard.press('p');
  await page
    .getByRole('group', { name: 'Maalauksen työkalut' })
    .getByRole('button', { name: 'Valo', exact: true })
    .click();
  const panel = page.getByRole('region', { name: 'Osan valoasetukset' });
  await panel.getByLabel('Valaisimen esiasetus').selectOption('spot-neutral');
  const canvas = page.getByTestId('viewport');
  await expect(canvas).toHaveAttribute('data-light-helper', /direction/);
  const original = (await save(page)).bodies.find((b) => b.id === lamp.id)!;
  expect(original.color).toBe(lamp.color);
  expect(original.appearance?.preset).toBe('oak');
  const helper = async () => JSON.parse((await canvas.getAttribute('data-light-helper'))!);
  const builds = await canvas.getAttribute('data-geometry-builds');
  await panel.getByRole('button', { name: 'Suuntaa kohteeseen', exact: true }).click();
  const destination = point(200, 100, 0);
  await page.mouse.move(destination.x, destination.y);
  await expect.poll(async () => (await helper()).direction[0]).toBeGreaterThan(0.4);
  // A hover is a preview, not an autosaved edit.
  expect(
    (await save(page)).bodies.find((b) => b.id === lamp.id)!.appearance!.emission!.aim,
  ).toBeUndefined();
  await click(page, destination);
  let result = (await save(page)).bodies.find((b) => b.id === lamp.id)!;
  expect(result.appearance!.emission!.aim![0]).toBeGreaterThan(0.4);
  expect(result.appearance!.emission!.aim![2]).toBeLessThan(-0.7);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect(
    (await save(page)).bodies.find((b) => b.id === lamp.id)!.appearance!.emission!.aim,
  ).toBeUndefined();
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  const width = panel.getByRole('slider', { name: 'Keilan leveys' });
  await width.focus();
  await width.press('End');
  await expect.poll(async () => (await helper()).angle).toBe(160);
  result = (await save(page)).bodies.find((b) => b.id === lamp.id)!;
  expect(result.appearance!.emission!.angle).toBe(160);
  await expect(canvas).toHaveAttribute('data-geometry-builds', builds!);
  await panel.getByRole('button', { name: 'Suuntaa kohteeseen', exact: true }).click();
  await page.mouse.move(point(-200, 100, 0).x, point(-200, 100, 0).y);
  await page.keyboard.press('Escape');
  await expect(panel).toBeVisible();
  expect((await save(page)).bodies.find((b) => b.id === lamp.id)!.appearance).toEqual(
    result.appearance,
  );
  await page.screenshot({ path: info.outputPath('light-tool.png') });
  await expect(page.getByText('Tallessa selaimessa', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  await page.getByLabel('Materiaalin kohde').selectOption(lamp.id);
  await page.getByText('Osa valonlähteenä', { exact: true }).click();
  await expect(page.getByLabel('Spotin suunta')).toHaveValue('custom');
  await expect(page.getByLabel('Spotin kulma')).toHaveValue('160');
});

test('P light settings can affect just one face without replacing the body material', async ({
  page,
}) => {
  const body = {
    ...makeBody(200, 200, 20),
    appearance: defaultAppearance('iron-black'),
    color: '#aabbcc',
  };
  await ready(page, [body]);
  const point = await view(page, [body]);
  await page.keyboard.press('p');
  await page
    .getByRole('group', { name: 'Maalauksen työkalut' })
    .getByRole('button', { name: 'Valo', exact: true })
    .click();
  const panel = page.getByRole('region', { name: 'Osan valoasetukset' });
  await panel.getByRole('button', { name: 'Pinta', exact: true }).click();
  await click(page, point(100, 100, 20));
  await panel.getByLabel('Valaisimen esiasetus').selectOption('led-warm');
  const result = (await save(page)).bodies[0];
  expect(result.appearance).toEqual(body.appearance);
  expect(result.color).toBe(body.color);
  expect(Object.values(result.faceMaterials ?? {})).toHaveLength(1);
  expect(Object.values(result.faceMaterials!)[0]).toMatchObject({
    color: body.color,
    appearance: { preset: 'iron-black', emission: { enabled: true, type: 'surface' } },
  });
});

test('a light selection aims each instance at the same point and held parts remain protected', async ({
  page,
}) => {
  const floor = makeBody(800, 600, 20, [-400, -300, -20], 'Taso');
  const a = asComponent(makeBody(40, 40, 10, [-150, -20, 300], 'Valo A'));
  const b = asComponent(makeBody(40, 40, 10, [110, -20, 300], 'Valo B'), a.component!.id);
  const held = { ...makeBody(50, 50, 10, [250, 200, 300], 'Lukittu'), locked: true };
  await ready(page, [floor, a, b, held]);
  const point = await view(page, [floor, a, b, held]);
  await click(page, point(-130, 0, 310));
  await page.keyboard.down('Shift');
  await click(page, point(130, 0, 310));
  await page.keyboard.up('Shift');
  await page.keyboard.press('p');
  await page
    .getByRole('group', { name: 'Maalauksen työkalut' })
    .getByRole('button', { name: 'Valo', exact: true })
    .click();
  const panel = page.getByRole('region', { name: 'Osan valoasetukset' });
  await expect(panel.getByText('2 valittua osaa', { exact: true })).toBeVisible();
  await panel.getByLabel('Valaisimen esiasetus').selectOption('spot-neutral');
  await panel.getByRole('button', { name: 'Suuntaa kohteeseen', exact: true }).click();
  await click(page, point(0, 0, 0));
  const result = await save(page);
  const left = result.bodies.find((x) => x.id === a.id)!,
    right = result.bodies.find((x) => x.id === b.id)!;
  expect(left.appearance!.emission!.aim![0]).toBeGreaterThan(0.3);
  expect(right.appearance!.emission!.aim![0]).toBeLessThan(-0.3);
  expect(left.component!.id).toBe(right.component!.id);
  expect(left.localMaterial && right.localMaterial).toBe(true);
  expect(result.bodies.find((x) => x.id === held.id)).toMatchObject(held);
  await page.keyboard.press('Escape');
  await click(page, point(275, 225, 310));
  await page.keyboard.press('p');
  await expect(panel.getByLabel('Valaisimen esiasetus')).toBeDisabled();
});
