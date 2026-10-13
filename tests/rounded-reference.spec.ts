import { test, expect, type Page } from '@playwright/test';
import { Camera, Vector3 } from 'three';
import { makeBody, type Vec3 } from '../src/model/project';
import { ready, view, click, save } from './helpers';

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

for (const tool of ['s', 'c'])
  test(`shape ${tool}: Shift picks a rounded door edge off the front plane and keeps drawing on that plane`, async ({
    page,
  }) => {
    const door = makeBody(600, 600, 60, [0, 0, 0], 'Pyöristetty ovi');
    await ready(page, [door]);
    await view(page, [door]);
    await click(page, await at(page, [200, 200, 60]));
    await page.keyboard.press('f');
    await click(page, await at(page, [240, 0, 60]));
    await page.getByTestId('detail-size').fill('45');
    await page.getByRole('button', { name: 'Hyväksy reunakäsittely', exact: true }).click();
    await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.keyboard.press(tool);
    await click(page, await at(page, [200, 200, 60]));
    const y = 45 - 45 * Math.SQRT1_2,
      z = 15 + 45 * Math.SQRT1_2;
    await page.keyboard.down('Shift');
    const target = await at(page, [0, y, z]);
    await page.mouse.move(target.x, target.y);
    await expect(page.getByTestId('snap-hint')).toContainText('Shift-viite');
    const point = JSON.parse((await page.getByTestId('viewport').getAttribute('data-snap-point'))!);
    expect(point[0]).toBeCloseTo(0, 3);
    expect(point[1]).toBeCloseTo(y, 2);
    expect(point[2]).toBeCloseTo(60, 4);
    await click(page, target);
    await page.keyboard.up('Shift');
    const result = await save(page);
    expect(result.bodies).toHaveLength(2);
    expect(result.bodies[1].origin[2]).toBeCloseTo(60, 4);
    expect(result.bodies[0].edgeTreatment?.size).toBe(45);
  });
