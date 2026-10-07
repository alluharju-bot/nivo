import { expect, test, type Page } from '@playwright/test';
import { Camera, Vector3 } from 'three';
import { ready, editBody, save, view } from './helpers';
import { makeBody, type Guide, type Vec3 } from '../src/model/project';
import { asComponent } from '../src/model/components';

async function at(page: Page, point: Vec3) {
  await page.evaluate(() => new Promise(requestAnimationFrame));
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
async function aim(page: Page, point: Vec3) {
  const p = await at(page, point);
  await page.mouse.move(p.x + 2, p.y - 2);
  await expect
    .poll(async () => {
      const actual = JSON.parse(
        (await page.getByTestId('viewport').getAttribute('data-snap-point')) || 'null',
      );
      return actual ? Math.hypot(...actual.map((n: number, i: number) => n - point[i])) : Infinity;
    })
    .toBeLessThan(1e-5);
  return p;
}
const fixture = () => ({
  floor: makeBody(3000, 2000, 100, [0, 0, -20], 'Lattia'),
  wall: asComponent(makeBody(2000, 100, 2400, [250, 1600, 0], 'Seinä')),
});
for (const editing of [false, true])
  for (const tool of ['k', 's', 'c', 't'])
    test(`${tool}: raised floor intersections are identical ${editing ? 'inside' : 'outside'} component editing`, async ({
      page,
    }) => {
      const { floor, wall } = fixture();
      const guide: Guide = {
        id: 'reference',
        mode: 'guide',
        anchor: { point: [1300, 1600, 400] },
        direction: [0, 0, 1],
        length: 1400,
        plane: 'XZ',
        angle: 90,
      };
      await ready(page, [floor, wall], [guide]);
      if (editing) await editBody(page, wall.id);
      await view(page, [floor, wall]);
      await page.getByRole('button', { name: '3D', exact: true }).click();
      await page.keyboard.press(tool);
      await aim(page, [1300, 1600, 80]);
      await expect(page.getByTestId('snap-hint')).toContainText('pintojen risteys');
      await aim(page, [250, 1600, 80]);
      await expect(page.getByTestId('snap-hint')).toContainText('Pintojen risteys');
      const model = await save(page);
      expect(model.bodies).toEqual([floor, wall]);
    });

test('a moved floor updates the seam and Shift push/pull and Move reference the same exact height', async ({
  page,
}) => {
  const { floor, wall } = fixture();
  const part = makeBody(100, 100, 20, [900, -300, 0], 'Osa');
  await ready(page, [floor, wall, part]);
  await view(page, [floor, wall, part]);
  await page.getByRole('button', { name: '3D', exact: true }).click();
  let p = await at(page, [500, 500, 80]);
  await page.mouse.move(p.x, p.y);
  await page.keyboard.press('e');
  await page.getByTestId('height-input').fill('18.625');
  await page.getByTestId('height-input').press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  await page.keyboard.press('Escape');
  p = await at(page, [950, -250, 20]);
  await page.mouse.move(p.x, p.y);
  await page.keyboard.press('e');
  await page.keyboard.down('Shift');
  p = await at(page, [1250, 1600, 98.625]);
  await page.mouse.move(p.x, p.y);
  await expect(page.getByTestId('remaining-input')).toHaveValue('98.625');
  await page.mouse.click(p.x, p.y);
  await page.keyboard.up('Shift');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  const result = await save(page);
  expect(result.bodies.find((b) => b.id === part.id)!.feature.height).toBeCloseTo(98.625, 5);
  await page.keyboard.press('Escape');
  await page.keyboard.press('m');
  p = await at(page, [900, -300, 98.625]);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.keyboard.press('x');
  p = await at(page, [250, 1600, 98.625]);
  await page.mouse.move(p.x, p.y);
  await expect(page.getByTestId('snap-hint')).toContainText('Pintojen risteys');
  await page.mouse.up();
  const moved = (await save(page)).bodies.find((b) => b.id === part.id)!;
  expect(moved.origin[0]).toBeCloseTo(250, 5);
  expect(moved.origin[1]).toBe(-300);
});
