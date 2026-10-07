import { test, expect, type Page } from '@playwright/test';
import { Quaternion, Vector3 } from 'three';
import { ready, view } from './helpers';
import { makeBody } from '../src/model/project';

const state = async (page: Page) =>
  JSON.parse((await page.getByTestId('viewport').getAttribute('data-camera'))!);
const direction = (s: Awaited<ReturnType<typeof state>>) =>
  new Vector3(0, 0, 1).applyQuaternion(new Quaternion(...s.quaternion));

test('curved orbit strokes and lifting the mouse preserve the horizon in perspective and from top', async ({
  page,
}) => {
  const body = makeBody(400, 300, 100);
  await ready(page, [body]);
  for (const fromTop of [false, true]) {
    await view(page, [body]);
    if (!fromTop) {
      await page.getByRole('button', { name: 'Yleisnäkymä', exact: true }).click();
      await expect.poll(async () => (await state(page)).projection[15]).toBe(0);
    }
    const canvas = page.getByTestId('viewport');
    const rect = (await canvas.boundingBox())!;
    const x = rect.x + rect.width * 0.45,
      y = rect.y + rect.height * 0.6;
    for (let i = 0; i < 5; i++) {
      const before = new Quaternion(...(await state(page)).quaternion);
      await page.mouse.move(x, y);
      await page.mouse.down({ button: 'right' });
      for (const [dx, dy] of [
        [60, 15],
        [120, 10],
        [180, 0],
      ]) {
        await page.mouse.move(x + dx, y + dy, { steps: 6 });
        const q = new Quaternion(...(await state(page)).quaternion);
        expect(Math.abs(new Vector3(1, 0, 0).applyQuaternion(q).z)).toBeLessThan(1e-6);
      }
      await page.mouse.up({ button: 'right' });
      await expect
        .poll(async () => new Quaternion(...(await state(page)).quaternion).angleTo(before))
        .toBeGreaterThan(0.5);
    }
  }
});

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

test('top-view orbit turns horizontally and leaves the pole with either vertical drag direction', async ({
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
    expect(
      new Quaternion(...after.quaternion).angleTo(new Quaternion(...before.quaternion)),
    ).toBeGreaterThan(0.3);
    if (dy) expect(direction(after).angleTo(direction(before))).toBeGreaterThan(0.3);
    expect(
      Math.abs(new Vector3(1, 0, 0).applyQuaternion(new Quaternion(...after.quaternion)).z),
    ).toBeLessThan(1e-6);
    expect(direction(after).z).toBeGreaterThan(0.5);
    expect(
      Math.hypot(...after.position.map((n: number, i: number) => n - after.target[i])),
    ).toBeCloseTo(radius, 4);
  }
});

test('cube preserves zoom, free rotation works and overview restores the whole model', async ({
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
  await page.getByRole('button', { name: 'Näkymä: Ylhäältä', exact: true }).press('Enter');
  expect((await state(page)).zoom).toBeCloseTo(zoomed.zoom, 8);
  await page.screenshot({ path: info.outputPath('view-cube.png') });
  await page.getByRole('button', { name: 'Sovita näkymään', exact: true }).click();
  await expect.poll(async () => (await state(page)).zoom).toBe(1);
  // View shortcuts are in one toolbar. Overview changes the camera, not the selection or display.
  await expect(page.getByRole('button', { name: /^(3D|Ylhäältä|Edestä|Sivulta)$/ })).toHaveCount(0);
  await page.mouse.click(p(210, 160, 100).x, p(210, 160, 100).y);
  await page.keyboard.press('2');
  await page.mouse.wheel(0, -500);
  await expect.poll(async () => (await state(page)).zoom).toBeGreaterThan(1.1);
  await page
    .getByRole('toolbar', { name: 'Näkymän pikatoiminnot' })
    .getByRole('button', { name: 'Yleisnäkymä', exact: true })
    .click();
  await expect.poll(async () => (await state(page)).projection[15]).toBe(0);
  const overview = await state(page);
  expect(overview.zoom).toBe(1);
  expect(overview.projection[15]).toBe(0);
  expect(new Vector3(...overview.target).distanceTo(new Vector3(200, 150, 50))).toBeLessThan(1e-6);
  expect(direction(overview).distanceTo(new Vector3(1, -1.4, 1).normalize())).toBeLessThan(1e-6);
  await expect(page.getByTestId(`body-${body.id}`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('viewport')).toHaveAttribute(
    'data-display-modes',
    JSON.stringify({ [body.id]: 'flat' }),
  );
  await page.screenshot({ path: info.outputPath('overview-toolbar.png') });
});
