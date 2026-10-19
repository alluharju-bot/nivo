import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import init from 'replicad-opencascadejs';
import { getOC, setOC, measureArea, type Shape3D } from 'replicad';
import { Camera, Vector3 } from 'three';
import { makeProfileBody, type Body, type Vec3 } from '../src/model/project';
import { sketchFrame } from '../src/model/sketch';
import { createShape } from '../src/cad/kernel';
import { booleanBodies } from '../src/cad/operations';
import { ready, view, save, revealBrowser } from './helpers';

test.beforeAll(async () =>
  setOC(
    await init({
      wasmBinary: readFileSync(new URL(import.meta.resolve('replicad-opencascadejs/wasm'))),
    }),
  ),
);

function volume(body: Body) {
  const shape = createShape(body),
    oc = getOC(),
    props = new oc.GProp_GProps();
  try {
    // Adaptive integration also measures the scaled rational B-spline accurately.
    oc.BRepGProp.VolumePropertiesGK(shape.wrapped, props, 1e-9, true, true, false, false, false);
    return props.Mass();
  } finally {
    props.delete();
    shape.delete();
  }
}
async function at(page: Page, point: Vec3) {
  const canvas = page.getByTestId('viewport'),
    box = (await canvas.boundingBox())!;
  const state = JSON.parse((await canvas.getAttribute('data-camera'))!);
  const camera = new Camera();
  camera.position.fromArray(state.position);
  camera.quaternion.fromArray(state.quaternion);
  camera.projectionMatrix.fromArray(state.projection);
  camera.updateMatrixWorld();
  const p = new Vector3(...point).project(camera);
  return { x: box.x + ((p.x + 1) * box.width) / 2, y: box.y + ((1 - p.y) * box.height) / 2 };
}

for (const outward of [false, true])
  test(`repeated circle offsets ${outward ? 'outwards on the rim' : 'inwards on the centre'} keep independent regions`, async ({
    page,
  }) => {
    const disk = makeProfileBody({ kind: 'circle', radius: 100 }, sketchFrame([0, 0, 0]));
    await ready(page, [disk]);
    await view(page, [disk]);
    for (let step = 0; step < 3; step++) {
      const point = await at(page, [outward && step ? 100 + step * 10 - 5 : 0, 0, 0]);
      await page.mouse.move(point.x, point.y);
      if (!step) await page.keyboard.press('o');
      else await page.mouse.click(point.x, point.y);
      await page.getByTestId('offset-input').fill(outward ? '-10' : '10');
      await expect(page.getByTestId('viewport')).toHaveAttribute(
        'data-offset-preview',
        outward ? '-10' : '10',
      );
      await page.getByTestId('offset-input').press('Enter');
      await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
      const saved = await save(page),
        shape = createShape(saved.bodies[0]),
        faces = shape.faces;
      try {
        expect(faces).toHaveLength(step + 2);
        expect(measureArea(shape as Shape3D)).toBeCloseTo(
          Math.PI * (outward ? 110 + step * 10 : 100) ** 2,
          3,
        );
      } finally {
        faces.forEach((f) => f.delete());
        shape.delete();
      }
    }
  });

for (const distance of [2, -2])
  test(`O keeps the chosen ${distance} mm offset when continuing on a small circle`, async ({
    page,
  }) => {
    const disk = makeProfileBody({ kind: 'circle', radius: 10 }, sketchFrame([0, 0, 0]));
    await ready(page, [disk]);
    await view(page, [disk]);
    const point = await at(page, [0, 0, 0]);
    await page.mouse.move(point.x, point.y);
    await page.keyboard.press('o');
    await page.getByTestId('offset-input').fill(String(distance));
    await page.getByTestId('offset-input').press('Enter');
    await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
    for (let i = 0; i < 2; i++) {
      await page.keyboard.press('o');
      await expect(page.getByTestId('offset-input')).toHaveValue(String(distance));
      await expect(page.getByTestId('viewport')).toHaveAttribute(
        'data-offset-preview',
        String(distance),
      );
      await page.getByTestId('offset-input').press('Enter');
      await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
    }
    const body = (await save(page)).bodies[0],
      shape = createShape(body),
      faces = shape.faces;
    try {
      expect(faces).toHaveLength(4);
      expect(measureArea(shape as Shape3D)).toBeCloseTo(Math.PI * (distance < 0 ? 16 : 10) ** 2, 4);
    } finally {
      faces.forEach((f) => f.delete());
      shape.delete();
    }
  });

for (const bottom of [false, true])
  test(`a hollow cylinder cap offsets and pulls ${bottom ? 'from below' : 'from above'}`, async ({
    page,
  }, info) => {
    const outer = makeProfileBody({ kind: 'circle', radius: 200 }, sketchFrame([0, 0, 0]), 300);
    const inner = makeProfileBody({ kind: 'circle', radius: 180 }, sketchFrame([0, 0, -10]), 320);
    const tube = booleanBodies([outer], [inner], 'cut')[0];
    await ready(page, [tube]);
    await view(page, [tube]);
    if (bottom)
      await page.getByRole('button', { name: 'Näkymä: Alhaalta', exact: true }).press('Enter');
    const point = await at(page, [190, 0, bottom ? 0 : 300]);
    await page.mouse.move(point.x, point.y);
    await page.keyboard.press('o');
    await page.getByTestId('offset-input').fill('5');
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-offset-preview', '5');
    await page.getByTestId('offset-input').press('Enter');
    await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
    const inset = await save(page);
    expect(volume(inset.bodies[0])).toBeCloseTo(volume(tube), 3);
    await page.keyboard.press('e');
    await page.getByTestId('height-input').fill('-10');
    await page.getByTestId('height-input').press('Enter');
    await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
    const pocket = await save(page);
    expect(volume(pocket.bodies[0])).toBeCloseTo(
      volume(tube) - Math.PI * (195 ** 2 - 185 ** 2) * 10,
      3,
    );
    await page.getByRole('button', { name: 'Yleisnäkymä', exact: true }).click();
    await page.screenshot({ path: info.outputPath('cylinder-ring-offset.png') });
    await page.getByRole('button', { name: 'Peru', exact: true }).click();
    expect((await save(page)).bodies).toEqual(inset.bodies);
    await page.getByRole('button', { name: 'Peru', exact: true }).click();
    expect((await save(page)).bodies).toEqual([tube]);
    await page.getByRole('button', { name: 'Palauta', exact: true }).click();
    await expect(page.locator('.save-status')).toContainText('Tallessa selaimessa');
    await page.reload();
    await expect(page.locator('.busy-badge')).toHaveCount(0);
    expect((await save(page)).bodies).toEqual(inset.bodies);
  });

test('a cylinder scaled in XY keeps its height and accepts an 8 mm offset and through cut', async ({
  page,
}) => {
  const cylinder = makeProfileBody({ kind: 'circle', radius: 200 }, sketchFrame([0, 0, 0]), 300);
  await ready(page, [cylinder]);
  await view(page, [cylinder]);
  await revealBrowser(page);
  await page.getByTestId(`body-${cylinder.id}`).click();
  await page.getByRole('button', { name: 'Piilota mallilista' }).press('Enter');
  await page.keyboard.press('l');
  await page.getByRole('button', { name: 'Skaalaa Z-suunnassa', exact: true }).click();
  await page.getByTestId('scale-factor').fill('0.8');
  await page.getByTestId('scale-factor').press('Enter');
  await expect(page.getByTestId('scale-factor')).toHaveCount(0);
  const scaled = await save(page);
  expect(scaled.bodies[0].feature.height).toBeCloseTo(300, 5);
  await page.keyboard.press('v');
  await view(page, scaled.bodies);
  const point = await at(page, [0, 0, 300]);
  await page.mouse.move(point.x, point.y);
  await page.keyboard.press('o');
  await page.getByTestId('offset-input').fill('8');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-offset-preview', '8');
  await page.getByTestId('offset-input').press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  await page.keyboard.press('e');
  await page.getByTestId('height-input').fill('-350');
  await page.getByTestId('height-input').press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  expect(volume((await save(page)).bodies[0])).toBeCloseTo(
    Math.PI * (160 ** 2 - 152 ** 2) * 300,
    2,
  );
});
