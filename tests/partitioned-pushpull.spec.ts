import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import init from 'replicad-opencascadejs';
import { setOC, makeVertex, measureDistanceBetween } from 'replicad';
import { makeBody, makeProfileBody, type Body, type Vec3 } from '../src/model/project';
import {
  createShape,
  meshBody,
  solidFaceIds,
  solidVolume,
  shapeIsValid,
  pushPullFace,
} from '../src/cad/kernel';
import { shapeFaces } from '../src/cad/topology';
import { splitFace } from '../src/cad/operations';
import { penPath } from '../src/cad/paths';
import { sketchFrame } from '../src/model/sketch';
import { ready, view, click, editBody, save } from './helpers';

test('joining an old drawing network cannot put a loose sheet over a finished recess', async ({
  page,
}, info) => {
  const source = makeBody(400, 300, 40, [0, 0, 0], 'Valmis painauma');
  const split = splitFace(
    source,
    'z:max',
    makeProfileBody({ kind: 'rectangle', width: 80, depth: 120 }, sketchFrame([40, 60, 40])),
  );
  const body = pushPullFace(split.body, split.face, -10);
  const outline = penPath(
    [
      [40, 60, 40],
      [120, 60, 40],
      [120, 180, 40],
      [40, 180, 40],
      [40, 60, 40],
    ],
    'Vanha rajaus',
  );
  await ready(page, [body, outline]);
  const baseline = await save(page);
  const p = await view(page, [body, outline]);
  await editBody(page, body.id);
  await page.keyboard.press('k');
  await click(page, p(120, 60, 40));
  await click(page, p(400, 60, 40));
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-pen-points', '[]');
  const result = await save(page);
  inspect(result.bodies[0], 400 * 300 * 40 - 80 * 120 * 10, [
    [80, 120, 30],
    [300, 220, 40],
  ]);
  expect(result.bodies.find((b) => b.id === outline.id)).toEqual(baseline.bodies[1]);
  await extrude(page, p(300, 220, 40), 5);
  const raised = await save(page);
  inspect(raised.bodies[0], 400 * 300 * 40 - 80 * 120 * 10 + (400 * 300 - 80 * 120) * 5, [
    [80, 120, 30],
    [300, 220, 45],
  ]);
  await page.getByRole('button', { name: 'Yleisnäkymä', exact: true }).click();
  await page.screenshot({ path: info.outputPath('old-outline-does-not-cover-pocket.png') });
});

test.beforeAll(async () =>
  setOC(
    await init({
      wasmBinary: readFileSync(new URL(import.meta.resolve('replicad-opencascadejs/wasm'))),
    }),
  ),
);

function inspect(body: Body, volume: number, points: Vec3[]) {
  const shape = createShape(body),
    faces = shapeFaces(shape);
  try {
    expect(shapeIsValid(shape)).toBe(true);
    expect(solidVolume(shape)).toBeCloseTo(volume, 1);
    const solidFaces = solidFaceIds(shape);
    expect(faces.every((f) => solidFaces.has(f.hashCode))).toBe(true);
    const mesh = meshBody(body, shape);
    const refs = points.map((point) => {
      const vertex = makeVertex(point);
      try {
        const face = mesh.faces.find(
          (f) => f.normal[2] > 0.99 && measureDistanceBetween(faces[f.index], vertex) < 1e-5,
        );
        expect(face, `Surface at ${point}`).toBeDefined();
        return face!.ref;
      } finally {
        vertex.delete();
      }
    });
    expect(new Set(refs).size).toBe(points.length);
  } finally {
    faces.forEach((f) => f.delete());
    shape.delete();
  }
}

async function extrude(page: Page, point: { x: number; y: number }, distance: number) {
  await page.keyboard.press('Escape');
  await page.mouse.move(point.x, point.y);
  await page.keyboard.press('e');
  await expect(page.getByTestId('dynamic-input')).toBeVisible();
  await page.keyboard.type(String(distance));
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
}

test('pen divisions remain independently editable through consecutive push/pulls and history', async ({
  page,
}, info) => {
  const body = makeBody(400, 300, 40, [0, 0, 0], 'Jaettu levy');
  await ready(page, [body]);
  const p = await view(page, [body]);
  await editBody(page, body.id);
  for (const x of [100, 250]) {
    await page.keyboard.press('k');
    await click(page, p(x, 0, 40));
    await click(page, p(x, 300, 40));
    await expect(page.locator('.status-bar [role="status"]')).toContainText('Pinta jaettu');
  }
  const divided = await save(page);
  expect(divided.bodies).toHaveLength(1);
  inspect(divided.bodies[0], 400 * 300 * 40, [
    [50, 150, 40],
    [175, 150, 40],
    [325, 150, 40],
  ]);
  await extrude(page, p(50, 150, 40), -10);
  const first = await save(page);
  inspect(first.bodies[0], 400 * 300 * 40 - 100 * 300 * 10, [
    [50, 150, 30],
    [175, 150, 40],
    [325, 150, 40],
  ]);
  await extrude(page, p(175, 150, 40), -20);
  const second = await save(page);
  inspect(second.bodies[0], 400 * 300 * 40 - 100 * 300 * 10 - 150 * 300 * 20, [
    [50, 150, 30],
    [175, 150, 20],
    [325, 150, 40],
  ]);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual(first.bodies);
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  expect((await save(page)).bodies).toEqual(second.bodies);
  await expect(page.locator('.save-status')).toContainText('Tallessa selaimessa');
  await page.reload();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
  const q = await view(page, second.bodies);
  await editBody(page, body.id);
  await extrude(page, q(325, 150, 40), 15);
  const third = await save(page);
  inspect(third.bodies[0], 400 * 300 * 40 - 100 * 300 * 10 - 150 * 300 * 20 + 150 * 300 * 15, [
    [50, 150, 30],
    [175, 150, 20],
    [325, 150, 55],
  ]);
  await page.getByRole('button', { name: 'Yleisnäkymä', exact: true }).click();
  await page.screenshot({ path: info.outputPath('three-real-solid-regions.png') });
});

test('pen recesses stay open when the surrounding solid surface is extruded', async ({
  page,
}, info) => {
  const body = makeBody(400, 300, 40, [0, 0, 0], 'Uritettu levy');
  await ready(page, [body]);
  const p = await view(page, [body]);
  await editBody(page, body.id);
  for (const x of [40, 200]) {
    await page.keyboard.press('k');
    for (const [a, b] of [
      [x, 60],
      [x + 80, 60],
      [x + 80, 180],
      [x, 180],
      [x, 60],
    ])
      await click(page, p(a, b, 40));
    await expect(page.locator('.status-bar [role="status"]')).toContainText('Pinta jaettu');
    await extrude(page, p(x + 40, 120, 40), -10);
  }
  await extrude(page, p(340, 220, 40), 5);
  const result = await save(page);
  expect(result.bodies).toHaveLength(1);
  inspect(result.bodies[0], 400 * 300 * 40 - 2 * 80 * 120 * 10 + (400 * 300 - 2 * 80 * 120) * 5, [
    [80, 120, 30],
    [240, 120, 30],
    [340, 220, 45],
  ]);
  // Actual viewport picking must see the pocket bottoms, not a stale cover face.
  await page.keyboard.press('Escape');
  for (const point of [
    [80, 120, 30],
    [240, 120, 30],
  ] as Vec3[]) {
    await page.keyboard.press('k');
    const at = p(...point);
    await page.mouse.move(at.x, at.y);
    await expect
      .poll(
        async () =>
          JSON.parse(
            (await page.getByTestId('viewport').getAttribute('data-snap-point')) || 'null',
          )?.[2],
      )
      .toBeCloseTo(30, 4);
    await page.keyboard.press('Escape');
  }
  await page.getByRole('button', { name: 'Yleisnäkymä', exact: true }).click();
  await page.screenshot({ path: info.outputPath('open-recesses-in-solid.png') });
});
