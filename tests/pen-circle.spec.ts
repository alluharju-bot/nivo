import { test, expect } from '@playwright/test';
import { Camera, Vector3 } from 'three';
import { makeProfileBody, type Vec3 } from '../src/model/project';
import { sketchFrame, fromUV } from '../src/model/sketch';
import { ready, view, editBody, click, save } from './helpers';

test('pen snaps to and splits a zero-thickness circle in part edit mode', async ({ page }) => {
  const circle = makeProfileBody({ kind: 'circle', radius: 200 }, sketchFrame([0, 0, 0]), 0);
  await ready(page, [circle]);
  const p = await view(page, [circle]);
  await editBody(page, circle.id);
  await page.keyboard.press('k');
  const canvas = page.getByTestId('viewport');
  for (const [x, y] of [
    [200, 0],
    [0, 200],
    [-200, 0],
    [0, -200],
    [0, 0],
  ]) {
    await page.mouse.move(p(x, y).x, p(x, y).y);
    await expect
      .poll(async () => {
        const point = JSON.parse((await canvas.getAttribute('data-snap-point')) || 'null');
        return point ? Math.hypot(point[0] - x, point[1] - y, point[2]) : Infinity;
      })
      .toBeLessThan(0.0001);
    await expect(canvas).toHaveAttribute('data-snap-key', new RegExp(circle.id));
  }
  await click(page, p(-200, 0));
  await click(page, p(200, 0));
  await expect(page.locator('.status-bar [role="status"]')).toContainText('Pinta jaettu');
  const result = await save(page);
  expect(result.bodies).toHaveLength(1);
  expect(result.bodies[0].feature.type).toBe('brep');
});

for (const normal of [
  [0, 0, 1],
  [0, -1, 0],
  [0, -0.6, 0.8],
] as Vec3[])
  test(`pen circle on another face in perspective ${normal.join(',')}`, async ({ page }) => {
    const frame = sketchFrame([6000, 5000, 800], normal);
    const circle = makeProfileBody({ kind: 'circle', radius: 200 }, frame, 0);
    const support = makeProfileBody({ kind: 'circle', radius: 350 }, frame, -30);
    await ready(page, [support, circle]);
    await view(page, [support, circle]);
    await page.getByRole('button', { name: 'Yleisnäkymä', exact: true }).click();
    await editBody(page, circle.id);
    await page.keyboard.press('k');
    const canvas = page.getByTestId('viewport');
    const data = JSON.parse((await canvas.getAttribute('data-camera'))!);
    const camera = new Camera();
    camera.position.fromArray(data.position);
    camera.quaternion.fromArray(data.quaternion);
    camera.projectionMatrix.fromArray(data.projection);
    camera.updateMatrixWorld();
    const box = (await canvas.boundingBox())!;
    for (const uv of [
      [200, 0],
      [0, 200],
      [-200, 0],
      [0, -200],
      [0, 0],
      [120, 160],
    ] as [number, number][]) {
      const target = fromUV(uv, frame),
        q = new Vector3(...target).project(camera);
      await page.mouse.move(
        box.x + ((q.x + 1) * box.width) / 2,
        box.y + ((1 - q.y) * box.height) / 2,
      );
      await expect
        .poll(async () => {
          const point = JSON.parse((await canvas.getAttribute('data-snap-point')) || 'null');
          // Arbitrary curved-edge hit can move < 1 mm due to integer pointer pixels.
          return point ? Math.hypot(...target.map((n, i) => n - point[i])) : Infinity;
        })
        .toBeLessThan(uv[0] === 120 ? 1 : 0.0001);
      await expect(canvas).toHaveAttribute(
        'data-snap-key',
        new RegExp(`${circle.id}|${support.id}`),
      );
    }
  });
