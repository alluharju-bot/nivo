import { test, expect, type Page } from '@playwright/test';
import { Camera, Vector3 } from 'three';
import { ready, view, click, save, revealBrowser } from './helpers';
import { makeBody, type Vec3, type Guide } from '../src/model/project';

async function projected(page: Page, point: Vec3) {
  const viewport = page.getByTestId('viewport'),
    rect = (await viewport.boundingBox())!;
  const data = JSON.parse((await viewport.getAttribute('data-camera'))!);
  const camera = new Camera();
  camera.position.fromArray(data.position);
  camera.quaternion.fromArray(data.quaternion);
  camera.projectionMatrix.fromArray(data.projection);
  camera.updateMatrixWorld();
  const p = new Vector3(...point).project(camera);
  return { x: rect.x + ((p.x + 1) * rect.width) / 2, y: rect.y + ((1 - p.y) * rect.height) / 2 };
}
const snapped = async (page: Page) =>
  JSON.parse((await page.getByTestId('viewport').getAttribute('data-snap-point')) || 'null');

for (const perspective of [false, true]) {
  test(`a large floor splits immediately between edge midpoints ${perspective ? 'in perspective' : 'from above'}`, async ({
    page,
  }) => {
    const floor = makeBody(6000, 4000, 100, [12000, 8000, -100], 'Lattia');
    await ready(page, [floor]);
    await view(page, [floor]);
    if (perspective) await page.getByRole('button', { name: '3D', exact: true }).click();
    const at = (point: Vec3) => projected(page, point);
    await page.keyboard.press('k');
    const start = await at([15000, 8000, 0]),
      end = await at([15000, 12000, 0]);
    await page.mouse.move(start.x, start.y);
    await expect.poll(() => snapped(page)).toEqual([15000, 8000, 0]);
    await click(page, start);
    await page.mouse.move(end.x, end.y);
    await expect.poll(() => snapped(page)).toEqual([15000, 12000, 0]);
    await click(page, end);
    await expect(page.locator('.status-bar [role="status"]')).toContainText('Pinta jaettu');
    await page.keyboard.press('Enter'); // Finishing again must not add a duplicate wire/history action.
    const divided = await save(page);
    expect(divided.bodies).toHaveLength(1);
    expect(divided.bodies[0].feature.type).toBe('brep');
    expect(divided.bodies[0].origin).toEqual(floor.origin);
    await page.keyboard.press('Escape');
    const left = await at([13500, 10000, 0]),
      right = await at([16500, 10000, 0]);
    await page.mouse.move(left.x, left.y);
    const leftFace = await page.getByTestId('viewport').getAttribute('data-hover-face');
    await page.mouse.move(right.x, right.y);
    const rightFace = await page.getByTestId('viewport').getAttribute('data-hover-face');
    expect(leftFace).toBeTruthy();
    expect(rightFace).toBeTruthy();
    expect(leftFace).not.toBe(rightFace);
    await page.getByRole('button', { name: 'Peru', exact: true }).click();
    expect((await save(page)).bodies).toEqual([floor]);
    await page.getByRole('button', { name: 'Palauta', exact: true }).click();
    expect((await save(page)).bodies).toEqual(divided.bodies);
  });
}

test('Shift pressed at the start captures the direction, keeps reference projection and releases at the next vertex', async ({
  page,
}) => {
  const floor = makeBody(800, 600, 20, [0, 0, -20]);
  const guides: Guide[] = [
    {
      id: 'x',
      anchor: { point: [550, 0, 0] },
      direction: [0, 1, 0],
      plane: 'XY',
      angle: 90,
      length: 600,
      mode: 'guide',
    },
    {
      id: 'y',
      anchor: { point: [0, 400, 0] },
      direction: [1, 0, 0],
      plane: 'XY',
      angle: 0,
      length: 800,
      mode: 'guide',
    },
  ];
  await ready(page, [floor], guides);
  const p = await view(page, [floor]);
  await page.keyboard.press('k');
  await click(page, p(100, 100));
  await page.keyboard.down('Shift');
  await page.mouse.move(p(250, 100).x, p(250, 100).y);
  await page.mouse.move(p(550, 400).x, p(550, 400).y);
  await expect.poll(() => snapped(page)).toEqual([550, 100, 0]);
  await expect(page.getByTestId('snap-hint')).toContainText('Suunta lukittu');
  await expect(page.getByTestId('snap-hint')).toContainText('Apuviivojen risteys');
  await page.mouse.move(p(400, 320).x, p(400, 320).y);
  await expect.poll(async () => (await snapped(page))[1]).toBe(100);
  await page.keyboard.up('Shift');
  await page.mouse.move(p(400, 320).x, p(400, 320).y);
  await expect.poll(async () => (await snapped(page))[1]).toBeGreaterThan(200);
  await page.mouse.move(p(250, 100).x, p(250, 100).y);
  await page.keyboard.down('Shift');
  await click(page, p(550, 400));
  // The completed segment releases its temporary lock even while Shift is still held.
  await page.mouse.move(p(550, 250).x, p(550, 250).y);
  await expect.poll(async () => (await snapped(page))[1]).toBeGreaterThan(200);
  await page.keyboard.up('Shift');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '2');
  const line = (await save(page)).bodies[1];
  expect(line.origin).toEqual([100, 100, 0]);
  expect(line.feature.width).toBe(450);
  expect(line.feature.depth).toBe(0);
});

test('Shift can be held before the first point and X explicitly replaces a diagonal direction', async ({
  page,
}) => {
  const floor = makeBody(800, 600, 20, [0, 0, -20]);
  await ready(page, [floor]);
  const p = await view(page, [floor]);
  await page.keyboard.press('k');
  await page.keyboard.down('Shift');
  await click(page, p(100, 100));
  await page.mouse.move(p(250, 250).x, p(250, 250).y);
  await page.mouse.move(p(600, 400).x, p(600, 400).y);
  await expect
    .poll(async () => {
      const point = await snapped(page);
      return Math.abs(point[0] - point[1]);
    })
    .toBeLessThan(1e-6);
  await page.keyboard.press('x');
  await page.mouse.move(p(600, 400).x, p(600, 400).y);
  await expect.poll(async () => (await snapped(page))[1]).toBe(100);
  await page.keyboard.up('Shift');
  await page.mouse.move(p(500, 300).x, p(500, 300).y);
  await expect.poll(async () => (await snapped(page))[1]).toBe(100);
  await page.keyboard.press('x');
  await page.mouse.move(p(500, 300).x, p(500, 300).y);
  await expect.poll(async () => (await snapped(page))[1]).toBeGreaterThan(200);
});

test('Hold preserves the surface color and blocks drawing edits and double-click editing until unlocked', async ({
  page,
}, info) => {
  const floor = { ...makeBody(600, 400, 100, [0, 0, -100], 'Lattia'), color: '#afbb92' };
  await ready(page, [floor]);
  const p = await view(page, [floor]);
  const viewport = page.getByTestId('viewport');
  const center = p(300, 200);
  const sample = async () => {
    await page.mouse.move(10, 10);
    const data = (await viewport.screenshot()).toString('base64');
    const rect = (await viewport.boundingBox())!;
    return page.evaluate(
      async ({ data, rect, center }) => {
        const image = new Image();
        image.src = `data:image/png;base64,${data}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(image, 0, 0);
        return [
          ...ctx.getImageData(
            ((center.x - rect.x) * image.width) / rect.width,
            ((center.y - rect.y) * image.height) / rect.height,
            1,
            1,
          ).data,
        ];
      },
      { data, rect, center },
    );
  };
  const before = await sample();
  await revealBrowser(page);
  await page.getByRole('button', { name: 'Kiinnitä: Lattia', exact: true }).click();
  await view(page, [floor]);
  expect(await sample()).toEqual(before);
  await page.mouse.dblclick(center.x, center.y);
  await expect(viewport).toHaveAttribute('data-editing-body', '');
  await page.keyboard.press('k');
  await click(page, p(300, 0));
  await click(page, p(300, 400));
  await page.keyboard.press('Enter');
  await expect(viewport).toHaveAttribute('data-mesh-count', '2');
  let result = await save(page);
  expect(result.bodies[0]).toEqual({ ...floor, locked: true });
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  await expect(viewport).toHaveAttribute('data-mesh-count', '1');
  await page.getByRole('button', { name: 'Valitse', exact: true }).click();
  await revealBrowser(page);
  await page.getByTestId(`body-${floor.id}`).click();
  await expect(page.locator('.hold-notice')).toContainText('muokkauslukittu');
  await page.screenshot({ path: info.outputPath('hold-keeps-material.png') });
  await page.getByRole('button', { name: 'Vapauta: Lattia', exact: true }).click();
  await view(page, [floor]);
  await page.keyboard.press('k');
  await click(page, p(300, 0));
  await click(page, p(300, 400));
  await expect(page.locator('.status-bar [role="status"]')).toContainText('Pinta jaettu');
  result = await save(page);
  expect(result.bodies).toHaveLength(1);
  expect(result.bodies[0].feature.type).toBe('brep');
  expect(result.bodies[0].locked).toBe(false);
});
