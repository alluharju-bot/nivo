import { test, expect, type Page } from '@playwright/test';
import { Camera, Vector3 } from 'three';
import { decode } from 'fast-png';
import { makeBody, type Guide, type Vec3 } from '../src/model/project';
import { guidePoints } from '../src/model/guides';
import { ready, view, click, save } from './helpers';

async function projected(page: Page, point: Vec3) {
  const canvas = page.getByTestId('viewport'),
    rect = (await canvas.boundingBox())!;
  const data = JSON.parse((await canvas.getAttribute('data-camera'))!);
  const camera = new Camera();
  camera.position.fromArray(data.position);
  camera.quaternion.fromArray(data.quaternion);
  camera.projectionMatrix.fromArray(data.projection);
  camera.updateMatrixWorld();
  const p = new Vector3(...point).project(camera);
  return { x: rect.x + ((p.x + 1) * rect.width) / 2, y: rect.y + ((1 - p.y) * rect.height) / 2 };
}
const snapped = async (page: Page): Promise<Vec3> =>
  JSON.parse((await page.getByTestId('viewport').getAttribute('data-snap-point')) || 'null');
async function freeMeasure(page: Page) {
  await page.keyboard.press('t');
  await page.getByRole('button', { name: 'Valitse mittatyökalu', exact: true }).click();
  await page.getByRole('menuitemradio', { name: /Vapaa mittaviiva/ }).click();
}
const plan: Guide = {
  id: 'plan',
  mode: 'free',
  anchor: { point: [48, 98, 13] },
  endAnchor: { point: [348, 98, 13] },
  direction: [1, 0, 0],
  length: 300,
  plane: 'XY',
  angle: 0,
};

test('measurement endpoints and crossings outrank nearby geometry and start a pen stroke exactly off grid', async ({
  page,
}, info) => {
  const floor = makeBody(600, 400, 13, [45, 97, 0]);
  const crossing: Guide = {
    id: 'cross',
    mode: 'guide',
    anchor: { point: [173, 0, 13] },
    direction: [0, 1, 0],
    length: 400,
    plane: 'XY',
    angle: 90,
  };
  await ready(page, [floor], [plan, crossing]);
  await view(page, [floor]);
  await freeMeasure(page);
  let p = await projected(page, [48, 98, 13]);
  await page.mouse.move(p.x - 17, p.y);
  await expect(page.getByTestId('snap-hint')).toHaveText('Mittaviiva · alku');
  await expect.poll(() => snapped(page)).toEqual([48, 98, 13]);
  await click(page, { x: p.x - 17, y: p.y });
  p = await projected(page, [173, 98, 13]);
  await page.mouse.move(p.x + 2, p.y + 3);
  await expect(page.getByTestId('snap-hint')).toHaveText('Mittaviivojen risteys');
  await click(page, { x: p.x + 2, y: p.y + 3 });
  const result = await save(page);
  expect(guidePoints(result.bodies, result.guides.at(-1)!)).toEqual([
    [48, 98, 13],
    [173, 98, 13],
  ]);
  await page.keyboard.press('Escape');
  await page.keyboard.press('k');
  p = await projected(page, [348, 98, 13]);
  await page.mouse.move(p.x + 17, p.y);
  await expect(page.getByTestId('snap-hint')).toContainText('Mittaviiva · pää');
  await expect.poll(() => snapped(page)).toEqual([348, 98, 13]);
  await click(page, { x: p.x + 17, y: p.y });
  p = await projected(page, [348, 198, 13]);
  await page.mouse.move(p.x, p.y);
  await page.screenshot({ path: info.outputPath('measurement-and-pen-points.png') });
  await click(page, p);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '2');
  const final = await save(page);
  expect(final.bodies).toHaveLength(2);
  expect(final.bodies[1].origin).toEqual([348, 98, 13]);
  await page.keyboard.press('t');
  p = await projected(page, [348, 198, 13]);
  await page.mouse.move(p.x + 17, p.y);
  await expect(page.getByTestId('snap-hint')).toHaveText('Viivan piste');
  await expect.poll(() => snapped(page)).toEqual([348, 198, 13]);
});

test('a perspective measurement keeps exact 48, 98 and 13 mm geometry with the 10 mm grid enabled', async ({
  page,
}) => {
  const body = makeBody(98, 48, 13, [0, 0, 0]);
  await ready(page, [body]);
  await view(page, [body]);
  await page.getByRole('button', { name: 'Yleisnäkymä', exact: true }).click();
  await freeMeasure(page);
  for (const [a, b, length] of [
    [[0, 0, 13], [98, 0, 13], 98],
    [[98, 0, 13], [98, 48, 13], 48],
    [[98, 0, 13], [98, 0, 0], 13],
  ] as [Vec3, Vec3, number][]) {
    await click(page, await projected(page, a));
    const p = await projected(page, b);
    await page.mouse.move(p.x + 2, p.y);
    await expect.poll(() => snapped(page)).toEqual(b);
    await click(page, { x: p.x + 2, y: p.y });
    const result = await save(page);
    const ends = guidePoints(result.bodies, result.guides.at(-1)!)!;
    expect(Math.hypot(...ends[0].map((n, i) => n - ends[1][i]))).toBeCloseTo(length, 7);
    expect(result.bodies).toEqual([body]);
    await page.keyboard.press('Enter');
  }
});

test('guide endpoints keep a visible ring when zoom changes and a finite line has no phantom extension', async ({
  page,
}, info) => {
  const floor = makeBody(1000, 800, 13, [0, 0, 0]);
  const line = {
    ...plan,
    anchor: { point: [248, 298, 13] as Vec3 },
    endAnchor: { point: [748, 298, 13] as Vec3 },
    length: 500,
  };
  await ready(page, [floor], [line]);
  await view(page, [floor]);
  await page.keyboard.press('v');
  const canvas = page.getByTestId('viewport');
  const ringPixels = async () => {
    const point = await projected(page, [248, 298, 13]),
      rect = (await canvas.boundingBox())!;
    const png = decode(await canvas.screenshot());
    const ratio = png.width / rect.width,
      cx = Math.round((point.x - rect.x) * ratio),
      cy = Math.round((point.y - rect.y) * ratio);
    let white = 0;
    for (let y = cy - Math.ceil(9 * ratio); y <= cy + Math.ceil(9 * ratio); y++)
      for (let x = cx - Math.ceil(9 * ratio); x <= cx + Math.ceil(9 * ratio); x++) {
        const i = (y * png.width + x) * png.channels;
        // The small ring is antialiased into the colored surface below it.
        if (png.data[i] > 230 && png.data[i + 1] > 230 && png.data[i + 2] > 230) white++;
      }
    return white;
  };
  await expect.poll(ringPixels).toBeGreaterThan(12);
  const before = await ringPixels();
  const center = await projected(page, [248, 298, 13]);
  await page.mouse.move(center.x, center.y);
  const oldCamera = await canvas.getAttribute('data-camera');
  await page.mouse.wheel(0, -400);
  await expect(canvas).not.toHaveAttribute('data-camera', oldCamera!);
  const after = await ringPixels();
  expect(after).toBeGreaterThan(before * 0.65);
  expect(after).toBeLessThan(before * 1.5);
  await page.screenshot({ path: info.outputPath('endpoint-zoom.png') });
  await page.keyboard.press('k');
  const p = await projected(page, [800, 298, 13]);
  await page.mouse.move(p.x, p.y);
  await expect(canvas).not.toHaveAttribute('data-snap-key', /plan:/);
});

test('fillet hover is a thick orange edge and selected edges stay highlighted', async ({
  page,
}, info) => {
  const body = makeBody(300, 200, 40);
  await ready(page, [body]);
  const p = await view(page, [body]);
  await page.keyboard.press('f');
  const edge = p(120, 0, 40);
  await page.mouse.move(edge.x, edge.y + 7);
  const canvas = page.getByTestId('viewport');
  await expect(canvas).toHaveAttribute('data-detail-hover', /.+:\d+/);
  const png = decode(await canvas.screenshot());
  const rect = (await canvas.boundingBox())!,
    ratio = png.width / rect.width;
  const cx = Math.round((edge.x - rect.x) * ratio),
    cy = Math.round((edge.y - rect.y) * ratio);
  let orange = 0;
  for (let y = cy - 5; y <= cy + 5; y++)
    for (let x = cx - 25; x <= cx + 25; x++) {
      const i = (y * png.width + x) * png.channels;
      if (png.data[i] > png.data[i + 1] * 1.25 && png.data[i + 1] > png.data[i + 2] * 1.3) orange++;
    }
  expect(orange).toBeGreaterThan(70);
  await click(page, edge);
  const other = p(300, 80, 40);
  await page.mouse.move(other.x, other.y);
  await expect(page.getByRole('region', { name: 'Viisteet ja pyöristykset' })).toContainText(
    '1 reunaa valittu',
  );
  await page.screenshot({ path: info.outputPath('orange-fillet-edges.png') });
});
