import { expect, test, type Page } from '@playwright/test';
import { Camera, Vector3 } from 'three';
import { ready, view, editBody, save } from './helpers';
import { makeBody, type Guide, type Vec3 } from '../src/model/project';
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
const snapped = async (page: Page) =>
  JSON.parse((await page.getByTestId('viewport').getAttribute('data-snap-point')) || 'null');
for (const mode of ['guide', 'free'] as const)
  test(`${mode}: an edge crossing 950 mm from the right splits a component face in edit mode`, async ({
    page,
  }, info) => {
    const wall = asComponent(makeBody(2000, 100, 2400, [0, 0, 0], 'Seinä'));
    const guide: Guide = {
      id: '950',
      mode,
      plane: 'XZ',
      angle: 90,
      direction: [0, 0, 1],
      anchor: { point: [1050, 0, mode === 'free' ? -200 : 200] },
      length: mode === 'free' ? 2800 : 2000,
    };
    await ready(page, [wall], [guide]);
    await editBody(page, wall.id);
    await view(page, [wall], 'front');
    if (mode === 'free') await page.getByRole('button', { name: '3D', exact: true }).click();
    await page.keyboard.press('k');
    for (const z of [0, 2400]) {
      const point = await at(page, [1050, 0, z]);
      await page.mouse.move(point.x + 4, point.y + (z ? 3 : -3));
      await expect(page.getByTestId('snap-hint')).toContainText('ja reunan risteys');
      await expect.poll(() => snapped(page)).toEqual([1050, 0, z]);
      await page.mouse.click(point.x + 4, point.y + (z ? 3 : -3));
    }
    await expect(page.locator('.status-bar [role="status"]')).toContainText('Pinta jaettu');
    const result = await save(page);
    expect(result.bodies).toHaveLength(1);
    expect(result.bodies[0].feature.type).toBe('brep');
    expect(result.bodies[0].component).toEqual(wall.component);
    await page.screenshot({ path: info.outputPath('guide-edge-split.png') });
    await page.getByRole('button', { name: 'Peru', exact: true }).click();
    expect((await save(page)).bodies).toEqual([wall]);
  });

test('pen axes acquire at four degrees, release beyond five and keep exact guide anchors ahead of inference', async ({
  page,
}) => {
  const guide: Guide = {
    id: 'exact',
    mode: 'free',
    anchor: { point: [700, 24, 0] },
    direction: [0, 1, 0],
    length: 100,
    plane: 'XY',
    angle: 90,
  };
  await ready(page, [], [guide]);
  const p = await view(page, []);
  await page.keyboard.press('k');
  await page.mouse.click(p(0, 0).x, p(0, 0).y);
  await page.mouse.move(p(300, 21).x, p(300, 21).y);
  await expect(page.getByTestId('snap-hint')).toContainText('X · akselin suunta');
  await expect.poll(() => snapped(page)).toEqual([300, 0, 0]);
  await page.mouse.move(p(300, 60).x, p(300, 60).y);
  await expect.poll(() => snapped(page)).toEqual([300, 60, 0]);
  await page.mouse.move(p(300, 21).x, p(300, 21).y);
  await page.keyboard.down('Shift');
  await page.mouse.move(p(700, 24).x, p(700, 24).y);
  await expect.poll(() => snapped(page)).toEqual([700, 0, 0]);
  await page.keyboard.up('Shift');
  await page.mouse.move(p(700, 24).x, p(700, 24).y);
  await expect.poll(() => snapped(page)).toEqual([700, 24, 0]);
});
