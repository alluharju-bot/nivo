import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import {
  bounds,
  freshProject,
  makeBody,
  type Body,
  type Guide,
  type Project,
  type Vec3,
} from '../src/model/project';

async function ready(page: Page, bodies: Body[] = [], guides: Guide[] = []) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Piirrä suorakulmio', exact: true })).toBeEnabled();
  if (bodies.length || guides.length) {
    await page.getByTestId('project-file').setInputFiles({
      name: 'direct.nivo',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ ...freshProject(), bodies, guides })),
    });
    await expect(page.locator('.object-list .object-select')).toHaveCount(bodies.length);
  }
}
async function view(page: Page, bodies: Body[], side: 'top' | 'front' | 'right' | 'iso' = 'top') {
  await page
    .getByRole('button', {
      name: { top: 'Ylhäältä', front: 'Edestä', right: 'Sivulta', iso: '3D' }[side],
      exact: true,
    })
    .click();
  const rect = (await page.getByTestId('viewport').boundingBox())!,
    box = bounds(bodies),
    a = new THREE.Vector3(...box.min),
    b = new THREE.Vector3(...box.max),
    center = a.clone().add(b).multiplyScalar(0.5),
    aspect = rect.width / rect.height;
  const radius = Math.max(a.distanceTo(b) * 0.65, 100) / Math.min(aspect, 1),
    camera =
      side === 'iso'
        ? new THREE.PerspectiveCamera(40, aspect, 0.1, 1e6)
        : new THREE.OrthographicCamera(
            -radius * aspect,
            radius * aspect,
            radius,
            -radius,
            0.1,
            1e6,
          );
  camera.up.set(...((side === 'top' ? [0, 1, 0] : [0, 0, 1]) as Vec3));
  camera.position
    .copy(center)
    .addScaledVector(
      new THREE.Vector3(
        ...({ top: [0, 0, 1], front: [0, -1, 0], right: [1, 0, 0], iso: [1, -1.4, 1] }[
          side
        ] as Vec3),
      ).normalize(),
      radius / Math.tan(Math.PI / 9),
    );
  camera.lookAt(center);
  camera.updateMatrixWorld();
  return (x: number, y: number, z = 0) => {
    const p = new THREE.Vector3(x, y, z).project(camera);
    return { x: rect.x + ((p.x + 1) * rect.width) / 2, y: rect.y + ((1 - p.y) * rect.height) / 2 };
  };
}
async function click(page: Page, p: { x: number; y: number }) {
  await page.mouse.click(p.x, p.y);
}
async function save(page: Page): Promise<Project> {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Tallenna tiedosto', exact: true }).click();
  return JSON.parse(await readFile((await (await pending).path())!, 'utf8'));
}

async function drag(page: Page, a: { x: number; y: number }, b: { x: number; y: number }) {
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
}

test('edge hover follows the cursor; perspective guides offset on the lid and all axes without rotating', async ({
  page,
}, info) => {
  const body = makeBody(500, 400, 180);
  await ready(page, [body]);
  const point = await view(page, [body], 'iso');
  await page.keyboard.press('t');
  const a = point(130, 0, 180);
  await page.mouse.move(a.x, a.y);
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-hover-edge', /130|500/);
  await expect(page.getByTestId('snap-hint')).toContainText('Reuna');
  await page.screenshot({ path: info.outputPath('edge-hover.png') });
  await drag(page, a, point(130, 100, 180));
  let model = await save(page);
  expect(model.guides).toHaveLength(1);
  expect(model.guides[0].offset![1]).toBeCloseTo(100, 1);
  expect(model.guides[0].offset![2]).toBeCloseTo(0, 1);
  const original = model.guides[0].direction;
  for (const [axis, endpoint, expected] of [
    ['y', [130, 60, 180], [0, 60, 0]],
    ['z', [130, 0, 260], [0, 0, 80]],
    ['x', [220, 0, 180], [90, 0, 0]],
  ] as const) {
    await expect(page.getByRole('button', { name: 'Mittatyökalu', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.keyboard.press(axis);
    const b = point(endpoint[0], endpoint[1], endpoint[2]);
    await page.mouse.move(b.x, b.y, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
    model = await save(page);
    expect(model.guides.at(-1)!.direction).toEqual(original);
    model.guides.at(-1)!.offset!.forEach((v, i) => expect(v).toBeCloseTo(expected[i], 1));
  }
  expect(new Set(model.guides.map((g) => g.id)).size).toBe(4);
  await drag(page, a, point(130, 0, 120));
  model = await save(page);
  expect(model.guides).toHaveLength(5);
  expect(model.guides[4].offset![1]).toBeCloseTo(0, 1);
  expect(model.guides[4].offset![2]).toBeCloseTo(-60, 1);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Valitse', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('move, rectangle and push/pull stay active across commits; Escape clears even an axis lock', async ({
  page,
}) => {
  const body = makeBody(300, 200, 80);
  await ready(page, [body]);
  const point = await view(page, [body]);
  await page.getByRole('button', { name: 'Siirrä', exact: true }).click();
  await drag(page, point(100, 100), point(160, 100));
  await expect(page.getByRole('button', { name: 'Siirrä', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await drag(page, point(160, 100), point(200, 100));
  expect((await save(page)).bodies[0].origin).toEqual([100, 0, 0]);
  await page.keyboard.press('s');
  // Keep both strokes inside the tablet canvas after the compact header enlarges it.
  await drag(page, point(-100, 0), point(-40, 90));
  await expect(page.getByRole('button', { name: 'Suorakulmio', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await drag(page, point(-100, 120), point(-40, 170));
  let model = await save(page);
  expect(model.bodies).toHaveLength(3);
  expect(new Set(model.bodies.map((b) => b.id)).size).toBe(3);
  await page.keyboard.press('e');
  await click(page, point(230, 100, 80));
  await page.getByTestId('height-input').fill('20');
  await page.getByTestId('height-input').press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Push / pull', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await click(page, point(230, 100, 100));
  await page.getByTestId('height-input').fill('30');
  await page.getByTestId('height-input').press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  model = await save(page);
  expect(model.bodies[0].feature.height).toBe(130);
  await page.keyboard.press('t');
  await click(page, point(230, 0, 130));
  await page.keyboard.press('z');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Valitse', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('.object-list .object-select.selected')).toHaveCount(0);
  expect((await save(page)).guides).toHaveLength(0);
});

test('numeric window is outside the canvas, draggable, stays put across gestures and tools, and redocks', async ({
  page,
}, info) => {
  await ready(page);
  await page.keyboard.press('s');
  const input = page.getByTestId('dynamic-input');
  const canvas = (await page.getByTestId('viewport').boundingBox())!;
  const initial = (await input.boundingBox())!;
  expect(initial.x).toBeGreaterThanOrEqual(canvas.x + canvas.width);
  const handle = (await page
    .getByRole('button', { name: 'Siirrä mittaikkunaa', exact: true })
    .boundingBox())!;
  await page.mouse.move(handle.x + 30, handle.y + 12);
  await page.mouse.down();
  await page.mouse.move(140, 260, { steps: 8 });
  await page.mouse.up();
  const moved = (await input.boundingBox())!;
  expect(moved.x).toBeCloseTo(140 - (handle.x + 30 - initial.x), 0);
  expect(moved.y).toBeLessThan(260);
  await page.keyboard.press('c');
  const next = (await input.boundingBox())!;
  expect(next.x).toBe(moved.x);
  expect(next.y).toBe(moved.y);
  await page.keyboard.type('70');
  await page.keyboard.press('Enter');
  await expect(input).toHaveCount(0);
  // Typing starts the next shape without selecting the tool again.
  await page.keyboard.type('90');
  await expect(page.getByTestId('diameter-input')).toHaveValue('90');
  expect((await input.boundingBox())!.x).toBe(moved.x);
  await page.screenshot({ path: info.outputPath('movable-input.png') });
  await page.getByRole('button', { name: 'Palauta mittaikkuna oikeaan reunaan' }).click();
  expect((await input.boundingBox())!.x).toBeGreaterThanOrEqual(canvas.x + canvas.width);
  await page.keyboard.press('Escape');
  await expect(input).toHaveCount(0);
  expect((await save(page)).bodies).toHaveLength(1);
});
