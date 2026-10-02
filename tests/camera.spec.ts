import { expect, test, type Page } from '@playwright/test';
import * as THREE from 'three';
import { makeBody, type Vec3 } from '../src/model/project';
import { ready, view, editBody } from './helpers';

async function camera(page: Page) {
  return JSON.parse((await page.getByTestId('viewport').getAttribute('data-camera'))!) as {
    position: Vec3;
    quaternion: [number, number, number, number];
    projection: number[];
    target: Vec3;
    zoom: number;
  };
}
async function screenPoint(page: Page, point: Vec3) {
  const state = await camera(page);
  const c = new THREE.Camera();
  c.position.fromArray(state.position);
  c.quaternion.fromArray(state.quaternion);
  c.projectionMatrix.fromArray(state.projection);
  c.updateMatrixWorld();
  const p = new THREE.Vector3(...point).project(c);
  const rect = (await page.getByTestId('viewport').boundingBox())!;
  return { x: rect.x + ((p.x + 1) * rect.width) / 2, y: rect.y + ((1 - p.y) * rect.height) / 2 };
}
function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

for (const projection of ['perspective', 'orthographic']) {
  test(`wheel zoom keeps the point under the cursor in ${projection}`, async ({ page }) => {
    const part = makeBody(400, 300, 100);
    await ready(page, [part]);
    if (projection === 'orthographic') await view(page, [part]);
    const point: Vec3 = [280, 180, 100];
    const before = await screenPoint(page, point);
    const initial = await camera(page);
    await page.mouse.move(before.x, before.y);
    await page.mouse.wheel(0, -400);
    await expect
      .poll(async () => JSON.stringify(await camera(page)))
      .not.toBe(JSON.stringify(initial));
    // Browser wheel events quantize the synthetic cursor to CSS pixels.
    expect(distance(await screenPoint(page, point), before)).toBeLessThan(1);
    const zoomed = await camera(page);
    await page.mouse.wheel(0, 400);
    await expect
      .poll(async () => JSON.stringify(await camera(page)))
      .not.toBe(JSON.stringify(zoomed));
    expect(distance(await screenPoint(page, point), before)).toBeLessThan(1);
  });
}

test('selection, editing and groups set the working center without moving the view', async ({
  page,
}) => {
  const group = { id: crypto.randomUUID(), name: 'Runko', hidden: false, locked: false };
  const a = { ...makeBody(200, 200, 100, [0, 0, 0], 'Vasen'), groupId: group.id };
  const b = { ...makeBody(300, 200, 200, [500, 0, 0], 'Oikea'), groupId: group.id };
  await ready(page, [a, b], [], [group]);
  await view(page, [a, b]);
  const before = await camera(page);
  await page.getByTestId(`body-${a.id}`).click();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-camera-focus', '[100,100,50]');
  let after = await camera(page);
  expect(after.position).toEqual(before.position);
  expect(after.quaternion).toEqual(before.quaternion);
  await editBody(page, a.id);
  // A blank click clears selection but must not move the editing pivot to the whole scene.
  const rect = (await page.getByTestId('viewport').boundingBox())!;
  await page.mouse.click(rect.x + rect.width * 0.8, rect.y + rect.height * 0.8);
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-camera-focus', '[100,100,50]');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-editing-body', a.id);
  await page.getByRole('button', { name: 'Lopeta muokkaus', exact: true }).click();
  await page.getByRole('button', { name: 'Valitse ryhmä: Runko', exact: true }).click();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-camera-focus', '[400,100,100]');
  after = await camera(page);
  expect(after.position).toEqual(before.position);
  expect(after.quaternion).toEqual(before.quaternion);
});

test('orbit stays on the selected part after cursor zoom and still allows panning', async ({
  page,
}) => {
  const a = makeBody(200, 200, 100, [0, 0, 0], 'Vasen');
  const b = makeBody(300, 200, 100, [600, 0, 0], 'Oikea');
  await ready(page, [a, b]);
  await page.getByTestId(`body-${a.id}`).click();
  const pivot: Vec3 = [100, 100, 50];
  const cursor = await screenPoint(page, [150, 100, 100]);
  await page.mouse.move(cursor.x, cursor.y);
  const initial = await camera(page);
  await page.mouse.wheel(0, -200);
  await expect.poll(async () => (await camera(page)).position).not.toEqual(initial.position);
  expect(distance(await screenPoint(page, [150, 100, 100]), cursor)).toBeLessThan(1);
  const before = await screenPoint(page, pivot);
  const radius = new THREE.Vector3(...(await camera(page)).position).distanceTo(
    new THREE.Vector3(...pivot),
  );
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(cursor.x + 90, cursor.y + 40, { steps: 12 });
  await page.mouse.up({ button: 'right' });
  expect(distance(await screenPoint(page, pivot), before)).toBeLessThan(0.2);
  expect(
    new THREE.Vector3(...(await camera(page)).position).distanceTo(new THREE.Vector3(...pivot)),
  ).toBeCloseTo(radius, 5);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(cursor.x + 160, cursor.y + 40, { steps: 8 });
  await page.mouse.up({ button: 'middle' });
  expect(distance(await screenPoint(page, pivot), before)).toBeGreaterThan(30);
});

test('pinch zoom uses the fingers midpoint and keeps editing active', async ({ page }, info) => {
  test.skip(info.project.name !== 'tablet', 'Touch input profile');
  const part = makeBody(400, 300, 100);
  await ready(page, [part]);
  await view(page, [part]);
  await editBody(page, part.id);
  const point: Vec3 = [280, 180, 100];
  const before = await screenPoint(page, point);
  const initial = await camera(page);
  const cdp = await page.context().newCDPSession(page);
  for (let i = 0; i <= 6; i++) {
    const half = 40 + i * 8;
    await cdp.send('Input.dispatchTouchEvent', {
      type: i === 0 ? 'touchStart' : 'touchMove',
      touchPoints: [
        { x: before.x - half, y: before.y, id: 1 },
        { x: before.x + half, y: before.y, id: 2 },
      ],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  expect((await camera(page)).zoom).toBeGreaterThan(initial.zoom);
  expect(distance(await screenPoint(page, point), before)).toBeLessThan(2);
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-editing-body', part.id);
});
