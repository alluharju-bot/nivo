import { test, expect, type Page } from '@playwright/test';
import { Camera, Vector3 } from 'three';
import { makeBody, type Guide, type Vec3 } from '../src/model/project';
import { ready, view, click, save } from './helpers';

async function at(page: Page, point: Vec3) {
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
}
const free = (id: string, start: Vec3, end: Vec3): Guide => ({
  id,
  mode: 'free',
  anchor: { point: start },
  endAnchor: { point: end },
  direction: [1, 0, 0],
  plane: 'XZ',
  angle: 0,
  length: Math.hypot(...end.map((n, i) => n - start[i])),
});
async function pivot(page: Page, point: Vec3) {
  await page.getByRole('button', { name: 'Valitse ankkuri', exact: true }).click();
  const p = await at(page, point);
  await page.mouse.move(p.x, p.y);
  await expect(page.getByTestId('viewport')).toHaveAttribute(
    'data-snap-point',
    JSON.stringify(point),
  );
  await click(page, p);
  await expect(page.getByTestId('viewport')).toHaveAttribute(
    'data-rotation-pivot',
    JSON.stringify(point),
  );
}

test('stair rotates from a fixed corner to an exact measurement endpoint, with free Shift and undo', async ({
  page,
}, info) => {
  const body = makeBody(200, 40, 80),
    target: Vec3 = [160, 0, 120];
  await ready(page, [body], [free('rise', target, [160, 0, 160])]);
  await page.getByTestId(`body-${body.id}`).click();
  await page.keyboard.press('r');
  await view(page, [body], 'front');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-rotation-pivot', '[100,20,40]');
  await page.getByRole('button', { name: 'Kierrä Y-akselin ympäri' }).click();
  await pivot(page, [0, 0, 0]);
  // A click on the selected face must not silently reset the chosen corner to center.
  const interior = await at(page, [60, 0, 20]);
  await click(page, interior);
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-rotation-pivot', '[0,0,0]');
  const source = await at(page, [200, 0, 0]),
    destination = await at(page, target);
  await page.mouse.move(source.x, source.y);
  await expect(page.getByTestId('snap-hint')).toContainText('vedä kiertääksesi');
  await page.mouse.down();
  await page.mouse.move(destination.x + 3, destination.y + 2, { steps: 8 });
  await expect(page.getByTestId('snap-hint')).toContainText('Mittaviiva · alku');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-rotation-target', 'rise:start');
  await expect
    .poll(async () => Number(await page.getByTestId('rotation-angle').inputValue()))
    .toBeCloseTo(-36.86989765, 3);
  await page.keyboard.down('Shift');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-rotation-target', '');
  await page.keyboard.up('Shift');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-rotation-target', 'rise:start');
  await page.screenshot({ path: info.outputPath('stair-anchor-reference.png') });
  await page.mouse.up();
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  const result = (await save(page)).bodies[0];
  expect(result.origin[0]).toBeCloseTo(-48, 2);
  expect(result.origin[2]).toBeCloseTo(0, 2);
  expect(result.feature.width).toBeCloseTo(208, 2);
  expect(result.feature.height).toBeCloseTo(184, 2);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies[0]).toEqual(body);
});

test('pivot uses guide crossings, endpoints, edge midpoints and remains exact in perspective', async ({
  page,
}) => {
  const body = makeBody(400, 300, 20);
  const a = free('a', [40, 50, 20], [340, 50, 20]),
    b = free('b', [173, 10, 20], [173, 280, 20]);
  await ready(page, [body], [a, b]);
  await page.getByTestId(`body-${body.id}`).click();
  await page.keyboard.press('r');
  await view(page, [body]);
  for (const point of [
    [173, 50, 20],
    [340, 50, 20],
    [400, 150, 20],
  ] as Vec3[])
    await pivot(page, point);
  await page.getByRole('button', { name: 'Yleisnäkymä', exact: true }).click();
  await pivot(page, [173, 50, 20]);
  await page.getByRole('button', { name: 'Keskipiste', exact: true }).click();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-rotation-pivot', '[200,150,10]');
  await page.keyboard.press('Escape');
  expect((await save(page)).bodies[0]).toEqual(body);
});

test('anchor and exact rotation preserve a multi-part selection and Ctrl copies the selection', async ({
  page,
}) => {
  const a = makeBody(100, 40, 20),
    b = makeBody(100, 40, 20, [150, 0, 0]);
  await ready(page, [a, b]);
  await page.getByTestId(`body-${a.id}`).click();
  await page.getByTestId(`body-${b.id}`).click({ modifiers: ['Shift'] });
  await page.keyboard.press('r');
  await view(page, [a, b]);
  await pivot(page, [0, 0, 20]);
  await page.getByTestId('viewport').focus();
  await page.keyboard.press('Control');
  await page.getByTestId('rotation-angle').fill('90');
  await page.getByTestId('rotation-angle').press('Enter');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '4');
  const project = await save(page);
  expect(project.bodies.find((p) => p.id === a.id)?.origin).toEqual(a.origin);
  expect(project.bodies.find((p) => p.id === b.id)?.origin).toEqual(b.origin);
  const copies = project.bodies
    .filter((p) => p.id !== a.id && p.id !== b.id)
    .sort((a, b) => a.origin[1] - b.origin[1]);
  expect(copies.map((p) => Math.round(p.origin[0]))).toEqual([-40, -40]);
  expect(copies.map((p) => Math.round(p.origin[1]))).toEqual([0, 150]);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual([a, b]);
});

test('rotation references acquire other-part vertices, midpoints, edges and face centers outside the rotation plane', async ({
  page,
}) => {
  const source = makeBody(200, 40, 80),
    target = makeBody(100, 40, 100, [100, -150, 110]);
  await ready(page, [source, target]);
  await page.getByTestId(`body-${source.id}`).click();
  await page.keyboard.press('r');
  await view(page, [source, target], 'front');
  await page.getByRole('button', { name: 'Kierrä Y-akselin ympäri' }).click();
  await pivot(page, [0, 0, 0]);
  const start = await at(page, [200, 0, 0]);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x - 3, start.y - 2);
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-rotation-target', ''); // Own geometry cannot trap rotation.
  for (const point of [
    [100, -150, 210],
    [150, -150, 210],
    [125, -150, 210],
    [150, -150, 160],
  ] as Vec3[]) {
    const p = await at(page, point);
    await page.mouse.move(p.x, p.y, { steps: 5 });
    await expect
      .poll(async () => {
        const snapped = JSON.parse(
          (await page.getByTestId('viewport').getAttribute('data-snap-point')) || 'null',
        );
        return snapped ? Math.hypot(...point.map((n, i) => n - snapped[i])) : Infinity;
      })
      .toBeLessThan(0.0001); // Pointer coordinates have subpixel rounding; 0.1 micrometre tolerance.
    const angle = Number(await page.getByTestId('rotation-angle').inputValue());
    expect(angle).toBeCloseTo((-Math.atan2(point[2], point[0]) * 180) / Math.PI, 4);
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-rotation-pivot', '[0,0,0]');
  }
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect((await save(page)).bodies).toEqual([source, target]);
});
