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

test('stair rotates from a fixed corner to an exact measurement endpoint, retaining the reference with Shift and undo', async ({
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
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-rotation-target', 'rise:start');
  await expect
    .poll(async () => Number(await page.getByTestId('rotation-angle').inputValue()))
    .toBeCloseTo(-36.86989765, 3);
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

test('corner and center use their own attachment line even when dragging another point on the ring', async ({
  page,
}, info) => {
  const body = makeBody(200, 40, 80),
    target: Vec3 = [160, 0, 120];
  await ready(page, [body], [free('rise', target, [160, 0, 160])]);
  await page.getByTestId(`body-${body.id}`).click();
  await page.keyboard.press('r');
  await view(page, [body], 'front');
  await page.getByRole('button', { name: 'Kierrä Y-akselin ympäri' }).click();
  const canvas = page.getByTestId('viewport');
  await expect(canvas).toHaveAttribute('data-rotation-grip', '[200,20,40]');
  await pivot(page, [0, 0, 0]);
  await expect(canvas).toHaveAttribute('data-rotation-grip', '[200,0,0]');
  const radius = Number(await canvas.getAttribute('data-rotation-radius')),
    start = await at(page, [radius * 0.6, 0, radius * 0.8]);
  await page.mouse.move(start.x, start.y);
  await expect(canvas).toHaveAttribute('data-rotation-handle', 'Y');
  await page.mouse.down();
  const end = await at(page, target);
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await expect(canvas).toHaveAttribute('data-rotation-target', 'rise:start');
  await expect
    .poll(async () => Number(await page.getByTestId('rotation-angle').inputValue()))
    .toBeCloseTo(-36.86989765, 3);
  const moved = JSON.parse((await canvas.getAttribute('data-rotation-grip-preview'))!);
  expect(moved[0]).toBeCloseTo(160, 4);
  expect(moved[2]).toBeCloseTo(120, 4);
  await page.screenshot({ path: info.outputPath('corner-attachment.png') });
  await page.mouse.up();
  const result = (await save(page)).bodies[0];
  expect(result.origin[0]).toBeCloseTo(-48, 3);
  expect(result.origin[2]).toBeCloseTo(0, 3);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies[0]).toEqual(body);
});

test('explicit attachment point is independent of the drag origin and can return to automatic', async ({
  page,
}) => {
  const body = makeBody(200, 40, 80),
    target: Vec3 = [112, 0, 184];
  await ready(page, [body], [free('custom-target', target, [112, 0, 224])]);
  await page.getByTestId(`body-${body.id}`).click();
  await page.keyboard.press('r');
  await view(page, [body], 'front');
  await page.getByRole('button', { name: 'Kierrä Y-akselin ympäri' }).click();
  await pivot(page, [0, 0, 0]);
  const canvas = page.getByTestId('viewport');
  await page.getByRole('button', { name: 'Valitse kiinnityspiste', exact: true }).click();
  await click(page, await at(page, [200, 0, 80]));
  await expect(canvas).toHaveAttribute('data-rotation-grip', '[200,0,80]');
  await expect(canvas).toHaveAttribute('data-rotation-pivot', '[0,0,0]');
  // Shift during a drag must keep the manually chosen point and exact reference.
  // Start away from the chosen point: it must stay the upper far corner.
  const start = await at(page, [60, 0, 20]),
    end = await at(page, target);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.keyboard.down('Shift');
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await expect(canvas).toHaveAttribute('data-rotation-target', 'custom-target:start');
  const expected = ((-Math.atan2(184, 112) + Math.atan2(80, 200)) * 180) / Math.PI;
  await expect
    .poll(async () => Number(await page.getByTestId('rotation-angle').inputValue()))
    .toBeCloseTo(expected, 4);
  const moved = JSON.parse((await canvas.getAttribute('data-rotation-grip-preview'))!);
  expect(moved[0]).toBeCloseTo(112, 4);
  expect(moved[2]).toBeCloseTo(184, 4);
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies[0]).toEqual(body);
  // Undo clears the tool; start afresh and verify explicit/automatic/pivot resets.
  await page.keyboard.press('r');
  await page.getByRole('button', { name: 'Kierrä Y-akselin ympäri' }).click();
  await pivot(page, [0, 0, 0]);
  await page.getByRole('button', { name: 'Valitse kiinnityspiste', exact: true }).click();
  await click(page, await at(page, [200, 0, 80]));
  await page.getByRole('button', { name: 'Automaattinen', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-rotation-grip', '[200,0,0]');
  await page.getByRole('button', { name: 'Valitse kiinnityspiste', exact: true }).click();
  await click(page, await at(page, [200, 0, 80]));
  await page.getByRole('button', { name: 'Keskipiste', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-rotation-grip', '[200,20,40]');
  await page.keyboard.press('Escape');
  expect((await save(page)).bodies[0]).toEqual(body);
});

test('center attachment snaps correctly after a numeric preview without adding its angle twice', async ({
  page,
}) => {
  const body = makeBody(200, 40, 80),
    target: Vec3 = [180, 20, 100];
  await ready(page, [body], [free('center-target', target, [180, 20, 140])]);
  await page.getByTestId(`body-${body.id}`).click();
  await page.keyboard.press('r');
  await view(page, [body], 'front');
  await page.getByRole('button', { name: 'Kierrä Y-akselin ympäri' }).click();
  const canvas = page.getByTestId('viewport');
  await expect(canvas).toHaveAttribute('data-rotation-grip', '[200,20,40]');
  await page.getByTestId('rotation-angle').fill('30');
  await expect
    .poll(async () => JSON.parse((await canvas.getAttribute('data-rotation-grip-preview'))!)[2])
    .toBeCloseTo(-10, 4);
  const start = await at(page, [100 + 100 * Math.cos(Math.PI / 6), 20, -10]),
    end = await at(page, target);
  await page.mouse.move(start.x, start.y);
  await expect(page.getByTestId('snap-hint')).toContainText('Kiinnityspiste');
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await expect(canvas).toHaveAttribute('data-rotation-target', 'center-target:start');
  await expect
    .poll(async () => Number(await page.getByTestId('rotation-angle').inputValue()))
    .toBeCloseTo(-36.86989765, 4);
  const moved = JSON.parse((await canvas.getAttribute('data-rotation-grip-preview'))!);
  expect(moved[0]).toBeCloseTo(180, 4);
  expect(moved[1]).toBeCloseTo(20, 4);
  expect(moved[2]).toBeCloseTo(100, 4);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect((await save(page)).bodies[0]).toEqual(body);
});

test('automatic attachment from a picked face anchor does not flip 180 degrees at a guide', async ({
  page,
}) => {
  const body = makeBody(200, 40, 80),
    anchor: Vec3 = [180, 0, 40],
    target: Vec3 = [36, 0, 148];
  await ready(
    page,
    [body],
    [free('anchor', anchor, [180, 0, 60]), free('target', target, [36, 0, 188])],
  );
  await page.getByTestId(`body-${body.id}`).click();
  await page.keyboard.press('r');
  await view(page, [body], 'front');
  await page.getByRole('button', { name: 'Kierrä Y-akselin ympäri' }).click();
  await pivot(page, anchor);
  const canvas = page.getByTestId('viewport'),
    start = await at(page, [0, 0, 40]),
    end = await at(page, target);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await expect(canvas).toHaveAttribute('data-rotation-target', 'target:start');
  await expect
    .poll(async () => Number(await page.getByTestId('rotation-angle').inputValue()))
    .toBeCloseTo(36.86989765, 3);
  await expect(canvas).toHaveAttribute('data-rotation-grip', '[0,0,40]');
  const moved = JSON.parse((await canvas.getAttribute('data-rotation-grip-preview'))!);
  moved.forEach((n: number, i: number) => expect(n).toBeCloseTo(target[i], 3));
  await page.mouse.up();
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  const result = (await save(page)).bodies[0];
  expect(result.origin[0]).toBeCloseTo(12, 3);
  expect(result.origin[2]).toBeCloseTo(-4, 3);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies[0]).toEqual(body);
});

test('Shift before dragging an explicit grip picks off-plane references and frees empty-space angles', async ({
  page,
}) => {
  const body = makeBody(200, 40, 80),
    target: Vec3 = [112, -100, 184];
  await ready(page, [body], [free('shift-target', target, [112, -100, 224])]);
  await page.getByTestId(`body-${body.id}`).click();
  await page.keyboard.press('r');
  await view(page, [body], 'front');
  await page.getByRole('button', { name: 'Kierrä Y-akselin ympäri' }).click();
  await pivot(page, [0, 0, 0]);
  await page.getByRole('button', { name: 'Valitse kiinnityspiste', exact: true }).click();
  const source = await at(page, [200, 0, 80]);
  await click(page, source);
  const canvas = page.getByTestId('viewport');
  await page.mouse.move(source.x, source.y);
  await page.keyboard.down('Shift');
  await page.mouse.down();
  const empty = await at(page, [190, 0, 130]);
  await page.mouse.move(empty.x, empty.y, { steps: 5 });
  await expect(canvas).toHaveAttribute('data-rotation-target', '');
  const expectedFree = ((Math.atan2(80, 200) - Math.atan2(130, 190)) * 180) / Math.PI;
  await expect
    .poll(async () => Number(await page.getByTestId('rotation-angle').inputValue()))
    .toBeCloseTo(expectedFree, 2);
  const end = await at(page, target);
  await page.mouse.move(end.x, end.y, { steps: 5 });
  await expect(canvas).toHaveAttribute('data-rotation-target', 'shift-target:start');
  await expect
    .poll(async () => Number(await page.getByTestId('rotation-angle').inputValue()))
    .toBeCloseTo(-36.86989765, 3);
  const moved = JSON.parse((await canvas.getAttribute('data-rotation-grip-preview'))!);
  expect(moved[0]).toBeCloseTo(112, 4);
  expect(moved[1]).toBeCloseTo(0, 4);
  expect(moved[2]).toBeCloseTo(184, 4);
  await page.keyboard.up('Shift');
  await expect(canvas).toHaveAttribute('data-rotation-target', 'shift-target:start');
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect((await save(page)).bodies[0]).toEqual(body);
});
