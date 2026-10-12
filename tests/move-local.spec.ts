import { test, expect, type Page } from '@playwright/test';
import { Camera, Vector3 } from 'three';
import { makeBody, type Vec3, type Guide } from '../src/model/project';
import { rotatePoint, rotateVector } from '../src/model/transforms';
import { add, scale, sub, dot } from '../src/model/geometry';
import { ready, view, save } from './helpers';

async function at(page: Page, point: Vec3) {
  const canvas = page.getByTestId('viewport'),
    box = (await canvas.boundingBox())!;
  const data = JSON.parse((await canvas.getAttribute('data-camera'))!);
  const camera = new Camera();
  camera.position.fromArray(data.position);
  camera.quaternion.fromArray(data.quaternion);
  camera.projectionMatrix.fromArray(data.projection);
  camera.updateMatrixWorld();
  const p = new Vector3(...point).project(camera);
  return { x: box.x + ((p.x + 1) * box.width) / 2, y: box.y + ((1 - p.y) * box.height) / 2 };
}
async function stair(page: Page, guides: Guide[] = []) {
  const body = makeBody(200, 40, 40),
    axis: Vec3 = [0, 1, 0],
    pivot: Vec3 = [100, 20, 20];
  await ready(page, [body], guides);
  await page.getByTestId(`body-${body.id}`).click();
  await page.keyboard.press('r');
  await page.getByRole('button', { name: 'Kierrä Y-akselin ympäri' }).click();
  await page.getByTestId('rotation-angle').fill('-30');
  await page.getByTestId('rotation-angle').press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  const rotated = (await save(page)).bodies[0];
  await view(page, [rotated], 'front');
  await page.keyboard.press('m');
  return {
    body: rotated,
    start: rotatePoint([200, 0, 40], pivot, axis, -30),
    direction: rotateVector([1, 0, 0], axis, -30),
  };
}
async function drag(page: Page, start: Vec3, end: Vec3) {
  const a = await at(page, start),
    b = await at(page, end);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-move-axis', 'local');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-visible-move-axis', 'local');
}

for (const [sign, typed] of [
  [-1, '20'],
  [1, '20'],
  [1, '-20'],
] as const)
  test(`typed ${typed} mm follows the sloped stair in travel direction ${sign}, preserves its shape and undoes`, async ({
    page,
  }, info) => {
    const { body, start, direction } = await stair(page);
    await drag(page, start, add(start, scale(direction, 62 * sign)));
    await expect(page.getByTestId('move-distance')).toHaveValue('60');
    const end = JSON.parse((await page.getByTestId('viewport').getAttribute('data-move-end'))!);
    expect(Math.hypot(...sub(end, start))).toBeCloseTo(60, 5);
    await page.keyboard.type(typed);
    await expect(page.getByTestId('move-distance')).toHaveValue(typed);
    await expect(page.locator('.move-axis-label')).toContainText('20 mm');
    const typedEnd = JSON.parse(
      (await page.getByTestId('viewport').getAttribute('data-move-end'))!,
    );
    expect(Math.hypot(...sub(typedEnd, start))).toBeCloseTo(20, 5);
    await page.screenshot({ path: info.outputPath('magenta-local-move.png') });
    await page.keyboard.press('Enter');
    await page.mouse.up();
    await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
    const result = (await save(page)).bodies[0],
      delta = sub(result.origin, body.origin);
    delta.forEach((n, i) => expect(n).toBeCloseTo(direction[i] * Number(typed) * sign, 5));
    expect(result.feature).toEqual(body.feature);
    await page.getByRole('button', { name: 'Peru', exact: true }).click();
    expect((await save(page)).bodies[0]).toEqual(body);
  });

test('Shift projects an off-plane measurement reference along the slope and Ctrl latches a copy', async ({
  page,
}) => {
  const target: Vec3 = [230, -80, 125];
  const guide: Guide = {
    id: 'reference',
    mode: 'free',
    anchor: { point: target },
    endAnchor: { point: [230, -80, 155] },
    direction: [0, 0, 1],
    plane: 'XZ',
    angle: 90,
    length: 30,
  };
  const { body, start, direction } = await stair(page, [guide]);
  await drag(page, start, add(start, scale(direction, 40)));
  await page.keyboard.down('Shift');
  const p = await at(page, target);
  await page.mouse.move(p.x, p.y, { steps: 5 });
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-move-snap', 'reference:start');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-move-axis', 'local');
  await page.keyboard.up('Shift');
  await page.keyboard.press('Control');
  await page.mouse.up();
  await expect(page.locator('.object-list .object-select')).toHaveCount(2);
  const result = await save(page),
    copy = result.bodies.find((b) => b.id !== body.id)!;
  const expected = scale(direction, dot(sub(target, start), direction));
  sub(copy.origin, body.origin).forEach((n, i) => expect(n).toBeCloseTo(expected[i], 4));
  expect(result.bodies[0].origin).toEqual(body.origin);
  await page.getByRole('textbox', { name: 'Lisätoistojen määrä' }).fill('2');
  await page.getByRole('button', { name: 'Toista', exact: true }).click();
  await expect(page.locator('.object-list .object-select')).toHaveCount(4);
  const repeated = await save(page);
  repeated.bodies.slice(1).forEach((part, index) => {
    sub(part.origin, body.origin).forEach((n, i) =>
      expect(n).toBeCloseTo(expected[i] * (index + 1), 4),
    );
  });
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual(result.bodies);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual([body]);
});

test('world-axis override replaces a typed local distance and Escape cancels the preview', async ({
  page,
}) => {
  const { body, start, direction } = await stair(page);
  await drag(page, start, add(start, scale(direction, -50)));
  await page.keyboard.type('20');
  await page.keyboard.press('Tab');
  // Return focus to canvas without releasing the held move gesture.
  await page.getByTestId('viewport').focus();
  await page.keyboard.press('x');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-move-axis', 'x');
  await expect(page.getByTestId('move-distance')).toHaveCount(0);
  await expect(page.getByTestId('move-y')).toHaveValue('0');
  await expect(page.getByTestId('move-z')).toHaveValue('0');
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect((await save(page)).bodies[0]).toEqual(body);
});
