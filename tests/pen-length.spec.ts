import { test, expect, type Page } from '@playwright/test';
import { ready, view, click, save } from './helpers';
import type { Vec3 } from '../src/model/project';
import { makeBody } from '../src/model/project';
import { Camera, Vector3 } from 'three';

async function penData(page: Page, attribute: 'hover' | 'points') {
  return JSON.parse((await page.getByTestId('viewport').getAttribute(`data-pen-${attribute}`))!);
}
async function preview(page: Page, expected: Vec3) {
  await expect
    .poll(async () => {
      const actual = await penData(page, 'hover');
      return actual
        ? Math.hypot(...actual.map((n: number, i: number) => n - expected[i]))
        : Infinity;
    })
    .toBeLessThan(1e-6);
}

test('free pen snapping keeps a real off-plane vertex exact in perspective', async ({ page }) => {
  const floor = makeBody(400, 300, 20, [0, 0, -20]);
  const block = makeBody(50, 50, 50, [250, 150, 63]);
  await ready(page, [floor, block]);
  const project = async (point: Vec3) => {
    const viewport = page.getByTestId('viewport');
    const rect = (await viewport.boundingBox())!;
    const data = JSON.parse((await viewport.getAttribute('data-camera'))!);
    const camera = new Camera();
    camera.position.fromArray(data.position);
    camera.quaternion.fromArray(data.quaternion);
    camera.projectionMatrix.fromArray(data.projection);
    camera.updateMatrixWorld();
    const p = new Vector3(...point).project(camera);
    return { x: rect.x + ((p.x + 1) * rect.width) / 2, y: rect.y + ((1 - p.y) * rect.height) / 2 };
  };
  await view(page, [floor, block]);
  await page.getByRole('button', { name: 'Yleisnäkymä', exact: true }).click();
  await page.keyboard.press('k');
  await click(page, await project([0, 0, 0]));
  const target: Vec3 = [300, 150, 113];
  const point = await project(target);
  await page.mouse.move(point.x, point.y);
  await preview(page, target);
  await click(page, point);
  await expect.poll(async () => (await penData(page, 'points'))[1]).toEqual(target);
});

for (const rotated of [false, true])
  test(`successive screen directions accept 92, 15 and 19 mm with fresh keyboard focus ${rotated ? 'after orbit' : 'from the back'}`, async ({
    page,
  }) => {
    await ready(page);
    await view(page, [], rotated ? 'top' : 'front');
    if (!rotated)
      await page.getByRole('button', { name: 'Näkymä: Takaa', exact: true }).press('Enter');
    const project = async (point: Vec3) => {
      await page.evaluate(() => new Promise(requestAnimationFrame));
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
    };
    await page.keyboard.press('k');
    await click(page, await project([0, 0, 0]));
    if (rotated) {
      const cube = (await page
        .getByRole('group', { name: 'Näkymäkuutio', exact: true })
        .boundingBox())!;
      await page.mouse.move(cube.x + cube.width / 2, cube.y + cube.height / 2);
      await page.mouse.down();
      await page.mouse.move(cube.x + cube.width / 2 + 65, cube.y + cube.height / 2 + 30, {
        steps: 8,
      });
      await page.mouse.up();
    }
    for (const [length, dx, dy] of [
      // Aim away from existing vertices: the last horizontal ray otherwise
      // passes within the snap radius of the first point at this zoom level.
      [92, 40, 0],
      [15, 0, -40],
      [19, -40, 0],
    ]) {
      const before = await penData(page, 'points'),
        start = before.at(-1) as Vec3,
        screen = await project(start);
      await page.mouse.move(screen.x + dx, screen.y + dy);
      await page.keyboard.type(String(length));
      await expect(page.getByTestId('pen-length')).toHaveValue(String(length));
      await page.keyboard.press('Enter');
      await expect(page.getByTestId('viewport')).toBeFocused();
      const after = await penData(page, 'points'),
        end = after.at(-1) as Vec3;
      expect(after).toHaveLength(before.length + 1);
      expect(Math.hypot(...end.map((n, i) => n - start[i]))).toBeCloseTo(length, 7);
      const drawn = await project(end),
        dot = (drawn.x - screen.x) * dx + (drawn.y - screen.y) * dy;
      expect(dot).toBeGreaterThan(0);
    }
    if (!rotated) await preview(page, [-73, 0, 15]);
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

test('blank XYZ fields mean zero and Shift still reaches the pen after numeric Enter', async ({
  page,
}) => {
  await ready(page);
  const p = await view(page, []);
  await page.keyboard.press('k');
  await click(page, p(0, 0));
  await page.mouse.move(p(180, 90).x, p(180, 90).y);
  await page.getByTestId('move-x').fill('');
  await page.getByTestId('move-y').fill('15');
  await page.getByTestId('move-z').fill('');
  await page.keyboard.press('Enter');
  await expect
    .poll(() => penData(page, 'points'))
    .toEqual([
      [0, 0, 0],
      [0, 15, 0],
    ]);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.mouse.move(p(200, 15).x, p(200, 15).y);
  await page.keyboard.down('Shift');
  await expect(page.getByTestId('pen-length')).toHaveAttribute(
    'aria-label',
    'Pituus lukitulla suunnalla',
  );
  await page.keyboard.up('Shift');
  await page.getByTestId('move-x').fill('');
  await page.getByTestId('move-y').fill('');
  await page.getByTestId('move-z').fill('');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect.poll(() => penData(page, 'points')).toHaveLength(2);
});

test('the unlock button releases a pen constraint without discarding the first point', async ({
  page,
}) => {
  await ready(page);
  const p = await view(page, []);
  await page.keyboard.press('k');
  await click(page, p(0, 0));
  await page.mouse.move(p(200, 0).x, p(200, 0).y);
  await page.keyboard.down('Shift');
  await page.getByRole('button', { name: 'Vapauta suuntalukko' }).click();
  await page.mouse.move(p(160, 220).x, p(160, 220).y);
  await preview(page, [160, 220, 0]);
  await expect.poll(() => penData(page, 'points')).toEqual([[0, 0, 0]]);
  await page.keyboard.up('Shift');
});

for (const axis of ['x', 'y', 'z'] as const) {
  test(`positive and negative lengths follow the negative ${axis.toUpperCase()} drawing direction`, async ({
    page,
  }) => {
    await ready(page);
    const p = await view(page, [], axis === 'z' ? 'front' : 'top');
    const i = { x: 0, y: 1, z: 2 }[axis];
    const pointer: Vec3 = [0, 0, 0];
    pointer[i] = -200;
    await page.keyboard.press('k');
    await click(page, p(0, 0, 0));
    await page.keyboard.press(axis);
    await page.mouse.move(p(...pointer).x, p(...pointer).y);
    await expect(page.getByTestId('pen-length')).toHaveValue('200');
    await page.keyboard.type('15');
    const end: Vec3 = [0, 0, 0];
    end[i] = -15;
    await preview(page, end);
    // Editing the sign repeatedly must not reorient the captured heading.
    await page.getByTestId('pen-length').fill('-15');
    end[i] = 15;
    await preview(page, end);
    await page.getByTestId('pen-length').fill('+15');
    end[i] = -15;
    await preview(page, end);
    // The pointer can cross the origin while typing without reversing the preview.
    pointer[i] = 200;
    await page.mouse.move(p(...pointer).x, p(...pointer).y);
    await preview(page, end);
    await page.keyboard.press('Enter');
    await expect.poll(() => penData(page, 'points')).toEqual([[0, 0, 0], end]);
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
    const body = (await save(page)).bodies[0];
    expect(body.origin[i]).toBeCloseTo(-15, 8);
    expect(body.feature[(['width', 'depth', 'height'] as const)[i]]).toBeCloseTo(15, 8);
  });
}

test('Shift diagonal input follows its direction, mouse click commits it and the next segment chooses a new heading', async ({
  page,
}) => {
  await ready(page);
  const p = await view(page, []);
  await page.keyboard.press('k');
  await click(page, p(0, 0, 0));
  await page.mouse.move(p(-180, -240).x, p(-180, -240).y);
  await page.keyboard.down('Shift');
  await expect(page.getByTestId('pen-length')).toBeVisible();
  const raw = (await penData(page, 'hover')) as Vec3;
  const length = Math.hypot(...raw);
  const end = raw.map((n) => (n * 15) / length) as Vec3;
  await page.keyboard.type('15');
  await preview(page, end);
  await click(page, p(150, 100));
  await page.keyboard.up('Shift');
  const points = await penData(page, 'points');
  points[1].forEach((n: number, i: number) => expect(n).toBeCloseTo(end[i], 8));
  // Use a new axis and heading, independent of the previous negative diagonal.
  await page.mouse.move(p(end[0], end[1] + 150).x, p(end[0], end[1] + 150).y);
  await page.keyboard.type('25');
  await preview(page, [end[0], end[1] + 25, end[2]]);
});

for (const axis of ['x', 'y', 'z'] as const) {
  test(`free ${axis.toUpperCase()} drawing starts in length, then Tab reaches its travel axis`, async ({
    page,
  }) => {
    await ready(page);
    const p = await view(page, [], axis === 'z' ? 'front' : 'top');
    const index = ['x', 'y', 'z'].indexOf(axis);
    const point: Vec3 = [0, 0, 0];
    point[index] = -200;
    await page.keyboard.press('k');
    await click(page, p(0, 0));
    await page.mouse.move(p(...point).x, p(...point).y);
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('pen-length')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByTestId(`move-${axis}`)).toBeFocused();
    await page.getByTestId('viewport').focus();
    await page.keyboard.type('15');
    await expect(page.getByTestId('pen-length')).toBeFocused();
    point[index] = -15;
    await preview(page, point);
    await page.getByTestId('pen-length').fill('-15');
    point[index] = 15;
    await preview(page, point);
    await page.keyboard.press('Enter');
    const points = await penData(page, 'points');
    points[1].forEach((n: number, i: number) => expect(n).toBeCloseTo(point[i], 8));
  });
}

test('a free pen segment can continue after the starting plane becomes edge-on to the camera', async ({
  page,
}) => {
  await ready(page);
  const top = await view(page, []);
  await page.keyboard.press('k');
  await click(page, top(0, 0));
  const front = await view(page, [], 'front');
  await page.mouse.move(front(140, 0, 200).x, front(140, 0, 200).y);
  await preview(page, [140, 0, 200]);
  await click(page, front(140, 0, 200));
  await expect.poll(async () => (await penData(page, 'points')).length).toBe(2);
});

test('Shift direction and typed length survive Shift release and changing the number sign', async ({
  page,
}) => {
  await ready(page);
  const p = await view(page, []);
  await page.keyboard.press('k');
  await click(page, p(0, 0));
  await page.mouse.move(p(-200, 0).x, p(-200, 0).y);
  await page.keyboard.down('Shift');
  await page.keyboard.type('15');
  await preview(page, [-15, 0, 0]);
  await page.keyboard.up('Shift');
  await page.getByTestId('pen-length').fill('-15');
  await preview(page, [15, 0, 0]);
  await page.keyboard.press('Enter');
  await expect
    .poll(() => penData(page, 'points'))
    .toEqual([
      [0, 0, 0],
      [expect.closeTo(15, 8), expect.closeTo(0, 8), expect.closeTo(0, 8)],
    ]);
});
