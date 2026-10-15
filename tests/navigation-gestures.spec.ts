import { test, expect, type Page } from '@playwright/test';
import * as THREE from 'three';
import { makeBody, type Vec3 } from '../src/model/project';
import { ready, view, save, revealBrowser } from './helpers';

async function projected(page: Page, point: Vec3) {
  const canvas = page.getByTestId('viewport');
  const rect = (await canvas.boundingBox())!;
  const state = JSON.parse((await canvas.getAttribute('data-camera'))!);
  const camera = new THREE.Camera();
  camera.position.fromArray(state.position);
  camera.quaternion.fromArray(state.quaternion);
  camera.projectionMatrix.fromArray(state.projection);
  camera.updateMatrixWorld();
  const p = new THREE.Vector3(...point).project(camera);
  return { x: rect.x + ((p.x + 1) * rect.width) / 2, y: rect.y + ((1 - p.y) * rect.height) / 2 };
}

test('rotation controls remain compact through zoom and keep their world anchor', async ({
  page,
}, info) => {
  const body = makeBody(10, 10, 20);
  await ready(page, [body]);
  await page.getByTestId(`body-${body.id}`).click();
  await page.keyboard.press('r');
  await view(page, [body]);
  const canvas = page.getByTestId('viewport');
  const pivot = await canvas.getAttribute('data-rotation-pivot');
  const radii: number[] = [];
  for (const wheel of [0, -300, 600]) {
    const p = await projected(page, [5, 5, 20]);
    await page.mouse.move(p.x, p.y);
    if (wheel) {
      const before = await canvas.getAttribute('data-camera');
      await page.mouse.wheel(0, wheel);
      await expect.poll(() => canvas.getAttribute('data-camera')).not.toBe(before);
    }
    await expect
      .poll(async () => Number(await canvas.getAttribute('data-rotation-radius')))
      .toBeGreaterThan(0);
    const r = Number(await canvas.getAttribute('data-rotation-radius'));
    radii.push(r);
    const camera = JSON.parse((await canvas.getAttribute('data-camera'))!);
    const box = (await canvas.boundingBox())!;
    // Top view is orthographic; matrix[5] converts world Y to normalized Y.
    const pixels = (r * camera.projection[5] * box.height) / 2;
    expect(pixels).toBeGreaterThanOrEqual(51.9);
    expect(pixels).toBeLessThanOrEqual(130.1);
    expect(await canvas.getAttribute('data-rotation-pivot')).toBe(pivot);
  }
  expect(radii[1]).toBeLessThanOrEqual(radii[0]);
  await page.screenshot({ path: info.outputPath('compact-rotation.png') });
});

for (const direction of [-1, 1]) {
  test(`unsigned extrusion follows a ${direction < 0 ? 'negative' : 'positive'} motion smaller than the grid`, async ({
    page,
  }) => {
    const body = makeBody(200, 160, 100);
    await ready(page, [body]);
    const p = await view(page, [body]);
    const start = p(100, 80, 100);
    await page.keyboard.press('e');
    await page.mouse.click(start.x, start.y);
    // In top view the axial drag intentionally uses the vertical fallback.
    await page.mouse.move(start.x, start.y - direction);
    await expect(page.getByTestId('height-input')).toHaveValue('+0');
    await page.keyboard.type('3');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
    expect((await save(page)).bodies[0].feature.height).toBeCloseTo(100 + direction * 3, 6);
  });
}

for (const navigation of ['orbit', 'pan', 'zoom'] as const) {
  test(`active extrusion keeps its amount through ${navigation} and resumes without a jump`, async ({
    page,
  }) => {
    const body = makeBody(200, 160, 100);
    await ready(page, [body]);
    await view(page, [body]);
    const start = await projected(page, [100, 80, 100]);
    await page.keyboard.press('e');
    await page.mouse.click(start.x, start.y);
    await page.mouse.move(start.x, start.y - 45);
    const field = page.getByTestId('height-input');
    const value = await field.inputValue();
    expect(Number(value)).toBeGreaterThan(0);
    const before = await page.getByTestId('viewport').getAttribute('data-camera');
    let x = start.x,
      y = start.y - 45;
    if (navigation === 'zoom') await page.mouse.wheel(0, -220);
    else {
      const button = navigation === 'orbit' ? 'right' : 'middle';
      await page.mouse.down({ button });
      x += 70;
      y += 35;
      await page.mouse.move(x, y, { steps: 6 });
      await page.mouse.up({ button });
    }
    await expect
      .poll(() => page.getByTestId('viewport').getAttribute('data-camera'))
      .not.toBe(before);
    await expect(field).toHaveValue(value);
    await page.mouse.move(x + 1, y);
    await expect(field).toHaveValue(value);
    await page.mouse.move(x + 2, y - 1);
    expect(Math.abs(Number(await field.inputValue()) - Number(value))).toBeLessThanOrEqual(10);
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
    expect((await save(page)).bodies[0].feature.height).toBeCloseTo(100 + Number(value), -1);
  });
}

test('moving a held object resumes from the same position after pan and orbit', async ({
  page,
}) => {
  const body = makeBody(300, 200, 80);
  await ready(page, [body]);
  await view(page, [body]);
  await revealBrowser(page);
  await page.getByTestId(`body-${body.id}`).click();
  const start = await projected(page, [150, 100, 80]);
  await page.keyboard.press('m');
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 65, start.y);
  const field = page.getByTestId('move-x');
  const value = await field.inputValue();
  expect(Number(value)).toBeGreaterThan(0);
  let x = start.x + 65,
    y = start.y;
  for (const button of ['middle', 'right'] as const) {
    await page.mouse.down({ button });
    x += 45;
    y += 25;
    await page.mouse.move(x, y, { steps: 5 });
    await page.mouse.up({ button });
    await expect(field).toHaveValue(value);
    await page.mouse.move(++x, y);
    await expect(field).toHaveValue(value);
    await page.mouse.move(++x, y);
    expect(Math.abs(Number(await field.inputValue()) - Number(value))).toBeLessThanOrEqual(10);
  }
  await page.mouse.up();
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  const result = (await save(page)).bodies[0];
  expect(result.origin[0]).toBeCloseTo(Number(value), -1);
  expect(result.origin[1]).toBe(0);
  expect(result.origin[2]).toBe(0);
});

for (const side of ['top', 'front'] as const) {
  test(`center rectangle retains its center while typing both dimensions in ${side} view`, async ({
    page,
  }) => {
    const body = makeBody(600, 600, 300);
    await ready(page, [body]);
    const p = await view(page, [body], side);
    await page.getByRole('button', { name: 'Muodot', exact: true }).click();
    await page.getByRole('button', { name: 'Suorakulmio keskeltä', exact: true }).click();
    const center: Vec3 = side === 'top' ? [300, 300, 300] : [300, 0, 150];
    const start = p(...center);
    await page.mouse.click(start.x, start.y);
    await page.mouse.move(start.x - 30, start.y + 40);
    await page.keyboard.type('92');
    await page.keyboard.press('Tab');
    await page.keyboard.type('38');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '2');
    const result = (await save(page)).bodies[1];
    const f = result.feature;
    const middle = result.origin.map((n, i) => n + [f.width, f.depth, f.height][i] / 2);
    middle.forEach((n, i) => expect(n).toBeCloseTo(center[i], 6));
    expect(f.width).toBeCloseTo(92, 6);
    expect(side === 'top' ? f.depth : f.height).toBeCloseTo(38, 6);
  });
}

test('center rectangle accepts exact dimensions immediately after its first point', async ({
  page,
}) => {
  const body = makeBody(600, 600, 40);
  await ready(page, [body]);
  const p = await view(page, [body]);
  await page.getByRole('button', { name: 'Muodot', exact: true }).click();
  await page.getByRole('button', { name: 'Suorakulmio keskeltä', exact: true }).click();
  const start = p(300, 300, 40);
  await page.mouse.click(start.x, start.y);
  await page.keyboard.type('92');
  await page.keyboard.press('Tab');
  await page.keyboard.type('38');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '2');
  const result = (await save(page)).bodies[1];
  expect(result.origin).toEqual([254, 281, 40]);
  expect(result.feature).toMatchObject({ width: 92, depth: 38, height: 0 });
});

test('sub-grid negative Move keeps its sign when an unsigned exact distance is typed', async ({
  page,
}) => {
  const body = makeBody(40, 30, 20);
  await ready(page, [body]);
  const p = await view(page, [body]);
  await page.keyboard.press('m');
  const start = p(20, 15, 20);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x - 8, start.y);
  await expect(page.getByTestId('move-x')).toHaveValue('0');
  await page.keyboard.type('3');
  await page.keyboard.press('Enter');
  await page.mouse.up();
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  expect((await save(page)).bodies[0].origin).toEqual([-3, 0, 0]);
});

for (const target of [
  [130, 100, 100],
  [130, 0, 40],
] as Vec3[]) {
  test(`guide chooses the adjacent face in the pointer direction (${target.join(',')})`, async ({
    page,
  }) => {
    const body = makeBody(400, 300, 100);
    await ready(page, [body]);
    const start = await projected(page, [130, 0, 100]);
    const end = await projected(page, target);
    await page.keyboard.press('t');
    await page.mouse.click(start.x, start.y);
    await page.mouse.move(end.x, end.y);
    await page.getByTestId('guide-length').fill('30');
    await page.getByTestId('guide-length').press('Enter');
    const guide = (await save(page)).guides[0];
    expect(guide).toBeTruthy();
    expect(guide.offset?.[0]).toBeCloseTo(0, 5);
    if (target[1]) {
      expect(guide.offset?.[1]).toBeCloseTo(30, 5);
      expect(guide.offset?.[2]).toBeCloseTo(0, 5);
    } else {
      expect(guide.offset?.[1]).toBeCloseTo(0, 5);
      expect(guide.offset?.[2]).toBeCloseTo(-30, 5);
    }
  });
}
