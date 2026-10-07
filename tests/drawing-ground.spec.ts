import { test, expect, type Page } from '@playwright/test';
import { Camera, Vector3 } from 'three';
import { ready, click, save, view } from './helpers';
import { makeBody, type Vec3 } from '../src/model/project';
import { guidePoints } from '../src/model/guides';

async function project(page: Page, point: Vec3) {
  const canvas = page.getByTestId('viewport');
  const rect = (await canvas.boundingBox())!;
  const data = JSON.parse((await canvas.getAttribute('data-camera'))!);
  const camera = new Camera();
  camera.position.fromArray(data.position);
  camera.quaternion.fromArray(data.quaternion);
  camera.projectionMatrix.fromArray(data.projection);
  camera.updateMatrixWorld();
  const p = new Vector3(...point).project(camera);
  return { x: rect.x + ((p.x + 1) * rect.width) / 2, y: rect.y + ((1 - p.y) * rect.height) / 2 };
}
async function freeMeasure(page: Page) {
  await page.getByRole('button', { name: 'Valitse mittatyökalu', exact: true }).click();
  await page.getByRole('menuitemradio', { name: /^Vapaa mittaviiva/ }).click();
}

for (const tool of ['pen', 'measure'] as const)
  test(`${tool} shows its start marker and commits the visible ground grid in the initial perspective`, async ({
    page,
  }, info) => {
    await ready(page);
    const canvas = page.getByTestId('viewport');
    if (tool === 'pen') await page.keyboard.press('k');
    else await freeMeasure(page);
    await expect(canvas).toHaveCSS('cursor', 'crosshair');
    for (const point of [
      [137, 213, 0],
      [138, 212, 0],
    ] as Vec3[]) {
      const p = await project(page, point);
      await page.mouse.move(p.x, p.y);
      await expect(canvas).toHaveAttribute('data-snap-visible', 'true');
      await expect(canvas).toHaveAttribute('data-snap-key', 'grid');
      await expect
        .poll(async () => JSON.parse((await canvas.getAttribute('data-snap-point'))!))
        .toEqual([140, 210, 0]);
    }
    await page.screenshot({ path: info.outputPath(`${tool}-ground-start.png`) });
    await click(page, await project(page, [138, 212, 0]));
    await click(page, await project(page, [347, 213, 0]));
    if (tool === 'pen') {
      await expect
        .poll(async () => JSON.parse((await canvas.getAttribute('data-pen-points'))!))
        .toEqual([
          [140, 210, 0],
          [350, 210, 0],
        ]);
      await page.keyboard.press('Enter');
      await expect(canvas).toHaveAttribute('data-mesh-count', '1');
      const body = (await save(page)).bodies[0];
      expect(body.origin[2]).toBe(0);
      expect(body.feature.height).toBe(0);
    } else {
      await page.keyboard.press('Enter');
      const result = await save(page);
      expect(result.guides).toHaveLength(1);
      expect(guidePoints(result.bodies, result.guides[0])).toEqual([
        [140, 210, 0],
        [350, 210, 0],
      ]);
    }
  });

for (const axis of ['x', 'y', 'z'] as const)
  test(`free measure preserves its negative ${axis.toUpperCase()} direction immediately after locking`, async ({
    page,
  }) => {
    const bodies = [makeBody(400, 300, 200)];
    await ready(page, bodies);
    const p = await view(page, bodies, axis === 'z' ? 'front' : 'top');
    await freeMeasure(page);
    const start: Vec3 = [400, 300, 200];
    if (axis === 'z') start[1] = 0;
    const end = [...start] as Vec3;
    end['xyz'.indexOf(axis)] -= 100;
    await click(page, p(...start));
    await page.mouse.move(p(...end).x, p(...end).y);
    await expect(page.getByTestId('guide-length')).toHaveValue('100');
    await page.keyboard.press(axis);
    // No pointer move between the shortcut and acceptance: catch the transient flip.
    await page.getByTestId('guide-length').fill('48');
    await page.getByTestId('guide-length').press('Enter');
    const result = await save(page);
    const expected = [...start] as Vec3;
    expected['xyz'.indexOf(axis)] -= 48;
    expect(guidePoints(result.bodies, result.guides[0])).toEqual([start, expected]);
  });
