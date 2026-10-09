import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { Project } from '../src/model/project';
import { makeBody, makeProfileBody } from '../src/model/project';
import { sketchFrame } from '../src/model/sketch';
import { ready, view, click, save, revealBrowser } from './helpers';

async function shape(page: import('@playwright/test').Page, name: string) {
  await page.getByRole('button', { name: 'Muodot', exact: true }).click();
  await page.getByRole('button', { name, exact: true }).click();
}
const ring = (r: number, z: number, name: string) =>
  makeProfileBody({ kind: 'circle', radius: r }, sketchFrame([0, 0, z]), 0, name, 'construction');

test('fit-point Bézier snaps to circle quadrants, accepts two clicks, and saves extra stations', async ({
  page,
}) => {
  const bodies = [ring(100, 0, 'Rengas')];
  await ready(page, bodies);
  const p = await view(page, bodies);
  await shape(page, 'Bézier-käyrä');
  await expect(page.getByRole('combobox', { name: 'Bézierin piirtotapa' })).toHaveValue('smooth');
  await click(page, p(-100, 0));
  await click(page, p(0, 100));
  await click(page, p(100, 0));
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '2');
  let result = await save(page);
  const curve = result.bodies[1];
  expect(curve.curve?.mode).toBe('smooth');
  for (const [i, expected] of [
    [-100, 0, 0],
    [0, 100, 0],
    [100, 0, 0],
  ].entries())
    curve.curve!.points[i].forEach((n, k) =>
      expect(n + curve.origin[k]).toBeCloseTo(expected[k], 5),
    );
  await page.keyboard.press('Escape');
  await revealBrowser(page);
  await page.getByTestId(`body-${curve.id}`).click();
  await page.getByRole('textbox', { name: 'Tartuntapisteen sijainti' }).fill('12.5');
  await page.getByRole('button', { name: 'Lisää piste', exact: true }).click();
  result = await save(page);
  expect(result.bodies[1].curveSnaps).toContain(0.125);
  await expect(page.locator('.save-status')).toContainText('Tallessa');
  await page.reload();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '2');
  await revealBrowser(page);
  await page.getByTestId(`body-${curve.id}`).click();
  await expect(page.locator('.curve-points-panel')).toContainText('12.5 %');
});

test('through shapes previews exact cone, supports cancel, saves one history step, and retains profiles', async ({
  page,
}) => {
  const bodies = [ring(100, 0, 'Ala'), ring(40, 300, 'Ylä')];
  await ready(page, bodies);
  await shape(page, 'Muotojen läpi');
  await page.getByRole('combobox', { name: 'Lisää profiili' }).selectOption(bodies[0].id);
  await page.getByRole('combobox', { name: 'Lisää profiili' }).selectOption(bodies[1].id);
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-surface-preview', 'true');
  await expect(page.getByRole('button', { name: 'Luo pinta', exact: true })).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-surface-preview', 'false');
  expect((await save(page)).bodies).toEqual(bodies);
  await shape(page, 'Muotojen läpi');
  await revealBrowser(page);
  for (const body of bodies) await page.getByTestId(`body-${body.id}`).click();
  await page.getByRole('checkbox', { name: 'Sulje päädyt · umpiosa' }).check();
  await expect(page.getByRole('button', { name: 'Luo pinta', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Luo pinta', exact: true }).click();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
  const result = await save(page);
  expect(result.bodies).toHaveLength(3);
  expect(result.bodies.slice(0, 2).every((b) => b.hidden)).toBe(true);
  expect(result.bodies[2].feature.type === 'brep' && result.bodies[2].feature.solid).toBe(true);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual(bodies);
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  expect((await save(page)).bodies).toEqual(result.bodies);
});

test('circle construction tool produces a wire; changing curve coordinates is undoable', async ({
  page,
}) => {
  const body = makeBody(600, 400, 0);
  await ready(page, [body]);
  const p = await view(page, [body]);
  await shape(page, 'Ympyrä');
  await page.getByRole('button', { name: 'Mittaus/rakennusviiva', exact: true }).click();
  await click(page, p(300, 200));
  await page.mouse.move(p(400, 200).x, p(400, 200).y);
  await page.keyboard.type('200');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '2');
  const result = await save(page);
  expect(
    result.bodies[1].feature.type === 'profile-extrusion' && result.bodies[1].feature.outline,
  ).toBe(true);
  await shape(page, 'Bézier-käyrä');
  await click(page, p(100, 100));
  await click(page, p(200, 150));
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '3');
  const curves = await save(page),
    curve = curves.bodies[2];
  await page.keyboard.press('Escape');
  await revealBrowser(page);
  await page.getByTestId(`body-${curve.id}`).click();
  await page.getByText('Muokkaa käyrän pisteitä', { exact: true }).click();
  await page.getByRole('textbox', { name: 'Käyrän piste 2 Z', exact: true }).fill('50');
  await page.getByRole('button', { name: 'Päivitä käyrä', exact: true }).click();
  await expect(page.getByTestId('selected-height')).toContainText('50');
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual(curves.bodies);
});

test('four bottle side curves form a preview and capped body through the real UI', async ({
  page,
}, info) => {
  const example = JSON.parse(
    await readFile('public/examples/muotojen-lapi.nivo', 'utf8'),
  ) as Project;
  const sides = example.bodies
    .filter((b) => b.curve)
    .map((b) => ({ ...b, hidden: false, groupId: undefined }));
  await ready(page, sides);
  await shape(page, 'Muotojen läpi');
  await page.getByRole('combobox', { name: 'Pinnan rakennustapa' }).selectOption('sides');
  for (const body of sides)
    await page.getByRole('combobox', { name: 'Lisää profiili' }).selectOption(body.id);
  await page.getByRole('checkbox', { name: 'Sulje sivut ympäri' }).check();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-surface-preview', 'true');
  await page.getByRole('checkbox', { name: 'Sulje päädyt · umpiosa' }).check();
  await expect(page.getByRole('button', { name: 'Luo pinta', exact: true })).toBeEnabled();
  await page.screenshot({ path: info.outputPath('bottle-through-curves.png') });
  await page.getByRole('button', { name: 'Luo pinta', exact: true }).click();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
  const result = await save(page);
  expect(
    result.bodies.at(-1)!.feature.type === 'brep' && result.bodies.at(-1)!.feature.height,
  ).toBeCloseTo(265, 4);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual(sides);
});

test('pointed cone rejects zero height and cancels safely after preview', async ({ page }) => {
  const bodies = [ring(100, 0, 'Kartion pohja')];
  await ready(page, bodies);
  await shape(page, 'Muotojen läpi');
  await page.getByRole('combobox', { name: 'Lisää profiili' }).selectOption(bodies[0].id);
  await page.getByRole('checkbox', { name: 'Päätä kärkeen · kartio' }).check();
  await page.getByRole('checkbox', { name: 'Sulje päädyt · umpiosa' }).check();
  await expect(page.getByRole('button', { name: 'Luo pinta', exact: true })).toBeEnabled();
  await page.getByRole('spinbutton', { name: 'Kärjen etäisyys' }).fill('0');
  await expect(page.getByRole('button', { name: 'Luo pinta', exact: true })).toBeDisabled();
  await expect(page.getByRole('region', { name: 'Muotojen läpi' })).toContainText(
    'Anna kärjen etäisyydeksi',
  );
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-surface-preview', 'false');
  await page.getByRole('spinbutton', { name: 'Kärjen etäisyys' }).fill('-250');
  await expect(page.getByRole('button', { name: 'Luo pinta', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Luo pinta', exact: true }).click();
  const result = await save(page),
    cone = result.bodies[1];
  expect(cone.origin[2]).toBeCloseTo(-250, 5);
  expect(cone.feature.height).toBeCloseTo(250, 5);
});

test('simplified Bézier keeps Shift direction and takes the length from another circle point', async ({
  page,
}) => {
  const bodies = [ring(100, 0, 'Rengas')];
  await ready(page, bodies);
  const p = await view(page, bodies);
  await shape(page, 'Bézier-käyrä');
  await click(page, p(-100, 0));
  await page.mouse.move(p(0, 100).x, p(0, 100).y);
  await page.keyboard.down('Shift');
  await page.mouse.move(p(100, 0).x, p(100, 0).y);
  await expect(page.getByTestId('snap-hint')).toContainText('Pituus poimittu');
  const hover = JSON.parse((await page.getByTestId('viewport').getAttribute('data-pen-hover'))!);
  hover.forEach((n: number, i: number) => expect(n).toBeCloseTo([0, 100, 0][i], 5));
  await click(page, p(100, 0));
  await page.keyboard.up('Shift');
  await page.keyboard.press('Enter');
  const result = await save(page),
    curve = result.bodies[1];
  curve.curve!.points[1].forEach((n, i) =>
    expect(n + curve.origin[i]).toBeCloseTo([0, 100, 0][i], 5),
  );
});

test('the supplied curve example opens with sources retained and three separate surfaces', async ({
  page,
}, info) => {
  await ready(page);
  await page.getByRole('button', { name: 'Käyräesimerkki · pullo ja kartio' }).click();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '3');
  const result = await save(page);
  expect(result.bodies).toHaveLength(14);
  await page.screenshot({ path: info.outputPath('through-shapes-example.png') });
});
