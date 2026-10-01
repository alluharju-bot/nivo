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

test('652 becomes exactly 550, and Tab reinterprets the same 150 as the final size', async ({
  page,
}, info) => {
  const body = makeBody(652, 300, 18);
  await ready(page, [body]);
  const point = await view(page, [body], 'right');
  await click(page, point(652, 150, 9));
  await page.keyboard.press('e');
  await expect(page.getByTestId('remaining-input')).toHaveValue('652');
  await page.getByTestId('remaining-input').fill('550');
  await expect(page.getByTestId('height-input')).toHaveValue('-102');
  await expect(page.getByTestId('extrusion-remaining')).toHaveText(
    'Toteutuva kokonaismitta 550 mm',
  );
  await page.getByRole('button', { name: '3D', exact: true }).click();
  await page.screenshot({ path: info.outputPath('final-size.png') });
  await view(page, [body], 'right');
  await page.getByTestId('remaining-input').press('Enter');
  let model = await save(page);
  expect(model.bodies[0].feature.width).toBe(550);
  expect(model.bodies[0].origin).toEqual([0, 0, 0]);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  await expect(page.getByRole('contentinfo').getByRole('status')).toHaveText('Muokkaus peruttu.');
  await click(page, point(652, 150, 9));
  await page.keyboard.press('e');
  await expect(page.getByTestId('remaining-input')).toHaveValue('652');
  await page.keyboard.type('-150');
  await expect(page.getByTestId('remaining-input')).toHaveValue('502');
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('remaining-input')).toBeFocused();
  await expect(page.getByTestId('remaining-input')).toHaveValue('150');
  await expect(page.getByTestId('height-input')).toHaveValue('-502');
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByTestId('height-input')).toHaveValue('150');
  await expect(page.getByTestId('remaining-input')).toHaveValue('502');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  model = await save(page);
  expect(model.bodies[0].feature.width).toBe(150);
  await expect(page.locator('.save-status')).toContainText('Tallessa selaimessa');
  await page.reload();
  expect((await save(page)).bodies[0]).toEqual(model.bodies[0]);
});

test('unsigned entry follows an inward drag, explicit plus overrides it, and release commits once', async ({
  page,
}) => {
  const body = makeBody(300, 652, 200);
  await ready(page, [body]);
  const point = await view(page, [body], 'front'),
    start = point(150, 0, 100);
  await page.keyboard.press('e');
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x, start.y + 30, { steps: 5 });
  await expect(page.getByTestId('remaining-input')).toBeVisible();
  await page.keyboard.type('150');
  await expect(page.getByTestId('remaining-input')).toHaveValue('502');
  await page.mouse.up();
  expect((await save(page)).bodies[0]).toMatchObject({
    origin: [0, 150, 0],
    feature: { depth: 502 },
  });
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  await expect(page.getByRole('contentinfo').getByRole('status')).toHaveText('Muokkaus peruttu.');
  await page.keyboard.press('e');
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x, start.y + 30, { steps: 5 });
  await expect(page.getByTestId('remaining-input')).toBeVisible();
  await page.keyboard.type('+150');
  await expect(page.getByTestId('remaining-input')).toHaveValue('802');
  await page.mouse.up();
  expect((await save(page)).bodies[0]).toMatchObject({
    origin: [0, -150, 0],
    feature: { depth: 802 },
  });
});

test('a circular pocket can keep exactly 5 mm of material and rejects a negative final size', async ({
  page,
}) => {
  const body = makeBody(400, 300, 40);
  await ready(page, [body]);
  const point = await view(page, [body]);
  await page.keyboard.press('c');
  const a = point(200, 150, 40),
    b = point(250, 150, 40);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  await page.keyboard.press('e');
  await expect(page.getByTestId('remaining-input')).toHaveValue('40');
  await page.getByTestId('remaining-input').fill('-5');
  await page.getByTestId('remaining-input').press('Enter');
  await expect(page.getByRole('alert')).toContainText('positiivinen');
  await page.getByTestId('remaining-input').fill('5');
  await expect(page.getByTestId('height-input')).toHaveValue('-35');
  await page.getByTestId('remaining-input').press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  await click(page, point(200, 150, 5));
  await page.keyboard.press('e');
  await expect(page.getByTestId('remaining-input')).toHaveValue('5');
  await page.getByTestId('remaining-input').fill('5');
  await page.getByTestId('remaining-input').press('Enter');
  await expect(page.getByRole('contentinfo').getByRole('status')).toContainText('jo haluttu');
  expect((await save(page)).bodies[0].feature.height).toBeCloseTo(40, 6);
});
