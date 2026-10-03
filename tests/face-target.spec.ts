import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import {
  bounds,
  freshProject,
  makeBody,
  makeProfileBody,
  type Body,
  type Guide,
  type Project,
  type Vec3,
} from '../src/model/project';
import { fromUV, sketchFrame } from '../src/model/sketch';

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
async function view(page: Page, bodies: Body[], side: 'top' | 'front' | 'right' = 'top') {
  await page
    .getByRole('button', {
      name: { top: 'Ylhäältä', front: 'Edestä', right: 'Sivulta' }[side],
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
    camera = new THREE.OrthographicCamera(
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
      new THREE.Vector3(...({ top: [0, 0, 1], front: [0, -1, 0], right: [1, 0, 0] }[side] as Vec3)),
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

test('Shift with E clicks or drags to a locked target face, grows and shrinks exactly, and keeps the target intact', async ({
  page,
}) => {
  const source = makeBody(200, 200, 40, [0, 0, 0], 'Muokattava');
  const taller = { ...makeBody(100, 80, 90, [300, 0, 0], 'Korkea tavoite'), locked: true };
  const shorter = makeBody(100, 80, 18, [300, 120, 0], 'Matala tavoite');
  await ready(page, [source, taller, shorter]);
  const point = await view(page, [source, taller, shorter]);
  const a = point(100, 100, 40),
    b = point(325, 25, 90),
    c = point(325, 145, 18);
  await page.keyboard.press('e');
  await click(page, a);
  await page.keyboard.down('Shift');
  await page.mouse.move(b.x, b.y);
  await expect(page.getByTestId('viewport')).toHaveAttribute(
    'data-depth-target',
    `${taller.id}:z:max`,
  );
  await expect(page.getByTestId('height-input')).toHaveValue('+50');
  await expect(page.getByTestId('remaining-input')).toHaveValue('90');
  await expect(page.getByTestId('remaining-input')).toHaveAttribute(
    'aria-label',
    'Toteutuva kokonaismitta',
  );
  await click(page, b);
  await page.keyboard.up('Shift');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  let model = await save(page);
  expect(model.bodies[0].feature.height).toBe(90);
  expect(model.bodies[1]).toEqual(taller);
  // A new drag uses the same active tool and can shorten the source to another part.
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.keyboard.down('Shift');
  await page.mouse.move(c.x, c.y, { steps: 5 });
  await expect(page.getByTestId('height-input')).toHaveValue('-72');
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  model = await save(page);
  expect(model.bodies[0].feature.height).toBe(18);
  expect(model.bodies[2]).toEqual(shorter);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies[0].feature.height).toBe(90);
});

test('typed push/pull wins over target snapping and Escape cancels a live target', async ({
  page,
}) => {
  const source = makeBody(200, 200, 40);
  const target = makeBody(100, 100, 90, [300, 0, 0]);
  await ready(page, [source, target]);
  const point = await view(page, [source, target]);
  const a = point(100, 100, 40),
    b = point(325, 50, 90);
  await page.keyboard.press('e');
  await click(page, a);
  await page.keyboard.down('Shift');
  await page.mouse.move(b.x, b.y);
  await expect(page.getByTestId('height-input')).toHaveValue('+50');
  await page.keyboard.press('Escape');
  await page.keyboard.up('Shift');
  expect((await save(page)).bodies).toEqual([source, target]);
  await page.keyboard.press('e');
  await click(page, a);
  await page.keyboard.type('25');
  await page.keyboard.down('Shift');
  await page.mouse.move(b.x, b.y);
  await expect(page.getByTestId('height-input')).toHaveValue('25');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-depth-target', '');
  await click(page, b);
  await page.keyboard.up('Shift');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  const model = await save(page);
  expect(model.bodies[0].feature.height).toBe(65);
  expect(model.bodies[1]).toEqual(target);
});

test('a nonparallel target supplies the pointed level without tilting the source face', async ({
  page,
}) => {
  const source = makeBody(200, 200, 40, [0, 0, 0], 'Suora osa');
  const frame = sketchFrame([300, 0, 160], [0, 0.6, 0.8]);
  const target = makeProfileBody(
    { kind: 'rectangle', width: 150, depth: 150 },
    frame,
    20,
    'Vino tavoite',
  );
  await ready(page, [source, target]);
  const point = await view(page, [source, target]);
  const top = { ...frame, origin: [300, 12, 176] as Vec3 };
  const level = fromUV([40, 40], top);
  await page.keyboard.press('e');
  await click(page, point(100, 100, 40));
  await page.keyboard.down('Shift');
  const end = point(...level);
  await page.mouse.move(end.x, end.y);
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-depth-kind', 'point');
  const measured = Number(await page.getByTestId('height-input').inputValue());
  // Browser pointer coordinates are subpixel-rounded; face raycasts allow 0.0005 mm.
  expect(measured).toBeCloseTo(level[2] - 40, 3);
  await click(page, end);
  await page.keyboard.up('Shift');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  const model = await save(page);
  expect(model.bodies[0].feature).toMatchObject({
    type: 'rectangle-extrusion',
    width: 200,
    depth: 200,
  });
  expect(model.bodies[0].feature.height).toBeCloseTo(level[2], 3);
  expect(model.bodies[1]).toEqual(target);
});

test('free E ignores other faces; Shift searches immediately and release continues without a jump', async ({
  page,
}) => {
  const source = makeBody(200, 200, 40),
    target = makeBody(100, 100, 90, [300, 0, 0]);
  await ready(page, [source, target]);
  const point = await view(page, [source, target]);
  const a = point(100, 100, 40),
    b = point(325, 50, 90);
  const field = page.getByTestId('height-input'),
    canvas = page.getByTestId('viewport');
  await page.keyboard.press('e');
  await click(page, a);
  await page.mouse.move(b.x, b.y);
  await expect(canvas).toHaveAttribute('data-depth-target', '');
  await expect(field).toHaveValue('-50'); // 50 mm free downward motion, regardless of target height.
  // The target's lower edge supplies a different free depth, but the same target plane.
  await page.mouse.move(b.x, b.y + 10);
  const free = Number(await field.inputValue());
  expect(free).toBeLessThan(-50);
  await page.keyboard.down('Shift'); // No extra pointer movement is needed.
  await expect(canvas).toHaveAttribute('data-depth-target', `${target.id}:z:max`);
  await expect(field).toHaveValue('+50');
  await page.keyboard.up('Shift');
  await expect(canvas).toHaveAttribute('data-depth-target', '');
  await expect(field).toHaveValue('+50');
  await page.mouse.move(b.x, b.y + 10);
  await expect(field).toHaveValue('+50');
  await page.mouse.move(b.x, b.y);
  const continued = Number(await field.inputValue());
  expect(continued - 50).toBeCloseTo(-50 - free, 1);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  const model = await save(page);
  expect(model.bodies[0].feature.height).toBeCloseTo(40 + continued, 4);
  expect(model.bodies[1]).toEqual(target);
});

test('perspective E grows smoothly while the cursor stays inside its own face, which Shift never targets', async ({
  page,
}) => {
  const source = makeBody(600, 400, 18);
  await ready(page, [source]);
  // This test verifies continuous drag mapping; grid stepping has its own regression.
  await page.getByRole('button', { name: 'Ruudukko 10 mm', exact: true }).click();
  const point = await view(page, [source]);
  await page.locator('.projection-button').click();
  const a = point(300, 200, 18);
  await page.keyboard.press('e');
  await click(page, a);
  const field = page.getByTestId('height-input'),
    canvas = page.getByTestId('viewport');
  const values: number[] = [];
  for (const pixels of [20, 40, 60, 80, 100, 120, 140]) {
    await page.mouse.move(a.x, a.y - pixels);
    await expect
      .poll(async () => Number(await field.inputValue()))
      .toBeGreaterThan(values.at(-1) ?? 0);
    values.push(Number(await field.inputValue()));
    await expect(canvas).toHaveAttribute('data-depth-target', '');
  }
  for (let i = 1; i < values.length; i++)
    expect(values[i] - values[i - 1]).toBeCloseTo(values[0], 1);
  const depth = values.at(-1)!;
  await page.keyboard.down('Shift');
  await page.mouse.move(a.x, a.y); // Original source face is still visible under the preview.
  await expect(canvas).toHaveAttribute('data-depth-target', '');
  await expect.poll(async () => Number(await field.inputValue())).toBe(depth);
  await click(page, a); // Invalid reference must not commit even the previous free depth.
  await expect(page.getByTestId('dynamic-input')).toBeVisible();
  await expect(canvas).toHaveAttribute('data-depth-target', '');
  await page.keyboard.up('Shift');
  await page.mouse.move(a.x, a.y);
  await expect.poll(async () => Number(await field.inputValue())).toBe(depth);
  await page.keyboard.press('Escape');
  expect((await save(page)).bodies).toEqual([source]);
});
