import { test, expect } from '@playwright/test';
import * as THREE from 'three';
import { ready, view, click, save } from './helpers';
import { makeBody } from '../src/model/project';

test('pen hover and committed vertices stay exactly on an off-grid cabinet face', async ({
  page,
}) => {
  const body = makeBody(600, 400, 800, [3.125, 6.375, 4.625]);
  await ready(page, [body]);
  const p = await view(page, [body], 'front');
  await page.keyboard.press('k');
  const points = [
    [3.125, 6.375, 804.625],
    [603.125, 6.375, 804.625],
    [603.125, 6.375, 4.625],
    [3.125, 6.375, 4.625],
  ];
  for (const q of points) {
    const at = p(q[0], q[1], q[2]);
    await page.mouse.move(at.x, at.y);
    await expect
      .poll(async () =>
        JSON.parse((await page.getByTestId('viewport').getAttribute('data-snap-point')) || 'null'),
      )
      .toEqual(q);
    await click(page, at);
  }
  await click(page, p(...(points[0] as [number, number, number])));
  await expect(page.locator('.object-list .object-select')).toHaveCount(2);
  const result = (await save(page)).bodies[1];
  expect(result.origin).toEqual(body.origin);
  expect(result.feature).toMatchObject({ width: 600, depth: 0, height: 800 });
});

test('move locks one axis, X/Y/Z change it and released Ctrl keeps the copy', async ({ page }) => {
  const a = makeBody(100, 100, 20, [3.125, 6.375, 4.625]),
    b = makeBody(100, 100, 20, [350, 180, 14.625]);
  await ready(page, [a, b]);
  const p = await view(page, [a, b]);
  await page.getByTestId(`body-${a.id}`).click();
  await page.keyboard.press('m');
  const start = p(103.125, 106.375, 24.625),
    end = p(350, 180, 34.625);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-move-axis', 'x');
  await page.keyboard.press('y');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-move-axis', 'y');
  await page.keyboard.press('x');
  await page.keyboard.press('Control');
  await expect(page.getByRole('checkbox', { name: 'Siirrä kopio', exact: true })).toBeChecked();
  await page.mouse.up();
  await expect(page.locator('.object-list .object-select')).toHaveCount(3);
  const result = await save(page),
    copy = result.bodies.find((b) => b.id !== a.id && b.id !== result.bodies[1].id)!;
  expect(result.bodies[0]).toEqual(a);
  expect(copy.origin[0]).toBeCloseTo(250, 6);
  expect(copy.origin[1]).toBe(a.origin[1]);
  expect(copy.origin[2]).toBe(a.origin[2]);
});

test('rectangle preserves off-grid anchors and can change its plane after the first point', async ({
  page,
}) => {
  const body = makeBody(600, 400, 800, [3.125, 6.375, 4.625]);
  await ready(page, [body]);
  const p = await view(page, [body], 'front');
  await page.keyboard.press('s');
  await click(page, p(3.125, 6.375, 804.625));
  await page.mouse.move(p(353.125, 6.375, 404.625).x, p(353.125, 6.375, 404.625).y);
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-sketch-plane', '[0,-1,0]');
  await page.keyboard.press('y');
  await expect(page.getByLabel('Piirtotaso', { exact: true })).toHaveValue('y');
  await click(page, p(353.125, 6.375, 404.625));
  await expect(page.locator('.object-list .object-select')).toHaveCount(2);
  const result = (await save(page)).bodies[1];
  expect(result.origin[1]).toBe(6.375);
  expect(result.feature.width).toBe(350);
  expect(result.feature.height).toBe(400);
});

test('free push/pull obeys the configured grid and typed thickness overrides it', async ({
  page,
}) => {
  const body = makeBody(400, 300, 0);
  await ready(page, [body]);
  const p = await view(page, [body]);
  await page.keyboard.press('e');
  const at = p(200, 150, 0);
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x, at.y - 73, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  const first = (await save(page)).bodies[0];
  expect(first.feature.height).toBeGreaterThan(0);
  expect(first.feature.height % 10).toBe(0);
  await page.keyboard.press('Escape');
  await page.mouse.move(at.x, at.y);
  await page.keyboard.press('e');
  await page.keyboard.type('2');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  expect((await save(page)).bodies[0].feature.height).toBe(first.feature.height + 2);
});

test('a rectangle on the inside back of a hollow cabinet stays on that exact surface', async ({
  page,
}) => {
  const body = makeBody(600, 400, 800);
  await ready(page, [body]);
  const p = await view(page, [body], 'front');
  const middle = p(300, 0, 400);
  await page.mouse.move(middle.x, middle.y);
  await page.keyboard.press('o');
  await page.keyboard.type('18');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  await page.keyboard.press('e');
  await page.getByTestId('remaining-input').fill('18');
  await page.getByTestId('remaining-input').press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  const cabinet = (await save(page)).bodies[0];
  await page.keyboard.press('s');
  await click(page, p(200, 382, 200));
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-sketch-plane', '[0,-1,0]');
  await click(page, p(400, 382, 550));
  await expect(page.locator('.object-list .object-select')).toHaveCount(2);
  const result = await save(page);
  expect(result.bodies[0]).toEqual(cabinet);
  expect(result.bodies[1]).toMatchObject({
    origin: [200, 382, 200],
    feature: { width: 200, depth: 0, height: 350 },
  });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '3D', exact: true }).click();
  const state = JSON.parse((await page.getByTestId('viewport').getAttribute('data-camera'))!);
  const camera = new THREE.Camera();
  camera.position.fromArray(state.position);
  camera.quaternion.fromArray(state.quaternion);
  camera.projectionMatrix.fromArray(state.projection);
  camera.updateMatrixWorld();
  const rect = (await page.getByTestId('viewport').boundingBox())!;
  const screen = (x: number, y: number, z: number) => {
    const v = new THREE.Vector3(x, y, z).project(camera);
    return { x: rect.x + ((v.x + 1) * rect.width) / 2, y: rect.y + ((1 - v.y) * rect.height) / 2 };
  };
  await page.keyboard.press('s');
  await click(page, screen(18, 180, 400));
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-sketch-plane', '[1,0,0]');
  await click(page, screen(18, 300, 600));
  await expect(page.locator('.object-list .object-select')).toHaveCount(3);
  const side = (await save(page)).bodies[2];
  expect(side.origin).toEqual([18, 180, 400]);
  expect(side.feature).toMatchObject({ width: 0, depth: 120, height: 200 });
});

test('grid spacing controls free shapes and movement while exact typed dimensions remain available', async ({
  page,
}) => {
  const body = makeBody(700, 600, 20, [3.125, 6.375, 4.625]);
  await ready(page, [body]);
  // Persisted spacing is the same setting exposed in the workspace settings.
  const project = await save(page);
  await page.getByTestId('project-file').setInputFiles({
    name: 'grid.nivo',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({ ...project, settings: { ...project.settings, gridStep: 25 } }),
    ),
  });
  await expect(page.getByRole('button', { name: 'Ruudukko 25 mm', exact: true })).toBeVisible();
  const p = await view(page, [body]);
  await page.keyboard.press('s');
  await click(page, p(3.125, 6.375, 24.625));
  await click(page, p(181, 288, 24.625));
  await expect(page.locator('.object-list .object-select')).toHaveCount(2);
  const rectangle = (await save(page)).bodies[1];
  expect(rectangle.feature.width).toBeCloseTo(175, 8);
  expect(rectangle.feature.depth).toBeCloseTo(275, 8);
  expect(rectangle.origin).toEqual([3.125, 6.375, 24.625]);
  await page.keyboard.press('Escape');
  await page.keyboard.press('c');
  await click(page, p(500, 400, 24.625));
  const end = p(579, 449, 24.625);
  await page.mouse.move(end.x, end.y);
  const diameter = Number(await page.getByTestId('diameter-input').inputValue());
  expect(diameter).toBeGreaterThan(0);
  expect(diameter % 25).toBe(0);
  await page.getByTestId('diameter-input').fill('72');
  await page.getByTestId('diameter-input').press('Enter');
  await expect(page.locator('.object-list .object-select')).toHaveCount(3);
  expect((await save(page)).bodies[2].feature.width).toBe(72);
  await page.keyboard.press('Escape');
  await page.getByTestId(`body-${body.id}`).click();
  await page.keyboard.press('m');
  const start = p(3.125, 6.375, 24.625),
    target = p(390, 70, 24.625);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 8 });
  await page.keyboard.press('Control');
  await expect(page.getByRole('checkbox', { name: 'Siirrä kopio', exact: true })).toBeChecked();
  await page.keyboard.press('Control');
  await expect(page.getByRole('checkbox', { name: 'Siirrä kopio', exact: true })).not.toBeChecked();
  await page.mouse.up();
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  const moved = await save(page);
  expect(moved.bodies).toHaveLength(3);
  expect(moved.bodies[0].origin).toEqual([378.125, 6.375, 4.625]);
});
