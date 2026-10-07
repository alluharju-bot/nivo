import { test, expect, type Page } from '@playwright/test';
import { Quaternion, Vector3 } from 'three';
import { ready, view } from './helpers';
import { makeBody } from '../src/model/project';

const state = async (page: Page) =>
  JSON.parse((await page.getByTestId('viewport').getAttribute('data-camera'))!);
const direction = (s: Awaited<ReturnType<typeof state>>) =>
  new Vector3(0, 0, 1).applyQuaternion(new Quaternion(...s.quaternion));

test('cube rotates with one touch without starting a drawing gesture', async ({ page }, info) => {
  test.skip(info.project.name !== 'tablet', 'Touch input profile');
  const body = makeBody(400, 300, 100);
  await ready(page, [body]);
  await view(page, [body]);
  await page.keyboard.press('k');
  const cube = page.getByRole('group', { name: 'Näkymäkuutio' });
  const rect = (await cube.boundingBox())!;
  const start = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, id: 1 };
  const before = await state(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ ...start, x: start.x + 30, y: start.y + 20 }],
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect
    .poll(async () => direction(await state(page)).angleTo(direction(before)))
    .toBeGreaterThan(0.2);
  expect((await state(page)).zoom).toBe(before.zoom);
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-pen-points', '[]');
  await cdp.detach();
});

test('top-view orbit tilts in both screen directions without roll or a dead pole', async ({
  page,
}) => {
  const body = makeBody(400, 300, 100);
  await ready(page, [body]);
  for (const [dx, dy] of [
    [80, 0],
    [-80, 0],
    [0, 80],
    [0, -80],
  ]) {
    const p = await view(page, [body]);
    const start = p(200, 150, 100);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down({ button: 'right' });
    const before = await state(page);
    const pivot = JSON.parse(
      (await page.getByTestId('viewport').getAttribute('data-orbit-pivot'))!,
    );
    const radius = new Vector3(...before.position).distanceTo(new Vector3(...pivot));
    await page.mouse.move(start.x + dx, start.y + dy, { steps: 8 });
    await page.mouse.up({ button: 'right' });
    const after = await state(page);
    expect(direction(after).angleTo(direction(before))).toBeGreaterThan(0.3);
    expect(direction(after).z).toBeGreaterThan(0.5);
    expect(
      Math.hypot(...after.position.map((n: number, i: number) => n - after.target[i])),
    ).toBeCloseTo(radius, 4);
  }
});

test('cube face clicks and view buttons preserve zoom, and cube dragging rotates the view', async ({
  page,
}, info) => {
  const body = makeBody(400, 300, 100);
  await ready(page, [body]);
  const p = await view(page, [body]);
  await page.mouse.move(p(210, 160, 100).x, p(210, 160, 100).y);
  await page.mouse.wheel(0, -500);
  await expect.poll(async () => (await state(page)).zoom).toBeGreaterThan(1.1);
  const zoomed = await state(page);
  // A keyboard activation also exposes all six views without needing to orbit first.
  const front = page.getByRole('button', { name: 'Näkymä: Edestä', exact: true });
  await front.focus();
  await page.keyboard.press('Enter');
  await expect
    .poll(async () => direction(await state(page)).distanceTo(new Vector3(0, -1, 0)))
    .toBeLessThan(1e-6);
  const after = await state(page);
  expect(after.zoom).toBeCloseTo(zoomed.zoom, 8);
  after.target.forEach((n: number, i: number) => expect(n).toBeCloseTo(zoomed.target[i], 8));
  expect(direction(after).distanceTo(new Vector3(0, -1, 0))).toBeLessThan(1e-6);
  // The visible face is clickable; a drag must not finish by also selecting its view.
  await front.click();
  const cube = page.getByRole('group', { name: 'Näkymäkuutio' });
  const rect = (await cube.boundingBox())!;
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width / 2 + 34, rect.y + rect.height / 2 + 22, { steps: 8 });
  await page.mouse.up();
  const dragged = await state(page);
  expect(direction(dragged).angleTo(direction(after))).toBeGreaterThan(0.2);
  expect(dragged.zoom).toBeCloseTo(zoomed.zoom, 8);
  await page.screenshot({ path: info.outputPath('view-cube-orbit.png') });
  await page.getByRole('button', { name: 'Ylhäältä', exact: true }).click();
  expect((await state(page)).zoom).toBeCloseTo(zoomed.zoom, 8);
  await page.screenshot({ path: info.outputPath('view-cube.png') });
  await page.getByRole('button', { name: 'Sovita näkymään', exact: true }).click();
  await expect.poll(async () => (await state(page)).zoom).toBe(1);
});
