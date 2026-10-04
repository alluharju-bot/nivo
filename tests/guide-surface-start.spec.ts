import { test, expect } from '@playwright/test';
import * as THREE from 'three';
import { ready, view, click, save } from './helpers';
import { makeBody, makeProfileBody, type Vec3, type Guide } from '../src/model/project';
import { sketchFrame } from '../src/model/sketch';
import type { Page } from '@playwright/test';

async function projectedPoint(page: Page, point: Vec3) {
  const canvas = page.getByTestId('viewport'),
    rect = (await canvas.boundingBox())!;
  const data = JSON.parse((await canvas.getAttribute('data-camera'))!);
  const camera = new THREE.Camera();
  camera.position.fromArray(data.position);
  camera.quaternion.fromArray(data.quaternion);
  camera.projectionMatrix.fromArray(data.projection);
  camera.updateMatrixWorld();
  const p = new THREE.Vector3(...point).project(camera);
  return { x: rect.x + ((p.x + 1) * rect.width) / 2, y: rect.y + ((1 - p.y) * rect.height) / 2 };
}

test('a floor extruded below zero offers its top and bottom edges to construction guides', async ({
  page,
}) => {
  const floor = makeProfileBody(
    { kind: 'rectangle', width: 4000, depth: 3000 },
    sketchFrame([0, 0, 0], [0, 0, 1]),
    -100,
    'Betonilattia',
  );
  const wall = makeBody(4000, 150, 2400, [0, 2850, 0], 'Seinä');
  await ready(page, [floor, wall]);
  await view(page, [floor, wall], 'front');
  await page.keyboard.press('t');
  for (const point of [
    [1300, 0, 0],
    [1300, 0, -100],
  ] as Vec3[]) {
    const canvas = page.getByTestId('viewport');
    const rect = (await canvas.boundingBox())!;
    const data = JSON.parse((await canvas.getAttribute('data-camera'))!);
    const camera = new THREE.Camera();
    camera.position.fromArray(data.position);
    camera.quaternion.fromArray(data.quaternion);
    camera.projectionMatrix.fromArray(data.projection);
    camera.updateMatrixWorld();
    const p = new THREE.Vector3(...point).project(camera);
    const at = {
      x: rect.x + ((p.x + 1) * rect.width) / 2,
      y: rect.y + ((1 - p.y) * rect.height) / 2,
    };
    await page.mouse.move(at.x, at.y);
    await expect(page.getByTestId('snap-hint')).toContainText('Reuna');
    const snapped = JSON.parse((await canvas.getAttribute('data-snap-point'))!);
    point.forEach((n, i) => expect(snapped[i]).toBeCloseTo(n, i === 0 ? 2 : 7));
    await click(page, at);
    await page.keyboard.press('z');
    await page.getByTestId('guide-length').fill('800');
    await page.getByTestId('guide-length').press('Enter');
  }
  const project = await save(page);
  expect(project.guides).toHaveLength(2);
  expect(project.bodies).toEqual([floor, wall]);
});

test('rectangle acquires a guide and its plane in open space, with no phantom ground projection', async ({
  page,
}) => {
  const body = makeBody(400, 30, 600, [0, 37.125, 0]);
  const guides: Guide[] = [
    {
      id: 'over-wall',
      mode: 'guide',
      anchor: { point: [400, 37.125, 400] },
      direction: [1, 0, 0],
      plane: 'XZ',
      angle: 0,
      length: 400,
    },
  ];
  await ready(page, [body], guides);
  const p = await view(page, [body], 'front');
  await page.keyboard.press('s');
  const at = p(520, 37.125, 400);
  await page.mouse.move(at.x, at.y + 3);
  await expect(page.getByTestId('snap-hint')).toHaveText('Apuviiva');
  const start = JSON.parse((await page.getByTestId('viewport').getAttribute('data-snap-point'))!);
  expect(start[1]).toBeCloseTo(37.125, 7);
  expect(start[2]).toBeCloseTo(400, 7);
  await click(page, { x: at.x, y: at.y + 3 });
  await click(page, p(640, 37.125, 520));
  const result = (await save(page)).bodies[1];
  expect(result.origin[1]).toBeCloseTo(37.125, 7);
  expect(result.origin[2]).toBeCloseTo(400, 7);
  expect(result.feature.height).toBeCloseTo(120, 7);
});

test('a guide raised 800 mm from a floor can be offset another 1000 mm and start a rectangle on the wall', async ({
  page,
}) => {
  const wall = makeBody(4000, 150, 2400, [0, 37.125, 0]);
  const floor = makeBody(4000, 3000, 100, [0, 37.125, -100]);
  const guide: Guide = {
    id: 'raised',
    mode: 'guide',
    anchor: { point: [0, 37.125, 0] },
    direction: [1, 0, 0],
    plane: 'XY',
    angle: 0,
    length: 4000,
    offset: [0, 0, 800],
  };
  await ready(page, [wall, floor], [guide]);
  const p = await view(page, [wall, floor], 'front');
  await page.keyboard.press('t');
  await page.mouse.move(p(1400, 37.125, 800).x, p(1400, 37.125, 800).y);
  await expect(page.getByTestId('snap-hint')).toHaveText('Apuviiva');
  await click(page, p(1400, 37.125, 800));
  await page.mouse.move(p(1400, 37.125, 1800).x, p(1400, 37.125, 1800).y);
  await expect(page.getByTestId('guide-length')).toHaveValue('1000');
  await page.getByTestId('guide-length').fill('1000');
  await page.getByTestId('guide-length').press('Enter');
  await page.keyboard.press('s');
  const at = p(1200, 37.125, 1800);
  await page.mouse.move(at.x, at.y + 2);
  await expect(page.getByTestId('snap-hint')).toHaveText('Apuviiva');
  await click(page, { x: at.x, y: at.y + 2 });
  await click(page, p(1800, 37.125, 800));
  const result = await save(page);
  expect(result.guides).toHaveLength(2);
  expect(result.bodies).toHaveLength(3);
  expect(result.bodies[2].origin[1]).toBeCloseTo(37.125, 6);
  expect(result.bodies[2].origin[2]).toBeCloseTo(800, 6);
  expect(result.bodies[2].feature.height).toBeCloseTo(1000, 6);
});

test('negative floor edges also acquire in perspective including the bottom silhouette', async ({
  page,
}) => {
  const floor = makeProfileBody(
    { kind: 'rectangle', width: 4000, depth: 3000 },
    sketchFrame([0, 0, 0], [0, 0, 1]),
    -100,
    'Betonilattia',
  );
  const wall = makeBody(4000, 150, 2400, [0, 2850, 0], 'Seinä');
  await ready(page, [floor, wall]);
  await page.keyboard.press('t');
  for (const point of [
    [1300, 0, 0],
    [1300, 0, -100],
    [4000, 1300, 0],
    [4000, 1300, -100],
  ] as Vec3[]) {
    const canvas = page.getByTestId('viewport');
    const rect = (await canvas.boundingBox())!;
    const data = JSON.parse((await canvas.getAttribute('data-camera'))!);
    const camera = new THREE.Camera();
    camera.position.fromArray(data.position);
    camera.quaternion.fromArray(data.quaternion);
    camera.projectionMatrix.fromArray(data.projection);
    camera.updateMatrixWorld();
    const p = new THREE.Vector3(...point).project(camera);
    await page.mouse.move(
      rect.x + ((p.x + 1) * rect.width) / 2,
      rect.y + ((1 - p.y) * rect.height) / 2,
    );
    await expect(page.getByTestId('snap-hint')).toContainText('Reuna');
    const hit = JSON.parse((await canvas.getAttribute('data-snap-point'))!);
    expect(hit[2]).toBeCloseTo(point[2], 6);
  }
});

test('a close perspective view still acquires a long floor edge whose endpoint is behind the camera', async ({
  page,
}) => {
  const floor = makeProfileBody(
    { kind: 'rectangle', width: 10000, depth: 8000 },
    sketchFrame([0, 0, 0], [0, 0, 1]),
    -100,
    'Betonilattia',
  );
  const wall = makeBody(10000, 150, 2400, [0, 7850, 0], 'Seinä');
  await ready(page, [floor, wall]);
  const canvas = page.getByTestId('viewport');
  await page.keyboard.press('t');
  let endpointBehind = false;
  for (let i = 0; i < 24; i++) {
    const at = await projectedPoint(page, [5500, 20, 0]);
    await page.mouse.move(at.x, at.y);
    const before = await canvas.getAttribute('data-camera');
    await page.mouse.wheel(0, -400);
    await expect(canvas).not.toHaveAttribute('data-camera', before!);
    const data = JSON.parse((await canvas.getAttribute('data-camera'))!);
    const camera = new THREE.Camera();
    camera.position.fromArray(data.position);
    camera.quaternion.fromArray(data.quaternion);
    camera.updateMatrixWorld();
    endpointBehind = new THREE.Vector3(10000, 0, 0).applyMatrix4(camera.matrixWorldInverse).z > 0;
    if (endpointBehind) break;
  }
  expect(endpointBehind).toBe(true);
  const at = await projectedPoint(page, [5500, 0, 0]);
  await page.mouse.move(at.x + 1, at.y);
  await expect(page.getByTestId('snap-hint')).toBeVisible();
  await expect(page.getByTestId('snap-hint')).toContainText('Reuna');
  const hit = JSON.parse((await canvas.getAttribute('data-snap-point'))!);
  expect(hit[1]).toBeCloseTo(0, 6);
  expect(hit[2]).toBeCloseTo(0, 6);
});
