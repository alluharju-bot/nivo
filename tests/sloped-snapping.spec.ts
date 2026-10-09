import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { Camera, Vector3 } from 'three';
import {
  makeProfileBody,
  type Body,
  type Guide,
  type Vec3,
  type Project,
  freshProject,
} from '../src/model/project';
import { sketchFrame } from '../src/model/sketch';
import { ready, view, click, save } from './helpers';
import { guidePoints } from '../src/model/guides';
const ring = () =>
  makeProfileBody(
    { kind: 'circle', radius: 100 },
    sketchFrame([0, 0, -10]),
    0,
    'Kaivo',
    'construction',
  );
const rectangle = () =>
  makeProfileBody(
    { kind: 'rectangle', width: 1000, depth: 1000 },
    sketchFrame([-500, -500, 0]),
    0,
    'Alue',
    'construction',
  );
const snapped = async (page: Page): Promise<Vec3> =>
  JSON.parse((await page.getByTestId('viewport').getAttribute('data-snap-point')) || 'null');
async function at(page: Page, point: Vec3) {
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
async function near(page: Page, point: Vec3) {
  await expect
    .poll(async () => {
      const p = await snapped(page);
      return p ? Math.hypot(...p.map((n, i) => n - point[i])) : Infinity;
    })
    .toBeLessThan(0.001);
}
async function free(page: Page) {
  await page.getByRole('button', { name: 'Valitse mittatyökalu', exact: true }).click();
  await page.getByRole('menuitemradio', { name: /^Vapaa mittaviiva/ }).click();
}
for (const perspective of [false, true])
  test(`finished sloping loft edges keep exact height ${perspective ? 'in perspective' : 'from above'}`, async ({
    page,
  }) => {
    const project = JSON.parse(
      await readFile('tests/fixtures/sloped-surface.nivo', 'utf8'),
    ) as Project;
    await ready(page, project.bodies);
    await view(page, project.bodies);
    if (perspective) await page.getByRole('button', { name: 'Yleisnäkymä', exact: true }).click();
    await page.keyboard.press('k');
    const start: Vec3 = [1000, 270, -2.7],
      end: Vec3 = [1000, 830, -8.3];
    for (const point of [start, end]) {
      const p = await at(page, point);
      await page.mouse.move(p.x, p.y);
      await near(page, point);
      await click(page, p);
    }
    const drawn = JSON.parse((await page.getByTestId('viewport').getAttribute('data-pen-points'))!);
    expect(drawn).toHaveLength(2);
    drawn.forEach((p: Vec3, i: number) =>
      p.forEach((n, k) => expect(n).toBeCloseTo([start, end][i][k], 3)),
    );
  });
for (const tool of ['pen', 'measure'])
  test(`${tool}: Shift samples a lower circle while holding direction, release reaches the true lower rim`, async ({
    page,
  }) => {
    const bodies = [rectangle(), ring()];
    const guide: Guide = {
      id: 'start',
      mode: 'free',
      plane: 'XY',
      angle: 0,
      anchor: { point: [-400, 250, 0] },
      direction: [1, 0, 0],
      length: 200,
    };
    await ready(page, bodies, [guide]);
    const p = await view(page, bodies);
    if (tool === 'pen') await page.keyboard.press('k');
    else await free(page);
    await click(page, p(-400, 250));
    await page.mouse.move(p(-200, 250).x, p(-200, 250).y);
    await page.keyboard.down('Shift');
    await page.mouse.move(p(100, 0, -10).x, p(100, 0, -10).y);
    await expect(page.getByTestId('snap-hint')).toContainText('Pituus poimittu');
    await near(page, [100, 250, 0]);
    await page.keyboard.up('Shift');
    await near(page, [100, 0, -10]);
    await click(page, p(100, 0, -10));
    await page.keyboard.press('Enter');
    const result = await save(page);
    if (tool === 'measure')
      expect(
        guidePoints(result.bodies, result.guides.at(-1)!)?.map((p) =>
          p.map((n) => (Math.abs(n) < 1e-9 ? 0 : n)),
        ),
      ).toEqual([
        [-400, 250, 0],
        [100, 0, -10],
      ]);
    else expect(result.bodies.at(-1)!.origin[2]).toBeCloseTo(-10, 5);
  });

test('guide / circle crossings are exact, and Shift can sample their projection at another height', async ({
  page,
}) => {
  const bodies = [rectangle(), ring()];
  const make = (z: number): Guide => ({
    id: 'diagonal',
    mode: 'free',
    plane: 'XY',
    angle: 45,
    anchor: { point: [-400, -400, z] },
    direction: [Math.SQRT1_2, Math.SQRT1_2, 0],
    length: 1000,
  });
  await ready(page, bodies, [make(-10)]);
  let p = await view(page, bodies);
  await page.keyboard.press('k');
  const r = 100 / Math.SQRT2;
  await page.mouse.move(p(r, r, -10).x, p(r, r, -10).y);
  await expect(page.getByTestId('snap-hint')).toContainText('risteys');
  await near(page, [r, r, -10]);
  await page.keyboard.press('Escape');
  await page.getByTestId('project-file').setInputFiles({
    name: 'shift-projection.nivo',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...freshProject(), bodies, guides: [make(0)] })),
  });
  p = await view(page, bodies);
  await free(page);
  await click(page, p(-400, -400));
  await page.mouse.move(p(-200, -200).x, p(-200, -200).y);
  await page.keyboard.down('Shift');
  await page.mouse.move(p(r, r).x, p(r, r).y);
  await expect(page.getByTestId('snap-hint')).toContainText('projektio');
  await near(page, [r, r, 0]);
  await page.keyboard.up('Shift');
});

test('radial pen strokes create and subdivide the drain slope, with undo, redo and reload', async ({
  page,
}, info) => {
  const bodies = [rectangle(), ring()];
  const r = 100 / Math.SQRT2;
  const guides: Guide[] = [1, -1].map((sign, i) => ({
    id: `cross-${i}`,
    mode: 'guide',
    plane: 'XY',
    angle: sign * 45,
    anchor: { point: [0, 0, -10] },
    direction: [Math.SQRT1_2, sign * Math.SQRT1_2, 0],
    length: 700,
  }));
  await ready(page, bodies, guides);
  const p = await view(page, bodies);
  for (const [i, [x, y]] of [
    [500, 500],
    [-500, 500],
    [-500, -500],
    [500, -500],
  ].entries()) {
    await page.keyboard.press('k');
    await click(page, p(x, y));
    await page.mouse.move(
      p(Math.sign(x) * r, Math.sign(y) * r, -10).x,
      p(Math.sign(x) * r, Math.sign(y) * r, -10).y,
    );
    await near(page, [Math.sign(x) * r, Math.sign(y) * r, -10]);
    await click(page, p(Math.sign(x) * r, Math.sign(y) * r, -10));
    if (i === 0) await page.keyboard.press('Enter');
    else
      await expect(page.locator('.status-bar [role="status"]')).toContainText('täytetty pinnoiksi');
    await expect
      .poll(async () => (await save(page)).bodies.filter((b) => b.penRegion).length)
      .toBe(i === 0 ? 0 : i + 1);
  }
  const all = await save(page);
  expect(all.bodies.filter((b) => b.penRegion)).toHaveLength(4);
  await page.screenshot({ path: info.outputPath('drain-slopes.png') });
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies.filter((b) => b.penRegion)).toHaveLength(3);
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  expect((await save(page)).bodies).toEqual(all.bodies);
  await page.reload();
  await expect(page.getByTestId('viewport')).toHaveAttribute(
    'data-mesh-count',
    String(all.bodies.length),
  );
  expect((await save(page)).bodies).toEqual(all.bodies);
});

test('closing a four-corner spatial pen boundary creates a surface without flattening the corners', async ({
  page,
}) => {
  const points: Vec3[] = [
    [0, 0, 0],
    [500, 0, 0],
    [500, 400, -10],
    [0, 400, -20],
  ];
  const guides: Guide[] = points.map((point, i) => ({
    id: `point-${i}`,
    mode: 'free',
    plane: 'XY',
    anchor: { point },
    angle: 0,
    length: 30,
    direction: [1, 0, 0],
  }));
  await ready(page, [], guides);
  const p = await view(page, []);
  await page.keyboard.press('k');
  for (const point of points) {
    await page.mouse.move(p(...point).x, p(...point).y);
    await near(page, point);
    await click(page, p(...point));
  }
  await click(page, p(...points[0]));
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
  const result = await save(page);
  expect(result.bodies[0].feature.type).toBe('brep');
  expect(result.bodies[0].origin[2]).toBeCloseTo(-20, 4);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toHaveLength(0);
});
