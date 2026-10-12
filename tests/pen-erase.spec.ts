import { expect, test, type Page } from '@playwright/test';
import { Camera, Vector3 } from 'three';
import { ready, view, editBody, save } from './helpers';
import { makeBody, type Vec3 } from '../src/model/project';
import { asComponent } from '../src/model/components';

async function at(page: Page, point: Vec3) {
  const canvas = page.getByTestId('viewport'),
    box = (await canvas.boundingBox())!;
  const data = JSON.parse((await canvas.getAttribute('data-camera'))!);
  const camera = new Camera();
  camera.position.fromArray(data.position);
  camera.quaternion.fromArray(data.quaternion);
  camera.projectionMatrix.fromArray(data.projection);
  camera.updateMatrixWorld();
  const p = new Vector3(...point).project(camera);
  return { x: box.x + ((p.x + 1) * box.width) / 2, y: box.y + ((1 - p.y) * box.height) / 2 };
}

for (const perspective of [false, true])
  for (const mode of ['immediate', 'reload', 'endpoint', 'reference', 'wire'])
    test(`erase a pen division ${perspective ? 'in perspective' : 'from above'} ${mode}`, async ({
      page,
    }) => {
      const floor = asComponent(makeBody(2000, 1200, 100, [0, 0, -100]));
      const bodies =
        mode === 'reference'
          ? [floor, asComponent(makeBody(2000, 800, 100, [0, -800, -100]))]
          : [floor];
      await ready(page, bodies);
      if (mode === 'wire') {
        await view(page, bodies);
        await page.keyboard.press('k');
        for (const point of [
          [650, 0, 0],
          [650, 1200, 0],
        ] as Vec3[]) {
          const p = await at(page, point);
          await page.mouse.click(p.x, p.y);
        }
        await page.keyboard.press('Enter');
        await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '2');
        bodies.push((await save(page)).bodies[1]);
        await page.keyboard.press('v');
      }
      await editBody(page, floor.id);
      await view(page, bodies);
      if (perspective) await page.getByRole('button', { name: 'Yleisnäkymä', exact: true }).click();
      await page.keyboard.press('k');
      for (const point of [
        [650, 0, 0],
        [650, 1200, 0],
      ] as Vec3[]) {
        const p = await at(page, point);
        await page.mouse.click(p.x, p.y);
      }
      await expect(page.locator('.status-bar [role="status"]')).toContainText('Pinta jaettu');
      const split = await save(page);
      if (mode === 'reload') {
        await expect(page.locator('.save-status')).toContainText('Tallessa selaimessa');
        await page.reload();
        await expect(page.locator('.busy-badge')).toHaveCount(0);
        await editBody(page, floor.id);
        await view(page, split.bodies);
        if (perspective)
          await page.getByRole('button', { name: 'Yleisnäkymä', exact: true }).click();
      }
      await page.keyboard.press('u');
      const endpoint = mode === 'endpoint' || mode === 'reference';
      const point = await at(page, [650, endpoint ? 0 : 330, 0]);
      if (endpoint) point.y += 6;
      await page.mouse.move(point.x, point.y);
      await expect(page.getByTestId('viewport')).toHaveAttribute('data-erase-boundary', /surface/);
      await page.mouse.click(point.x, point.y);
      await expect(page.locator('.status-bar [role="status"]')).toContainText('Rajaus poistettu');
      const fixed = await save(page);
      expect(fixed.bodies).toHaveLength(bodies.length);
      expect(fixed.bodies.slice(1)).toEqual(bodies.slice(1));
      expect(fixed.bodies[0].feature).not.toEqual(split.bodies[0].feature);
      expect(fixed.bodies[0].origin).toEqual(floor.origin);
      await page.mouse.move(point.x + 2, point.y + 2);
      await expect(page.getByTestId('viewport')).toHaveAttribute('data-erase-boundary', '');
      await page.getByRole('button', { name: 'Peru', exact: true }).click();
      expect((await save(page)).bodies).toEqual(split.bodies);
    });
