import { test, expect } from '@playwright/test';
import { makeBody, type Vec3 } from '../src/model/project';
import { ready, view, click, save } from './helpers';

for (const side of ['top', 'front', 'right'] as const)
  test(`Shift push/pull picks exact corners, midpoints, edges and body centers in ${side} view`, async ({
    page,
  }) => {
    const source = makeBody(200, 200, 200);
    const target =
      side === 'top'
        ? makeBody(220, 160, 123, [400, 0, 7])
        : side === 'front'
          ? makeBody(220, 160, 160, [400, -73, 0])
          : makeBody(220, 160, 160, [73, 400, 0]);
    target.locked = true;
    const anchors: [string, Vec3][] =
      side === 'top'
        ? [
            ['vertex', [400, 0, 130]],
            ['midpoint', [510, 0, 130]],
            ['edge', [450, 0, 130]],
            ['center', [510, 80, 68.5]],
          ]
        : side === 'front'
          ? [
              ['vertex', [400, -73, 160]],
              ['midpoint', [510, -73, 160]],
              ['edge', [450, -73, 160]],
              ['center', [510, 7, 80]],
            ]
          : [
              ['vertex', [293, 400, 160]],
              ['midpoint', [293, 480, 160]],
              ['edge', [293, 440, 160]],
              ['center', [183, 480, 80]],
            ];
    await ready(page, [source, target]);
    const p = await view(page, [source, target], side);
    const start: Vec3 =
      side === 'top' ? [100, 100, 200] : side === 'front' ? [100, 0, 100] : [200, 100, 100];
    const ownCorner: Vec3 =
      side === 'top' ? [0, 0, 200] : side === 'front' ? [0, 0, 200] : [200, 0, 200];
    const axis = side === 'top' ? 2 : side === 'front' ? 1 : 0;
    const sign = side === 'front' ? -1 : 1;
    const canvas = page.getByTestId('viewport');
    await page.keyboard.press('e');
    await click(page, p(...start));
    await page.keyboard.down('Shift');
    for (const q of [start, ownCorner]) {
      await page.mouse.move(p(...q).x, p(...q).y);
      await expect(canvas).toHaveAttribute('data-depth-target', '');
    }
    for (const [kind, point] of anchors) {
      const at = p(...point);
      await page.mouse.move(at.x, at.y);
      await expect(canvas).toHaveAttribute('data-depth-kind', kind);
      const snapped = JSON.parse((await canvas.getAttribute('data-snap-point'))!) as Vec3;
      for (let i = 0; i < 3; i++) expect(snapped[i]).toBeCloseTo(point[i], kind === 'edge' ? 3 : 6);
      await expect
        .poll(async () => Number(await page.getByTestId('height-input').inputValue()))
        .toBeCloseTo(sign * (point[axis] - start[axis]), 6);
    }
    if (side === 'top')
      await page.screenshot({ path: test.info().outputPath('pushpull-anchor.png') });
    const exact = await page.getByTestId('height-input').inputValue();
    await page.keyboard.up('Shift');
    const endPoint = p(...anchors.at(-1)![1]);
    await page.mouse.move(endPoint.x, endPoint.y);
    await expect(page.getByTestId('height-input')).toHaveValue(exact);
    await page.keyboard.down('Shift');
    await click(page, p(...anchors.at(-1)![1]));
    await page.keyboard.up('Shift');
    await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
    const model = await save(page),
      body = model.bodies[0];
    const end =
      sign < 0
        ? body.origin[axis]
        : body.origin[axis] + [body.feature.width, body.feature.depth, body.feature.height][axis];
    expect(end).toBeCloseTo(anchors.at(-1)![1][axis], 6);
    expect(model.bodies[1]).toEqual(target);
  });

test('touch target picker uses the same exact corner despite the grid', async ({ page }) => {
  const source = makeBody(200, 200, 40),
    target = makeBody(220, 160, 72.625, [400, 0, 0]);
  await ready(page, [source, target]);
  const p = await view(page, [source, target]);
  await page.keyboard.press('e');
  await click(page, p(100, 100, 40));
  await page.getByRole('button', { name: 'Poimi tavoitemitta', exact: true }).click();
  await click(page, p(400, 0, 72.625));
  await expect(page.getByTestId('height-input')).toHaveValue('+32.625');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  expect((await save(page)).bodies[0].feature.height).toBe(72.625);
});

test('Shift push/pull also takes an exact level from a construction guide', async ({ page }) => {
  const source = makeBody(200, 200, 40);
  await ready(
    page,
    [source],
    [
      {
        id: 'depth-guide',
        mode: 'guide',
        anchor: { point: [0, 250, 72.625] },
        direction: [1, 0, 0],
        plane: 'XY',
        angle: 0,
        length: 500,
      },
    ],
  );
  const p = await view(page, [source]);
  await page.keyboard.press('e');
  await click(page, p(100, 100, 40));
  await page.keyboard.down('Shift');
  const at = p(100, 250, 72.625);
  await page.mouse.move(at.x, at.y);
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-depth-kind', 'guide');
  await expect(page.getByTestId('height-input')).toHaveValue('+32.625');
  await click(page, at);
  await page.keyboard.up('Shift');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  expect((await save(page)).bodies[0].feature.height).toBe(72.625);
});

test('E on a highlighted face can immediately use Shift without another source click', async ({
  page,
}) => {
  const source = makeBody(200, 200, 40),
    target = makeBody(220, 160, 72.625, [400, 0, 0]);
  await ready(page, [source, target]);
  const p = await view(page, [source, target]);
  const start = p(100, 100, 40),
    end = p(400, 0, 72.625);
  await page.mouse.move(start.x, start.y);
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-hover-face', 'z:max');
  await page.keyboard.press('e');
  await expect(page.getByTestId('height-input')).toBeVisible();
  await page.keyboard.down('Shift');
  await page.mouse.move(end.x, end.y);
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-depth-kind', 'vertex');
  await expect(page.getByTestId('height-input')).toHaveValue('+32.625');
  await click(page, end);
  await page.keyboard.up('Shift');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  const result = await save(page);
  expect(result.bodies[0].feature.height).toBe(72.625);
  expect(result.bodies[1]).toEqual(target);
});
