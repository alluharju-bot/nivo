import { test, expect } from '@playwright/test';
import { ready, view, save, revealBrowser } from './helpers';
import { makeBody, type Axis, type Vec3 } from '../src/model/project';

for (const [axis, sign] of [
  ['x', -1],
  ['y', 1],
  ['y', -1],
  ['z', 1],
  ['z', -1],
] as [Axis, number][]) {
  test(`typing while moving uses the actual ${sign > 0 ? '+' : '-'}${axis} direction`, async ({
    page,
  }) => {
    const a = makeBody(100, 100, 100, [500, 500, 500]);
    const b = makeBody(100, 100, 100, [1200, 1200, 1200]);
    await ready(page, [a, b]);
    await revealBrowser(page);
    await page.getByTestId(`body-${a.id}`).click();
    const p = await view(page, [a, b], axis === 'z' ? 'front' : 'top');
    await page.keyboard.press('m');
    const start: Vec3 = axis === 'z' ? [550, 500, 550] : [550, 550, 600];
    const end = [...start] as Vec3;
    end['xyz'.indexOf(axis)] += sign * 220;
    await page.mouse.move(p(...start).x, p(...start).y);
    await page.mouse.down();
    await page.mouse.move(p(...end).x, p(...end).y, { steps: 7 });
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-move-axis', axis);
    await page.keyboard.type('150');
    await expect(page.getByTestId(`move-${axis}`)).toBeFocused();
    await expect(page.getByTestId(`move-${axis}`)).toHaveValue(String(sign * 150));
    await page.keyboard.press('Enter');
    await page.mouse.up();
    const result = await save(page);
    expect(result.bodies[0].origin).toEqual(
      a.origin.map((n, i) => n + (i === 'xyz'.indexOf(axis) ? sign * 150 : 0)),
    );
    expect(result.bodies[1]).toEqual(b);
    await expect(page.getByRole('button', { name: 'Toista', exact: true })).toBeVisible();
    await page.getByLabel('Lisätoistojen määrä').fill('2');
    await page.getByRole('button', { name: 'Toista', exact: true }).click();
    expect((await save(page)).bodies[0].origin['xyz'.indexOf(axis)]).toBe(500 + sign * 450);
    await page.getByRole('button', { name: 'Peru', exact: true }).click();
    expect((await save(page)).bodies[0].origin).toEqual(result.bodies[0].origin);
    await expect(page.getByRole('button', { name: 'Toista', exact: true })).toHaveCount(0);
  });
}

test('an explicit axis takes over the numeric input and an explicit sign overrides the drag direction', async ({
  page,
}) => {
  const a = makeBody(100, 100, 100, [500, 500, 500]);
  const b = makeBody(100, 100, 100, [1200, 1200, 1200]);
  await ready(page, [a, b]);
  await revealBrowser(page);
  await page.getByTestId(`body-${a.id}`).click();
  const p = await view(page, [a, b]);
  await page.keyboard.press('m');
  await page.mouse.move(p(550, 550, 600).x, p(550, 550, 600).y);
  await page.mouse.down();
  await page.mouse.move(p(330, 450, 600).x, p(330, 450, 600).y, { steps: 7 });
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-move-axis', 'x');
  await page.keyboard.press('y');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-move-axis', 'y');
  await page.keyboard.type('+175');
  await expect(page.getByTestId('move-y')).toBeFocused();
  await expect(page.getByTestId('move-y')).toHaveValue('+175');
  await page.keyboard.press('Enter');
  await page.mouse.up();
  expect((await save(page)).bodies[0].origin).toEqual([500, 675, 500]);
});

test('copy repeats preserve the assembly and linked parts, continue from the last copy and undo one batch', async ({
  page,
}, info) => {
  const a = { ...makeBody(18, 500, 800), groupId: 'root', purpose: 'component' as const };
  const b = { ...makeBody(18, 500, 800, [582, 0, 0]), groupId: 'child' };
  await ready(
    page,
    [a, b],
    [],
    [
      { id: 'root', name: 'Kaappi', hidden: false, kind: 'assembly' },
      { id: 'child', name: 'Runko', hidden: false, parentId: 'root' },
    ],
  );
  await revealBrowser(page);
  await page.getByTestId(`body-${a.id}`).click();
  await page.keyboard.press('m');
  await page.getByRole('checkbox', { name: 'Siirrä kopio', exact: true }).check();
  await page.getByTestId('move-x').fill('650');
  await page.getByTestId('move-x').press('Enter');
  await expect(page.getByRole('button', { name: 'Toista', exact: true })).toBeVisible();
  await page.getByLabel('Lisätoistojen määrä').fill('3');
  await page.screenshot({ path: info.outputPath('repeat-copy.png') });
  await page.getByRole('button', { name: 'Toista', exact: true }).click();
  const result = await save(page);
  expect(result.bodies).toHaveLength(10);
  expect(result.groups).toHaveLength(10);
  const linked = result.bodies.filter((b) => b.component);
  expect(linked.map((b) => b.origin[0])).toEqual([0, 650, 1300, 1950, 2600]);
  expect(new Set(linked.map((b) => b.component!.id)).size).toBe(1);
  await page.getByLabel('Lisätoistojen määrä').fill('1');
  await page.getByRole('button', { name: 'Toista', exact: true }).click();
  expect((await save(page)).bodies.at(-2)!.origin[0]).toBe(3250);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual(result.bodies);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toHaveLength(4);
});

for (const tool of ['v', 'm'])
  test(`window and crossing selection with Shift work in ${tool}`, async ({ page }, info) => {
    const a = makeBody(100, 100, 30);
    const b = makeBody(100, 100, 30, [250, 0, 0]);
    const c = makeBody(100, 100, 30, [500, 0, 0]);
    await ready(page, [a, b, c]);
    const p = await view(page, [a, b, c]);
    await page.keyboard.press(tool);
    const dragBox = async (from: Vec3, to: Vec3, mode: string) => {
      await page.mouse.move(p(...from).x, p(...from).y);
      await page.mouse.down();
      await page.mouse.move(p(...to).x, p(...to).y, { steps: 7 });
      await expect(page.getByTestId('selection-box')).toHaveAttribute('data-mode', mode);
      if (tool === 'v') await page.screenshot({ path: info.outputPath(`${mode}-selection.png`) });
      await page.mouse.up();
    };
    await dragBox([-40, -40, 30], [300, 140, 30], 'window');
    await expect(page.getByTestId(`body-${a.id}`)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId(`body-${b.id}`)).toHaveAttribute('aria-pressed', 'false');
    await dragBox([300, 140, 30], [-40, -40, 30], 'crossing');
    await expect(page.getByTestId(`body-${a.id}`)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId(`body-${b.id}`)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId(`body-${c.id}`)).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.down('Shift');
    await dragBox([550, 140, 30], [450, -40, 30], 'crossing');
    await page.keyboard.up('Shift');
    for (const part of [a, b, c])
      await expect(page.getByTestId(`body-${part.id}`)).toHaveAttribute('aria-pressed', 'true');
    expect((await save(page)).bodies).toEqual([a, b, c]);
  });
