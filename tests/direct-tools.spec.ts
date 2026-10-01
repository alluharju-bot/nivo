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

test('E selects the hovered side face and dragging pulls it; selected-face numeric push reverses it', async ({
  page,
}, info) => {
  const body = makeBody(400, 300, 200);
  await ready(page, [body]);
  const point = await view(page, [body], 'front');
  await page.keyboard.press('e');
  await expect(page.getByRole('button', { name: 'Push / pull', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const start = point(200, 0, 100),
    end = point(200, 0, 140);
  await page.mouse.move(start.x, start.y);
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-hover-face', 'y:min');
  await page.screenshot({ path: info.outputPath('face-hover.png') });
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  let model = await save(page);
  expect(model.bodies[0].feature.depth).toBeCloseTo(340, 1);
  expect(model.bodies[0].origin[1]).toBeCloseTo(-40, 1);
  expect(model.bodies[0].feature.height).toBe(200);
  await page.keyboard.press('v');
  await click(page, start);
  await expect(page.locator('.selection-tag')).toContainText('Etupinta');
  await page.keyboard.press('e');
  await page.keyboard.type('-40');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  model = await save(page);
  expect(model.bodies[0].feature.depth).toBeCloseTo(300, 1);
  expect(model.bodies[0].origin[1]).toBeCloseTo(0, 1);
});

test('drag an edge-parallel guide, rotate after creation, lock and unlock a translation axis', async ({
  page,
}, info) => {
  const body = makeBody(400, 300, 0);
  await ready(page, [body]);
  const point = await view(page, [body]);
  await page.getByRole('button', { name: 'Mittatyökalu', exact: true }).click();
  const a = point(200, 0),
    b = point(260, -80);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('.guide-list>div')).toHaveCount(1);
  let model = await save(page),
    guide = model.guides[0];
  expect('edge' in guide.anchor).toBe(true);
  expect(Math.abs(guide.direction![0])).toBeCloseTo(1, 6);
  expect(guide.direction![1]).toBeCloseTo(0, 6);
  expect(guide.offset![1]).toBeCloseTo(-80, 1);
  const before = guide.angle;
  await page.keyboard.press('r');
  await expect(page.getByTestId('guide-angle')).toHaveValue(String((before + 45) % 360));
  await page.keyboard.press('Enter');
  await expect(page.locator('.guide-list>div')).toHaveCount(1);
  await page.keyboard.press('Shift+R');
  await expect(
    page.getByRole('button', { name: 'Vapaa kierto · Shift+R', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  const free = point(50, -140);
  await page.mouse.move(free.x, free.y);
  const angle = Number(await page.getByTestId('guide-angle').inputValue());
  expect(Math.abs(angle / 45 - Math.round(angle / 45))).toBeGreaterThan(0.05);
  await page.keyboard.press('y');
  await expect(page.getByRole('button', { name: 'Lukitse Y-akseli', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.keyboard.press('y');
  await expect(page.getByRole('button', { name: 'Lukitse Y-akseli', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(page.getByTestId('dynamic-input')).toBeVisible();
  await page.getByTestId('guide-angle').fill('90');
  await page.keyboard.press('Enter');
  await expect(page.locator('.guide-list>div')).toHaveCount(1);
  model = await save(page);
  expect(model.guides[0].direction![1]).toBeCloseTo(1, 6);
  await click(page, point(200, -120));
  await expect(page.getByRole('button', { name: 'Mittatyökalu', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.screenshot({ path: info.outputPath('edge-guide.png') });
});

test('guide occlusion is default, individual and global x-ray persist', async ({ page }, info) => {
  const body = makeBody(400, 300, 100),
    guide: Guide = {
      id: 'hidden',
      mode: 'guide',
      anchor: { point: [100, 150, 0] },
      length: 200,
      angle: 0,
      plane: 'XY',
    };
  await ready(page, [body], [guide]);
  await view(page, [body]);
  await expect(page.getByTestId('guide-label')).toBeHidden();
  await page.getByRole('button', { name: /^Viivat/ }).click();
  await page.getByRole('checkbox', { name: 'Viivan x-ray', exact: true }).check();
  await expect(page.getByTestId('guide-label')).toBeVisible();
  await page.screenshot({ path: info.outputPath('xray-guide.png') });
  await page.getByRole('checkbox', { name: 'Viivan x-ray', exact: true }).uncheck();
  await expect(page.getByTestId('guide-label')).toBeHidden();
  await page.locator('.viewport-settings summary').click();
  await page.getByRole('checkbox', { name: 'Kaikki apuviivat x-ray', exact: true }).check();
  await expect(page.getByTestId('guide-label')).toBeVisible();
  await expect(page.locator('.save-status')).toContainText('Tallessa selaimessa');
  await page.reload();
  await expect(page.getByTestId('guide-label')).toHaveAttribute('data-xray', 'true');
  const model = await save(page);
  expect(model.settings.guideXray).toBe(true);
  expect(model.guides[0].xray).toBe(false);
});

test('Shift locks the third pen segment while the first vertex supplies its exact length', async ({
  page,
}, info) => {
  await ready(page);
  const point = await view(page, []);
  await page.getByRole('button', { name: 'Kynä', exact: true }).click();
  for (const p of [
    [0, 0],
    [200, 0],
    [200, 100],
  ])
    await click(page, point(...(p as [number, number])));
  const heading = point(40, 100);
  await page.mouse.move(heading.x, heading.y);
  await page.keyboard.down('Shift');
  await expect(page.getByTestId('pen-length')).toBeVisible();
  const first = point(0, 0);
  await page.mouse.move(first.x, first.y);
  await expect(page.getByTestId('snap-hint')).toContainText('Pituus poimittu');
  await expect(page.getByTestId('pen-length')).toHaveValue('200');
  await page.screenshot({ path: info.outputPath('length-inference.png') });
  await click(page, first);
  await page.keyboard.up('Shift');
  await expect(page.getByRole('button', { name: 'Sulje muoto', exact: true })).toBeEnabled();
  const near = point(1, 1);
  await page.mouse.move(near.x, near.y);
  await expect(page.getByTestId('snap-hint')).toContainText('Aloituspiste');
  await click(page, near);
  await expect(page.locator('.object-list .object-select')).toHaveCount(1);
  const model = await save(page);
  expect(model.bodies[0].feature).toMatchObject({
    type: 'polygon-extrusion',
    points: [
      [0, 0],
      [200, 0],
      [200, 100],
      [0, 100],
    ],
  });
  // Z is also an axis shortcut: modifiers must retain undo/redo during both tools.
  for (const tool of ['k', 't']) {
    for (const modifier of ['Control', 'Meta']) {
      await page.keyboard.press(tool);
      await page.keyboard.press(`${modifier}+z`);
      await expect(page.locator('.object-list .object-select')).toHaveCount(0);
      await page.keyboard.press(`${modifier}+Shift+z`);
      await expect(page.locator('.object-list .object-select')).toHaveCount(1);
    }
  }
});

test('X and Z construct a vertical pen face, toggling the axis preserves the pen, E extrudes the face', async ({
  page,
}) => {
  await ready(page);
  const point = await view(page, [], 'front');
  await page.getByRole('button', { name: 'Kynä', exact: true }).click();
  await click(page, point(0, 0, 0));
  await page.keyboard.press('x');
  await click(page, point(200, 0, 0));
  await page.keyboard.press('z');
  await click(page, point(200, 0, 150));
  await page.keyboard.press('x');
  await click(page, point(0, 0, 150));
  await page.keyboard.press('x');
  await expect(page.getByRole('button', { name: 'Kynä', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await click(page, point(0, 0, 0));
  await expect(page.locator('.object-list .object-select')).toHaveCount(1);
  let model = await save(page);
  expect(model.bodies[0].feature.type).toBe('planar-polygon');
  await page.keyboard.press('e');
  await page.keyboard.type('20');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  model = await save(page);
  expect(model.bodies[0].feature).toMatchObject({
    type: 'brep',
    solid: true,
    width: 200,
    depth: 20,
    height: 150,
  });
  await page.reload();
  await expect(page.locator('.object-list .object-select')).toHaveCount(1);
});

test('large thin faces remain renderable while orbiting and switching projection', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await ready(page, [makeBody(80000, 60000, 18), makeBody(80000, 18, 30000, [0, 60000, 0])]);
  await page.getByRole('button', { name: '3D', exact: true }).click();
  const box = (await page.getByTestId('viewport').boundingBox())!,
    x = box.x + box.width * 0.6,
    y = box.y + box.height * 0.5;
  await page.mouse.move(x, y);
  await page.mouse.down({ button: 'right' });
  for (let i = 1; i <= 4; i++) {
    await page.mouse.move(x - i * 30, y + i * 12, { steps: 8 });
    await page.screenshot({ path: info.outputPath(`large-face-orbit-${i}.png`) });
  }
  await page.mouse.up({ button: 'right' });
  await page.getByRole('button', { name: 'Perspektiivi', exact: true }).click();
  await page.screenshot({ path: info.outputPath('large-face-orthographic.png') });
  expect(errors).toEqual([]);
  await expect(page.locator('.viewport-error')).toHaveCount(0);
});
