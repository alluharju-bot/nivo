import { expect, test } from '@playwright/test';
import * as THREE from 'three';
import { makeBody, makeProfileBody, makePolygonBody } from '../src/model/project';
import { sketchFrame, fromUV } from '../src/model/sketch';
import { ready, view, click, save } from './helpers';

test('a sketch on a vertical off-grid face is selected and extruded at its exact plane', async ({
  page,
}) => {
  const support = makeBody(600, 18.125, 400, [0, 7.125, 0]);
  await ready(page, [support]);
  const p = await view(page, [support], 'front');
  await page.keyboard.press('s');
  await click(page, p(100, 7.125, 100));
  await click(page, p(300, 7.125, 250));
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '2');
  let result = await save(page);
  const sketch = result.bodies[1];
  expect(sketch.origin[1]).toBeCloseTo(7.125, 8);
  expect(sketch.feature.depth).toBeCloseTo(0, 8);
  await page.keyboard.press('Escape');
  await click(page, p(170, 7.125, 160));
  await expect(page.getByTestId(`body-${sketch.id}`)).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('e');
  await page.keyboard.type('5');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  result = await save(page);
  expect(result.bodies[0]).toEqual(support);
  expect(result.bodies[1].feature.depth).toBeCloseTo(5, 6);
  expect(result.bodies[1].origin[1]).toBeCloseTo(2.125, 8);
});

test('Move grabs the flat shape at a corner shared with its supporting component', async ({
  page,
}) => {
  const support = makeBody(600, 400, 18.125);
  const sketch = makeBody(600, 400, 0, [0, 0, 18.125], 'Pintamuoto');
  await ready(page, [support, sketch]);
  const p = await view(page, [support, sketch]);
  await page.keyboard.press('m');
  const corner = p(600, 400, 18.125);
  await page.mouse.move(corner.x, corner.y);
  await expect(page.getByTestId('viewport')).toHaveAttribute(
    'data-move-hovered',
    JSON.stringify([sketch.id]),
  );
  await page.mouse.down();
  await page.keyboard.press('x');
  await page.mouse.move(p(700, 400, 18.125).x, p(700, 400, 18.125).y, { steps: 8 });
  await page.mouse.up();
  const result = await save(page);
  expect(result.bodies[0]).toEqual(support);
  expect(result.bodies[1].origin).toEqual([100, 0, 18.125]);
});

test('a rectangle drawn exactly on a component stays visible and selectable, then E extrudes only it', async ({
  page,
}, info) => {
  const support = makeBody(600, 400, 18.125, [0, 0, 0], 'Taustalevy');
  await ready(page, [support]);
  const p = await view(page, [support]);
  await page.keyboard.press('s');
  await click(page, p(100, 100, 18.125));
  await click(page, p(300, 250, 18.125));
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '2');
  let result = await save(page);
  expect(result.bodies[0]).toEqual(support);
  const sketch = result.bodies[1];
  expect(sketch.origin[2]).toBeCloseTo(18.125, 8);
  expect(sketch.feature.height).toBeCloseTo(0, 8);
  await page.keyboard.press('Escape');
  const inside = p(170, 160, 18.125);
  await click(page, inside);
  await expect(page.getByTestId(`body-${sketch.id}`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId(`body-${support.id}`)).toHaveAttribute('aria-pressed', 'false');
  await page.mouse.move(p(500, 300, 18.125).x, p(500, 300, 18.125).y);
  await page.screenshot({ path: info.outputPath('surface-sketch.png') });
  await click(page, p(500, 300, 18.125));
  await click(page, inside);
  await expect(page.getByTestId(`body-${sketch.id}`)).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await page.keyboard.press('m');
  await page.mouse.move(inside.x, inside.y);
  await expect(page.getByTestId('viewport')).toHaveAttribute(
    'data-move-hovered',
    JSON.stringify([sketch.id]),
  );
  await page.keyboard.press('v');
  await page.mouse.move(inside.x, inside.y);
  await page.keyboard.press('e');
  await page.keyboard.type('5');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  result = await save(page);
  expect(result.bodies[0]).toEqual(support);
  expect(result.bodies[1].feature.height).toBeCloseTo(5, 6);
  expect(result.bodies[1].origin[2]).toBeCloseTo(18.125, 8);
});

test('overlapping flat shapes keep creation priority after selection changes; foreground occludes them', async ({
  page,
}, info) => {
  const support = makeBody(600, 400, 18.125);
  const sketch = { ...makeBody(300, 250, 0, [100, 75, 18.125], 'Piirros'), color: '#e75040' };
  const newest = {
    ...makeBody(150, 150, 0, [180, 100, 18.125], 'Uusin piirros'),
    color: '#3185df',
  };
  const foreground = makeBody(50, 80, 10, [210, 130, 30]);
  const parts = [support, sketch, newest, foreground];
  await ready(page, parts);
  const p = await view(page, parts);
  for (const [part, point] of [
    [newest, p(280, 170, 18.125)],
    [sketch, p(130, 180, 18.125)],
    [support, p(500, 280, 18.125)],
    [newest, p(280, 170, 18.125)],
    [foreground, p(235, 170, 40)],
  ] as const) {
    await click(page, point);
    await expect(page.getByTestId(`body-${part.id}`)).toHaveAttribute('aria-pressed', 'true');
  }
  await page.keyboard.press('Escape');
  await page.mouse.move(p(550, 350, 18.125).x, p(550, 350, 18.125).y);
  await page.screenshot({ path: info.outputPath('coplanar-colors.png') });
  expect((await save(page)).bodies).toEqual(parts);
});

test('circles, ellipses, polygons and pen faces keep priority on an oblique support in perspective', async ({
  page,
}, info) => {
  const frame = sketchFrame([12000.125, 23000.375, 8000.625], [0.2, -0.3, 1]);
  const support = makeProfileBody(
    { kind: 'rectangle', width: 900, depth: 600 },
    frame,
    -20,
    'Alusta',
  );
  const at = (u: number, v: number) => ({ ...frame, origin: fromUV([u, v], frame) });
  const circle = {
    ...makeProfileBody({ kind: 'circle', radius: 80 }, at(220, 170)),
    color: '#e75040',
  };
  const ellipse = {
    ...makeProfileBody({ kind: 'ellipse', radiusX: 100, radiusY: 65 }, at(570, 170)),
    color: '#3185df',
  };
  const polygon = {
    ...makeProfileBody(
      {
        kind: 'polygon',
        points: [
          [-70, -50],
          [70, -50],
          [90, 20],
          [0, 70],
          [-90, 20],
        ],
      },
      at(220, 420),
    ),
    color: '#48ad66',
  };
  const pen = {
    ...makePolygonBody(
      [
        [490, 350],
        [650, 370],
        [570, 500],
      ].map(([u, v]) => fromUV([u, v], frame)),
    ),
    color: '#be58b5',
  };
  const frontFrame = at(245, 185);
  const foreground = {
    ...makeProfileBody(
      { kind: 'rectangle', width: 22, depth: 22 },
      {
        ...frontFrame,
        origin: frontFrame.origin.map((n, i) => n + frame.normal[i] * 0.25) as [
          number,
          number,
          number,
        ],
      },
      0.1,
    ),
    color: '#303030',
  };
  const parts = [support, circle, ellipse, polygon, pen, foreground];
  await ready(page, parts);
  await view(page, parts);
  const canvas = page.getByTestId('viewport');
  const oldCamera = await canvas.getAttribute('data-camera');
  await page.getByRole('button', { name: '3D', exact: true }).click();
  await expect(canvas).not.toHaveAttribute('data-camera', oldCamera!);
  const state = JSON.parse((await canvas.getAttribute('data-camera'))!);
  const camera = new THREE.Camera();
  camera.position.fromArray(state.position);
  camera.quaternion.fromArray(state.quaternion);
  camera.projectionMatrix.fromArray(state.projection);
  camera.updateMatrixWorld();
  const rect = (await canvas.boundingBox())!;
  const screen = (u: number, v: number) => {
    const p = new THREE.Vector3(...fromUV([u, v], frame)).project(camera);
    return { x: rect.x + ((p.x + 1) * rect.width) / 2, y: rect.y + ((1 - p.y) * rect.height) / 2 };
  };
  for (const [body, u, v] of [
    [circle, 220, 170],
    [ellipse, 570, 170],
    [polygon, 220, 420],
    [pen, 570, 410],
    [circle, 240, 170],
  ] as const) {
    await click(page, screen(u, v));
    await expect(page.getByTestId(`body-${body.id}`)).toHaveAttribute('aria-pressed', 'true');
  }
  await page.keyboard.press('Escape');
  await page.mouse.move(10, 10);
  await page.screenshot({ path: info.outputPath('all-surface-shapes-perspective.png') });
  const pixels = await canvas.screenshot();
  const samples = [
    ...[
      [220, 170],
      [200, 170],
      [240, 170],
      [220, 150],
      [220, 190],
    ].map(([u, v]) => ({ color: 'red', ...screen(u, v) })),
    ...[
      [570, 170],
      [545, 170],
      [595, 170],
      [570, 150],
      [570, 190],
    ].map(([u, v]) => ({ color: 'blue', ...screen(u, v) })),
    ...[
      [220, 420],
      [200, 420],
      [240, 420],
      [220, 400],
      [220, 440],
    ].map(([u, v]) => ({ color: 'green', ...screen(u, v) })),
    ...[
      [570, 410],
      [550, 410],
      [590, 410],
      [570, 390],
      [570, 430],
    ].map(([u, v]) => ({ color: 'purple', ...screen(u, v) })),
    { color: 'foreground', ...screen(255, 195) },
  ];
  const visible = await page.evaluate(
    async ({ image, samples, rect }) => {
      const picture = new Image();
      picture.src = `data:image/png;base64,${image}`;
      await picture.decode();
      const canvas = document.createElement('canvas');
      canvas.width = picture.width;
      canvas.height = picture.height;
      const context = canvas.getContext('2d')!;
      context.drawImage(picture, 0, 0);
      return samples.map(({ color, x, y }) => {
        const [r, g, b] = context.getImageData(
          Math.round(((x - rect.x) * picture.width) / rect.width),
          Math.round(((y - rect.y) * picture.height) / rect.height),
          1,
          1,
        ).data;
        const shown =
          color === 'red'
            ? r > g + 40
            : color === 'blue'
              ? b > r + 15
              : color === 'green'
                ? g > r + 12
                : color === 'foreground'
                  ? Math.abs(r - b) < 15 && r < 170
                  : r > g + 20 && b > g + 20;
        return { color, shown, rgb: [r, g, b] };
      });
    },
    { image: pixels.toString('base64'), samples, rect },
  );
  expect(visible.filter((p) => !p.shown)).toEqual([]);
  expect((await save(page)).bodies).toEqual(parts);
});
