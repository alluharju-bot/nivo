import { test, expect, type Page } from '@playwright/test';
import { Camera, Vector3 } from 'three';
import { makeProfileBody, type Vec3 } from '../src/model/project';
import { sketchFrame, fromUV } from '../src/model/sketch';
import { ready, view, editBody, click, save } from './helpers';

async function screenProjection(page: Page) {
  const canvas = page.getByTestId('viewport');
  const data = JSON.parse((await canvas.getAttribute('data-camera'))!);
  const camera = new Camera();
  camera.position.fromArray(data.position);
  camera.quaternion.fromArray(data.quaternion);
  camera.projectionMatrix.fromArray(data.projection);
  camera.updateMatrixWorld();
  const box = (await canvas.boundingBox())!;
  return (point: Vec3) => {
    const q = new Vector3(...point).project(camera);
    return { x: box.x + ((q.x + 1) * box.width) / 2, y: box.y + ((1 - q.y) * box.height) / 2 };
  };
}

for (const editing of [false, true])
  test(`pen starts on a circle away from the origin and extends outward (edit=${editing})`, async ({
    page,
  }) => {
    // The camera is in front of the circle but beyond the global Y=0 plane.
    // Picking that unrelated plane would reject every click despite a visible snap.
    const circle = makeProfileBody(
      { kind: 'circle', radius: 200 },
      sketchFrame([6000, 5000, 800], [0, -1, 0]),
      0,
    );
    await ready(page, [circle]);
    const p = await view(page, [circle], 'front');
    if (editing) await editBody(page, circle.id);
    await page.keyboard.press('k');
    const canvas = page.getByTestId('viewport');
    await click(page, p(6000, 5000, 1000));
    await expect
      .poll(async () => JSON.parse((await canvas.getAttribute('data-pen-points'))!))
      .toEqual([[6000, 5000, 1000]]);
    await page.keyboard.press('x');
    const end = p(6250, 5000, 950);
    await page.mouse.move(end.x, end.y);
    await expect
      .poll(async () => JSON.parse((await canvas.getAttribute('data-pen-hover')) || 'null'))
      .toEqual([6250, 5000, 1000]);
    await click(page, end);
    await expect
      .poll(async () => JSON.parse((await canvas.getAttribute('data-pen-points'))!).length)
      .toBe(2);
    await page.keyboard.press('Enter');
    await expect(page.locator('.status-bar [role="status"]')).toContainText('Piirrosviiva valmis');
    const result = await save(page);
    expect(result.bodies).toHaveLength(2);
    const wire = result.bodies.find((b) => b.id !== circle.id)!;
    expect(wire.origin).toEqual([6000, 5000, 1000]);
    expect(wire.feature.width).toBeCloseTo(250);
    expect(wire.feature.depth).toBeCloseTo(0);
    expect(wire.feature.height).toBeCloseTo(0);
  });

test('rectangle starts at an exact circular rim between display mesh vertices in edit mode', async ({
  page,
}) => {
  const circle = makeProfileBody(
    { kind: 'circle', radius: 200 },
    sketchFrame([6000, 5000, 800], [0, -1, 0]),
    0,
  );
  await ready(page, [circle]);
  const p = await view(page, [circle], 'front');
  await editBody(page, circle.id);
  await page.keyboard.press('s');
  // Use the lower arc so the edit-mode toolbar cannot cover the test target
  // in a shorter tablet viewport.
  await click(page, p(6120, 5000, 640));
  await click(page, p(5900, 5000, 900));
  await expect(page.locator('.status-bar [role="status"]')).toContainText('Pinta jaettu');
  const result = await save(page);
  expect(result.bodies).toHaveLength(1);
  expect(result.bodies[0].feature.type).toBe('brep');
});

test('a perspective pen stroke from a circle accepts an axis and a typed length', async ({
  page,
}) => {
  const circle = makeProfileBody(
    { kind: 'circle', radius: 200 },
    sketchFrame([6000, 5000, 800], [0, -1, 0]),
    0,
  );
  await ready(page, [circle]);
  await view(page, [circle]);
  await page.getByRole('button', { name: 'Yleisnäkymä', exact: true }).click();
  await editBody(page, circle.id);
  await page.keyboard.press('k');
  const canvas = page.getByTestId('viewport');
  const p = await screenProjection(page);
  await click(page, p([6000, 5000, 600]));
  await expect
    .poll(async () => JSON.parse((await canvas.getAttribute('data-pen-points'))!))
    .toEqual([[6000, 5000, 600]]);
  await page.keyboard.press('x');
  const end = p([6200, 5000, 600]);
  await page.mouse.move(end.x, end.y);
  await expect
    .poll(async () => JSON.parse((await canvas.getAttribute('data-pen-hover'))!)[0])
    .toBeGreaterThan(6100);
  await page.keyboard.type('250');
  await page.keyboard.press('Enter');
  await expect
    .poll(async () => JSON.parse((await canvas.getAttribute('data-pen-points'))!))
    .toEqual([
      [6000, 5000, 600],
      [6250, 5000, 600],
    ]);
  await page.keyboard.press('Enter');
  await expect(page.locator('.status-bar [role="status"]')).toContainText('Piirrosviiva valmis');
  const result = await save(page);
  expect(result.bodies).toHaveLength(2);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toHaveLength(1);
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  expect((await save(page)).bodies).toEqual(result.bodies);
});

test('pen snaps to and splits a zero-thickness circle in part edit mode', async ({ page }) => {
  const circle = makeProfileBody({ kind: 'circle', radius: 200 }, sketchFrame([0, 0, 0]), 0);
  await ready(page, [circle]);
  await editBody(page, circle.id);
  const initial = await view(page, [circle]);
  const canvas = page.getByTestId('viewport');
  // Keep the top cardinal point clear of the edit toolbar on tablet too.
  await page.mouse.move(initial(0, 0).x, initial(0, 0).y);
  for (let i = 0; i < 5; i++) {
    const before = await canvas.getAttribute('data-camera');
    await page.mouse.wheel(0, 260);
    await expect.poll(() => canvas.getAttribute('data-camera')).not.toBe(before);
  }
  const project = await screenProjection(page);
  const p = (x: number, y: number) => project([x, y, 0]);
  await page.keyboard.press('k');
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
