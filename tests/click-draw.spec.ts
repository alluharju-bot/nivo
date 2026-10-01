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

test('offset cabinet accepts a two-click door at its front corners as a separate part, then extrudes it', async ({
  page,
}, info) => {
  const box = makeBody(600, 600, 2400);
  await ready(page, [box]);
  const point = await view(page, [box], 'front');
  const center = point(300, 0, 1200);
  await page.mouse.move(center.x, center.y);
  await page.keyboard.press('o');
  await page.keyboard.type('18');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  await page.keyboard.press('e');
  await expect(page.getByTestId('remaining-input')).toHaveValue('600');
  await page.getByTestId('remaining-input').fill('18');
  await page.getByTestId('remaining-input').press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  const cabinet = (await save(page)).bodies[0];
  await page.keyboard.press('s');
  await click(page, point(0, 0, 2400));
  const end = point(600, 0, 0);
  await page.mouse.move(end.x, end.y, { steps: 5 });
  await expect(page.getByTestId('width-input')).toHaveValue('600');
  await expect(page.getByTestId('depth-input')).toHaveValue('2400');
  await expect(page.locator('.object-list .object-select')).toHaveCount(1);
  await click(page, end);
  await expect(page.locator('.object-list .object-select')).toHaveCount(2);
  let model = await save(page);
  expect(model.bodies[0]).toEqual(cabinet);
  expect(model.bodies[1].origin).toEqual([0, 0, 0]);
  expect(model.bodies[1].feature).toMatchObject({
    type: 'profile-extrusion',
    width: 600,
    depth: 0,
    height: 2400,
    distance: 0,
  });
  await page.keyboard.press('e');
  await page.keyboard.type('18');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  model = await save(page);
  expect(model.bodies[0]).toEqual(cabinet);
  expect(model.bodies[1].feature).toMatchObject({ width: 600, depth: 18, height: 2400 });
  expect(model.bodies[1].origin[1]).toBe(-18);
  await page.getByRole('button', { name: '3D', exact: true }).click();
  await page.screenshot({ path: info.outputPath('cabinet-door.png') });
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies[1].feature.depth).toBe(0);
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  await page.reload();
  expect((await save(page)).bodies).toEqual(model.bodies);
});

test('new-part drawing uses a held vertical face as a plane and preserves typed sizes on the second click', async ({
  page,
}) => {
  const source = { ...makeBody(400, 100, 300), locked: true };
  await ready(page, [source]);
  const point = await view(page, [source], 'front');
  await page.keyboard.press('s');
  await page.getByRole('combobox', { name: 'Piirtotapa', exact: true }).selectOption('new');
  await click(page, point(60, 0, 60));
  await page.getByTestId('width-input').fill('120');
  await page.getByTestId('depth-input').fill('160');
  await page.getByRole('textbox', { name: 'Muodon paksuus', exact: true }).fill('12');
  const end = point(320, 0, 260);
  await page.mouse.move(end.x, end.y);
  await click(page, end);
  await expect(page.locator('.object-list .object-select')).toHaveCount(2);
  const model = await save(page);
  expect(model.bodies[0]).toEqual(source);
  expect(model.bodies[1]).toMatchObject({
    origin: [60, -12, 60],
    feature: { width: 120, depth: 12, height: 160 },
  });
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual([source]);
});

test('two-click circle still divides a face; a subsequent ellipse can be cancelled without committing', async ({
  page,
}) => {
  const plate = makeBody(400, 300, 40);
  await ready(page, [plate]);
  const point = await view(page, [plate]);
  await page.keyboard.press('c');
  await click(page, point(200, 150, 40));
  const edge = point(250, 150, 40);
  await page.mouse.move(edge.x, edge.y);
  await expect(page.getByTestId('diameter-input')).toHaveValue('100');
  await click(page, edge);
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  const divided = await save(page);
  expect(divided.bodies).toHaveLength(1);
  expect(divided.bodies[0].feature.type).toBe('brep');
  await page.keyboard.press('e');
  await page.keyboard.type('-10');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  const pocket = await save(page);
  expect(pocket.bodies[0].feature).not.toEqual(divided.bodies[0].feature);
  await page.keyboard.press('c');
  await page.getByRole('combobox', { name: 'Muoto', exact: true }).selectOption('ellipse');
  await click(page, point(100, 80, 40));
  const corner = point(130, 100, 40);
  await page.mouse.move(corner.x, corner.y);
  await expect(page.getByTestId('diameter-input')).toHaveValue('60');
  await page.keyboard.press('Escape');
  expect((await save(page)).bodies).toEqual(pocket.bodies);
});

test('a strip across two cabinets creates one complete independent part and leaves both cabinets intact', async ({
  page,
}) => {
  const left = makeBody(300, 400, 600),
    right = makeBody(300, 400, 600, [300, 0, 0]);
  await ready(page, [left, right]);
  const point = await view(page, [left, right], 'front');
  await page.keyboard.press('s');
  await page.getByRole('textbox', { name: 'Muodon paksuus', exact: true }).fill('10');
  await click(page, point(50, 0, 200));
  const end = point(550, 0, 240);
  await page.mouse.move(end.x, end.y);
  await expect(page.getByTestId('width-input')).toHaveValue('500');
  await click(page, end);
  await expect(page.locator('.object-list .object-select')).toHaveCount(3);
  const model = await save(page);
  expect(model.bodies.slice(0, 2)).toEqual([left, right]);
  expect(model.bodies[2]).toMatchObject({
    origin: [50, -10, 200],
    feature: { width: 500, depth: 10, height: 40 },
  });
  await page.reload();
  expect((await save(page)).bodies).toEqual(model.bodies);
});
