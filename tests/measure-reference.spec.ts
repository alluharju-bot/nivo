import { test, expect, type Page } from '@playwright/test';
import { makeBody, type Vec3 } from '../src/model/project';
import { guidePoints } from '../src/model/guides';
import { ready, view, click, save } from './helpers';

async function chooseFree(page: Page) {
  await page.getByRole('button', { name: 'Valitse mittatyökalu', exact: true }).click();
  await page.getByRole('menuitemradio', { name: /^Vapaa mittaviiva/ }).click();
}
const snapped = async (page: Page) =>
  JSON.parse((await page.getByTestId('viewport').getAttribute('data-snap-point')) || 'null');
const roundedPoints = (
  bodies: ReturnType<typeof makeBody>[],
  guide: Parameters<typeof guidePoints>[1],
) => guidePoints(bodies, guide)?.map((point) => point.map((n) => Number(n.toFixed(3))));
const parts = () => [makeBody(600, 400, 13), makeBody(100, 80, 60, [283, 180, 13])];

test('measurement selector remembers the mode and closing its menu preserves the current line', async ({
  page,
}, info) => {
  const bodies = parts();
  await ready(page, bodies);
  const p = await view(page, bodies);
  const main = page.getByRole('button', { name: 'Mittatyökalu', exact: true });
  const arrow = page.getByRole('button', { name: 'Valitse mittatyökalu', exact: true });
  await chooseFree(page);
  await expect(main).toContainText('Mittaviiva');
  await page.keyboard.press('v');
  await main.click();
  await expect(page.getByRole('heading', { name: 'Vapaa mittaviiva', exact: true })).toBeVisible();
  await expect(page.getByRole('menu', { name: 'Mittatyökalun tila' })).toHaveCount(0);
  await click(page, p(0, 0, 13));
  await page.mouse.move(p(100, 0, 13).x, p(100, 0, 13).y);
  await expect(page.getByTestId('guide-length')).toHaveValue('100');
  await main.click();
  await expect(page.getByTestId('guide-length')).toHaveValue('100');
  await arrow.click();
  await expect(page.getByRole('menuitemradio', { name: /^Vapaa mittaviiva/ })).toBeFocused();
  await page.screenshot({ path: info.outputPath('measurement-selector.png') });
  await page.keyboard.press('Escape');
  await expect(arrow).toBeFocused();
  await expect(page.getByTestId('guide-length')).toHaveValue('100');
  await arrow.click();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(main).toContainText('Dimensio');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  await page.keyboard.press('v');
  await page.keyboard.press('t');
  await expect(page.getByRole('heading', { name: 'Dimensio', exact: true })).toBeVisible();
  expect((await save(page)).guides).toHaveLength(0);
});

test('free measure holds direction with Shift, projects a reference in 3D exactly and releases immediately', async ({
  page,
}, info) => {
  const bodies = parts();
  await ready(page, bodies);
  const p = await view(page, bodies);
  await chooseFree(page);
  await click(page, p(0, 0, 13));
  await page.mouse.move(p(100, 0, 13).x, p(100, 0, 13).y);
  await page.keyboard.down('Shift');
  const target = p(283, 180, 73);
  await page.mouse.move(target.x, target.y);
  await expect(page.getByTestId('snap-hint')).toContainText('Pituus poimittu');
  await expect.poll(() => snapped(page)).toEqual([283, 0, 13]);
  await expect(page.getByTestId('guide-length')).toHaveValue('283');
  await page.screenshot({ path: info.outputPath('shift-measure-reference.png') });
  await page.keyboard.up('Shift');
  await expect.poll(() => snapped(page)).toEqual([283, 180, 73]);
  await expect(page.getByRole('button', { name: 'Vapauta suuntalukko' })).toHaveCount(0);
  // Capture the original direction again, then commit the projected endpoint.
  await page.mouse.move(p(100, 0, 13).x, p(100, 0, 13).y);
  await page.keyboard.down('Shift');
  await click(page, target);
  await page.keyboard.up('Shift');
  await expect(page.locator('.guide-list>div')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  const result = await save(page);
  expect(guidePoints(result.bodies, result.guides[0])).toEqual([
    [0, 0, 13],
    [283, 0, 13],
  ]);
  expect(result.bodies).toEqual(bodies);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).guides).toHaveLength(0);
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  expect(guidePoints(bodies, (await save(page)).guides[0])).toEqual([
    [0, 0, 13],
    [283, 0, 13],
  ]);
});

test('Shift held before starting captures the first direction and preserves an exact diagonal projection', async ({
  page,
}) => {
  const bodies = parts();
  await ready(page, bodies);
  const p = await view(page, bodies);
  await chooseFree(page);
  await page.keyboard.down('Shift');
  await click(page, p(0, 0, 13));
  await page.mouse.move(p(100, 100, 13).x, p(100, 100, 13).y);
  await page.mouse.move(p(283, 180, 73).x, p(283, 180, 73).y);
  await expect(page.getByTestId('snap-hint')).toContainText('Pituus poimittu');
  const end = await snapped(page);
  expect(end[0]).toBeCloseTo(231.5, 6);
  expect(end[1]).toBeCloseTo(231.5, 6);
  expect(end[2]).toBeCloseTo(13, 6);
  await page.keyboard.press('Enter');
  await page.keyboard.up('Shift');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  const result = await save(page);
  const saved = guidePoints(result.bodies, result.guides[0])![1];
  expect(saved[0]).toBeCloseTo(231.5, 6);
  expect(saved[1]).toBeCloseTo(231.5, 6);
  expect(saved[2]).toBeCloseTo(13, 6);
});

for (const [axis, end] of [
  ['x', [283, 0, 13]],
  ['y', [0, 180, 13]],
  ['z', [0, 0, 73]],
] as [string, Vec3][])
  test(`free measure ${axis.toUpperCase()} lock can use an off-axis reference and typed length wins`, async ({
    page,
  }) => {
    const bodies = parts();
    await ready(page, bodies);
    const p = await view(page, bodies);
    await chooseFree(page);
    await click(page, p(0, 0, 13));
    await page.keyboard.press(axis);
    await page.keyboard.down('Shift');
    await page.mouse.move(p(283, 180, 73).x, p(283, 180, 73).y);
    await expect.poll(() => snapped(page)).toEqual(end);
    await page.getByTestId('guide-length').fill('48');
    await page.getByTestId('guide-length').press('Enter');
    await page.keyboard.up('Shift');
    await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
    const result = await save(page);
    const points = guidePoints(result.bodies, result.guides[0])!;
    expect(Math.hypot(...points[1].map((n, i) => n - points[0][i]))).toBeCloseTo(48, 7);
    points[1].forEach((n, i) =>
      expect(n).toBeCloseTo([0, 0, 13][i] + (i === 'xyz'.indexOf(axis) ? 48 : 0), 7),
    );
  });

test('measurement menu stays on screen at every toolbar dock', async ({ page }) => {
  await ready(page, [makeBody(600, 400, 13)]);
  for (const side of ['Vasen', 'Oikea', 'Ylä', 'Ala']) {
    await page.getByRole('button', { name: 'Siirrä työkalupalkkia' }).click();
    await page
      .getByRole('group', { name: 'Työkalupalkin sijainti' })
      .getByRole('button', { name: side, exact: true })
      .click();
    await page.getByRole('button', { name: 'Valitse mittatyökalu', exact: true }).click();
    const menu = page.getByRole('menu', { name: 'Mittatyökalun tila' });
    await expect(menu).toBeInViewport({ ratio: 1 });
    await expect(menu.getByRole('menuitemradio', { name: /^Dimensio/ })).toBeInViewport({
      ratio: 1,
    });
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
  }
});

test('free measurements continue from each saved endpoint until Enter or Escape, with independent undo', async ({
  page,
}) => {
  const bodies = parts();
  await ready(page, bodies);
  const p = await view(page, bodies);
  await chooseFree(page);
  await click(page, p(0, 0, 13));
  await click(page, p(100, 0, 13));
  await expect(page.locator('.guide-list>div')).toHaveCount(1);
  await click(page, p(100, 100, 13));
  await expect(page.locator('.guide-list>div')).toHaveCount(2);
  await click(page, p(0, 100, 13));
  await expect(page.locator('.guide-list>div')).toHaveCount(3);
  await page.mouse.move(p(200, 200, 13).x, p(200, 200, 13).y);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  let result = await save(page);
  expect(result.guides.map((g) => roundedPoints(bodies, g))).toEqual([
    [
      [0, 0, 13],
      [100, 0, 13],
    ],
    [
      [100, 0, 13],
      [100, 100, 13],
    ],
    [
      [100, 100, 13],
      [0, 100, 13],
    ],
  ]);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).guides).toHaveLength(2);
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  await expect(page.locator('.guide-list>div')).toHaveCount(3);
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Mittatyökalu', exact: true })).toBeEnabled();
  await click(page, p(200, 0, 13));
  await expect(page.getByTestId('dynamic-input')).toBeVisible();
  await page.mouse.move(p(200, 100, 13).x, p(200, 100, 13).y);
  await expect(page.getByTestId('guide-length')).toHaveValue('100');
  await click(page, p(200, 100, 13));
  await expect(page.locator('.guide-list>div')).toHaveCount(4);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Mittatyökalu', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  result = await save(page);
  expect(result.guides).toHaveLength(4);
});

test('R enables continuous mouse rotation in 22.5 degree steps, Shift+R is free and Enter preserves length', async ({
  page,
}) => {
  const bodies = parts();
  await ready(page, bodies);
  const p = await view(page, bodies);
  await chooseFree(page);
  await click(page, p(0, 0, 13));
  await page.mouse.move(p(200, 0, 13).x, p(200, 0, 13).y);
  await page.keyboard.press('r');
  for (const angle of [24, 43, 69, 112, 178]) {
    const rad = (angle * Math.PI) / 180,
      target = p(200 * Math.cos(rad), 200 * Math.sin(rad), 13);
    await page.mouse.move(target.x, target.y);
    await expect(page.getByTestId('guide-angle')).toHaveValue(
      String(Math.round(angle / 22.5) * 22.5),
    );
    await expect(page.getByTestId('guide-length')).toHaveValue('200');
  }
  await page.keyboard.press('Shift+R');
  const target = p(180, 80, 13);
  await page.mouse.move(target.x, target.y);
  expect(Number(await page.getByTestId('guide-angle').inputValue())).toBeCloseTo(
    (Math.atan2(80, 180) * 180) / Math.PI,
    1,
  );
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  const result = await save(page);
  const points = guidePoints(bodies, result.guides[0])!;
  expect(Math.hypot(...points[1].map((n, i) => n - points[0][i]))).toBeCloseTo(200, 5);
});

const segments = () => [
  {
    id: 'first',
    mode: 'free' as const,
    anchor: { point: [0, 0, 13] as Vec3 },
    endAnchor: { point: [100, 0, 13] as Vec3 },
    length: 100,
    angle: 0,
    plane: 'XY' as const,
  },
  {
    id: 'second',
    mode: 'free' as const,
    anchor: { point: [100, 0, 13] as Vec3 },
    endAnchor: { point: [100, 100, 13] as Vec3 },
    length: 100,
    angle: 90,
    plane: 'XY' as const,
  },
];

test('double-click picks up one endpoint; Escape cancels and click commits with undo, redo and reload', async ({
  page,
}) => {
  const bodies = parts(),
    guides = segments();
  await ready(page, bodies, guides);
  const p = await view(page, bodies);
  await page.mouse.dblclick(p(0, 0, 13).x, p(0, 0, 13).y);
  await page.mouse.move(p(0, 100, 13).x, p(0, 100, 13).y);
  await expect(page.getByTestId('guide-length')).toHaveValue('141.42');
  await page.keyboard.press('Escape');
  expect((await save(page)).guides).toEqual(guides);
  await page.keyboard.press('v');
  await page.mouse.dblclick(p(0, 0, 13).x, p(0, 0, 13).y);
  await click(page, p(0, 100, 13));
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  let result = await save(page);
  expect(roundedPoints(bodies, result.guides[0])).toEqual([
    [0, 100, 13],
    [100, 0, 13],
  ]);
  expect(result.guides[1]).toEqual(guides[1]);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).guides).toEqual(guides);
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  result = await save(page);
  await page.reload();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '2');
  expect((await save(page)).guides).toEqual(result.guides);
});

test('shared endpoints ask which independent line to edit or delete; other lines stay unchanged', async ({
  page,
}, info) => {
  const bodies = parts(),
    guides = segments();
  await ready(page, bodies, guides);
  const p = await view(page, bodies);
  await page.mouse.dblclick(p(100, 0, 13).x, p(100, 0, 13).y);
  const menu = page.getByRole('menu', { name: 'Mittaviivan piste' });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitemradio')).toHaveCount(2);
  await menu.getByRole('menuitemradio', { name: /Viiva 2/ }).click();
  await expect(menu.getByRole('menuitemradio', { name: /Viiva 2/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.screenshot({ path: info.outputPath('measurement-point-menu.png') });
  await menu.getByRole('menuitem', { name: 'Siirrä pistettä' }).click();
  await page.mouse.move(p(200, 0, 13).x, p(200, 0, 13).y);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  let result = await save(page);
  expect(result.guides[0]).toEqual(guides[0]);
  expect(roundedPoints(bodies, result.guides[1])).toEqual([
    [200, 0, 13],
    [100, 100, 13],
  ]);
  await page.keyboard.press('v');
  await page.mouse.click(p(200, 0, 13).x, p(200, 0, 13).y, { button: 'right' });
  await expect(menu.getByRole('menuitemradio')).toHaveCount(0);
  await menu.getByRole('menuitem', { name: 'Poista mittaviiva' }).click();
  result = await save(page);
  expect(result.guides).toEqual([guides[0]]);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).guides).toHaveLength(2);
});

test('endpoint can be picked up while measuring and Shift projects its length without moving neighbors', async ({
  page,
}) => {
  const bodies = parts(),
    guides = segments();
  await ready(page, bodies, guides);
  const p = await view(page, bodies);
  await chooseFree(page);
  // Only this endpoint is at (0,0,13), so double-click goes directly into editing.
  await page.mouse.dblclick(p(0, 0, 13).x, p(0, 0, 13).y);
  await expect(page.getByTestId('guide-length')).toHaveValue('100');
  await page.mouse.move(p(200, 0, 13).x, p(200, 0, 13).y);
  await page.keyboard.down('Shift');
  await page.mouse.move(p(283, 180, 73).x, p(283, 180, 73).y);
  await expect.poll(() => snapped(page)).toEqual([283, 0, 13]);
  await page.keyboard.press('Enter');
  await page.keyboard.up('Shift');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  const result = await save(page);
  expect(result.guides).toHaveLength(2);
  expect(guidePoints(bodies, result.guides[0])).toEqual([
    [283, 0, 13],
    [100, 0, 13],
  ]);
  expect(result.guides[1]).toEqual(guides[1]);
});

for (const side of ['front', 'right'] as const)
  test(`mouse rotation also works on the ${side} vertical measurement plane`, async ({ page }) => {
    const bodies = [makeBody(600, 400, 400)];
    await ready(page, bodies);
    const p = await view(page, bodies, side);
    const at = (u: number, v: number) => (side === 'front' ? p(u, 0, v) : p(600, u, v));
    await chooseFree(page);
    await click(page, at(0, 0));
    await page.mouse.move(at(150, 0).x, at(150, 0).y);
    await page.keyboard.press('r');
    await page.mouse.move(at(150, 80).x, at(150, 80).y);
    await expect(page.getByTestId('guide-angle')).toHaveValue('22.5');
    await expect(page.getByTestId('guide-length')).toHaveValue('150');
    await page.keyboard.press('Enter');
    const result = await save(page);
    const [a, b] = guidePoints(bodies, result.guides[0])!;
    expect(Math.hypot(...b.map((n, i) => n - a[i]))).toBeCloseTo(150, 4);
    expect(b[side === 'front' ? 1 : 0]).toBeCloseTo(a[side === 'front' ? 1 : 0], 5);
  });

test('a saved vertical line can pick an exact 3D endpoint even with its drawing plane edge-on', async ({
  page,
}) => {
  const bodies = parts();
  const guide = {
    ...segments()[0],
    plane: 'XZ' as const,
    endAnchor: { point: [100, 0, 113] as Vec3 },
  };
  await ready(page, bodies, [guide]);
  const p = await view(page, bodies);
  await page.mouse.dblclick(p(0, 0, 13).x, p(0, 0, 13).y);
  await page.mouse.move(p(283, 180, 73).x, p(283, 180, 73).y);
  await expect.poll(() => snapped(page)).toEqual([283, 180, 73]);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  const result = await save(page);
  expect(guidePoints(bodies, result.guides[0])).toEqual([
    [283, 180, 73],
    [100, 0, 113],
  ]);
});
