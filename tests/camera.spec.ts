import { expect, test, type Page } from '@playwright/test';
import * as THREE from 'three';
import { makeBody, type Vec3 } from '../src/model/project';
import { ready, view, editBody, revealBrowser } from './helpers';

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
    // Import fits after the first mesh frame. Wait for that camera command before projecting.
    await expect
      .poll(async () =>
        new THREE.Vector3(...(await camera(page)).target).distanceTo(
          new THREE.Vector3(200, 150, 50),
        ),
      )
      .toBeLessThan(1e-6);
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
  await revealBrowser(page);
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
  await revealBrowser(page);
  await page.getByRole('button', { name: 'Valitse ryhmä: Runko', exact: true }).click();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-camera-focus', '[400,100,100]');
  after = await camera(page);
  expect(after.position).toEqual(before.position);
  expect(after.quaternion).toEqual(before.quaternion);
});

test('empty-space orbit stays on the selected part after cursor zoom and still allows panning', async ({
  page,
}) => {
  const a = makeBody(200, 200, 100, [0, 0, 0], 'Vasen');
  const b = makeBody(300, 200, 100, [600, 0, 0], 'Oikea');
  await ready(page, [a, b]);
  await revealBrowser(page);
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
  const rect = (await page.getByTestId('viewport').boundingBox())!;
  const empty = { x: rect.x + rect.width - 130, y: rect.y + rect.height - 100 };
  await page.mouse.move(empty.x, empty.y);
  await page.mouse.down({ button: 'right' });
  await expect(page.getByTestId('viewport')).toHaveAttribute(
    'data-orbit-pivot',
    JSON.stringify(pivot),
  );
  await page.mouse.move(empty.x + 90, empty.y + 40, { steps: 12 });
  await page.mouse.up({ button: 'right' });
  expect(distance(await screenPoint(page, pivot), before)).toBeLessThan(0.2);
  expect(
    new THREE.Vector3(...(await camera(page)).position).distanceTo(new THREE.Vector3(...pivot)),
  ).toBeCloseTo(radius, 5);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(empty.x + 20, empty.y + 40, { steps: 8 });
  await page.mouse.up({ button: 'middle' });
  expect(distance(await screenPoint(page, pivot), before)).toBeGreaterThan(30);
});

for (const projection of ['perspective', 'orthographic']) {
  test(`orbit locks to the pointed surface even while editing another part in ${projection}`, async ({
    page,
  }, info) => {
    const edited = makeBody(300, 300, 100, [0, 0, 0], 'Muokattava');
    const reference = { ...makeBody(300, 300, 170, [550, 0, 0], 'Viite'), locked: true };
    await ready(page, [edited, reference]);
    if (projection === 'orthographic') await view(page, [edited, reference]);
    await editBody(page, edited.id);
    const wanted: Vec3 = [760, 110, 170];
    const cursor = await screenPoint(page, wanted);
    await page.mouse.move(cursor.x, cursor.y);
    const before = await camera(page);
    await page.mouse.down({ button: 'right' });
    await expect(page.getByTestId('orbit-pivot')).toBeVisible();
    const pivot: Vec3 = JSON.parse(
      (await page.getByTestId('viewport').getAttribute('data-orbit-pivot'))!,
    );
    expect(new THREE.Vector3(...pivot).distanceTo(new THREE.Vector3(...wanted))).toBeLessThan(1);
    expect((await camera(page)).position).toEqual(before.position);
    expect((await camera(page)).quaternion).toEqual(before.quaternion);
    const anchor = await screenPoint(page, pivot);
    const radius = new THREE.Vector3(...before.position).distanceTo(new THREE.Vector3(...pivot));
    await page.mouse.move(cursor.x - 120, cursor.y + 50, { steps: 15 });
    expect(distance(await screenPoint(page, pivot), anchor)).toBeLessThan(0.2);
    expect(
      new THREE.Vector3(...(await camera(page)).position).distanceTo(new THREE.Vector3(...pivot)),
    ).toBeCloseTo(radius, 3);
    await expect(page.getByTestId('viewport')).toHaveAttribute(
      'data-orbit-pivot',
      JSON.stringify(pivot),
    );
    if (info.project.name === 'desktop' && projection === 'perspective')
      await page.screenshot({ path: info.outputPath('surface-orbit.png') });
    await page.mouse.up({ button: 'right' });
    await expect(page.getByTestId('orbit-pivot')).toBeHidden();
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-editing-body', edited.id);
    // Each gesture picks afresh: an empty start now uses the edited part again.
    await view(page, [edited, reference]);
    const rect = (await page.getByTestId('viewport').boundingBox())!;
    await page.mouse.move(rect.x + rect.width * 0.8, rect.y + rect.height * 0.8);
    await page.mouse.down({ button: 'right' });
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-orbit-pivot', '[150,150,50]');
    await page.mouse.up({ button: 'right' });
  });
}

test('orbit picks the visible fillet preview while the original surface is hidden', async ({
  page,
}) => {
  const part = makeBody(400, 300, 100);
  await ready(page, [part]);
  await view(page, [part]);
  await revealBrowser(page);
  await page.getByTestId(`body-${part.id}`).click();
  await page.keyboard.press('f');
  await page.getByRole('button', { name: 'Kaikki reunat', exact: true }).click();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-detail-preview', part.id);
  const wanted: Vec3 = [280, 180, 100];
  const cursor = await screenPoint(page, wanted);
  await page.mouse.move(cursor.x, cursor.y);
  await page.mouse.down({ button: 'right' });
  const pivot: Vec3 = JSON.parse(
    (await page.getByTestId('viewport').getAttribute('data-orbit-pivot'))!,
  );
  expect(new THREE.Vector3(...pivot).distanceTo(new THREE.Vector3(...wanted))).toBeLessThan(1);
  await page.mouse.move(cursor.x - 45, cursor.y + 20, { steps: 5 });
  await page.mouse.up({ button: 'right' });
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-detail-preview', part.id);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-detail-preview', '');
});

test('Navigate touch orbit picks the surface and a second finger releases the pivot', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'tablet', 'Touch input profile');
  const part = makeBody(400, 300, 100);
  await ready(page, [part]);
  await view(page, [part]);
  await page.getByRole('button', { name: 'Navigoi', exact: true }).click();
  const cursor = await screenPoint(page, [280, 180, 100]);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ ...cursor, id: 1 }],
  });
  await expect(page.getByTestId('orbit-pivot')).toBeVisible();
  const pivot: Vec3 = JSON.parse(
    (await page.getByTestId('viewport').getAttribute('data-orbit-pivot'))!,
  );
  expect(new THREE.Vector3(...pivot).distanceTo(new THREE.Vector3(280, 180, 100))).toBeLessThan(1);
  const before = await screenPoint(page, pivot);
  const finger = { x: cursor.x - 40, y: cursor.y + 30, id: 1 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [finger] });
  expect(distance(await screenPoint(page, pivot), before)).toBeLessThan(0.2);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [finger, { x: finger.x + 100, y: finger.y, id: 2 }],
  });
  await expect(page.getByTestId('orbit-pivot')).toBeHidden();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await expect(page.getByTestId('orbit-pivot')).toBeHidden();
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
