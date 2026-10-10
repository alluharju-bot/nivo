import { test, expect, type Page } from '@playwright/test';
import { Camera, Vector3 } from 'three';
import { makeBody, type Vec3, type Guide } from '../src/model/project';
import { ready, view, click, save } from './helpers';

async function project(page: Page, point: Vec3) {
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

for (const tilted of [false, true])
  test(`floor center gives equal guide offsets from opposite walls ${tilted ? 'in a tilted view' : 'from above'}`, async ({
    page,
  }) => {
    const bodies = [
      makeBody(2238, 2077, 100, [-100, -110, -100], 'Lattia'),
      makeBody(100, 1877, 2350, [-100, -10, 0], 'Vasen'),
      makeBody(100, 2077, 2350, [2038, -110, 0], 'Oikea'),
      makeBody(2138, 100, 2350, [-100, -110, 0], 'Etu'),
      makeBody(2138, 100, 2350, [-100, 1867, 0], 'Taka'),
    ];
    const existing: Guide = {
      id: 'old-guide',
      mode: 'guide',
      plane: 'XY',
      angle: 90,
      anchor: { point: [0, 568, 2350] },
      offset: [969, 0, 0],
      direction: [0, 1, 0],
      length: 1877,
    };
    const cross: Guide = {
      id: 'cross-guide',
      mode: 'guide',
      plane: 'XY',
      angle: 0,
      anchor: { point: [300, 928.5, 2350] },
      direction: [1, 0, 0],
      length: 2138,
    };
    await ready(page, bodies, [existing, cross]);
    await view(page, bodies);
    if (tilted) {
      const cube = (await page
        .getByRole('group', { name: 'Näkymäkuutio', exact: true })
        .boundingBox())!;
      await page.mouse.move(cube.x + cube.width / 2, cube.y + cube.height / 2);
      await page.mouse.down();
      await page.mouse.move(cube.x + cube.width / 2 + 16, cube.y + cube.height / 2 + 10, {
        steps: 8,
      });
      await page.mouse.up();
      await page.getByRole('button', { name: 'Rinnakkaisprojektio', exact: true }).click();
    }
    await page.keyboard.press('t');
    const center = await project(page, [1019, 928.5, 0]);
    await page.mouse.move(center.x, center.y);
    await expect(page.getByTestId('snap-hint')).toContainText('Pinnan keskipiste');
    const starts: Vec3[] = [
      [0, 568, 2350],
      [2038, 568, 2350],
      [1300, -10, 2350],
      [1300, 1867, 2350],
    ];
    for (const [i, start] of starts.entries()) {
      await click(page, await project(page, start));
      if (i === 1) await page.keyboard.press('x');
      await page.mouse.move(center.x, center.y, { steps: 6 });
      await expect(page.getByTestId('guide-length')).toHaveValue(i < 2 ? '1019' : '938.5');
      await click(page, center);
      if (i === 1) {
        await page.keyboard.press('Escape');
        await page.keyboard.press('t');
      }
    }
    const result = await save(page);
    expect(result.bodies).toEqual(bodies);
    expect(result.guides).toHaveLength(6);
    result.guides.slice(2).forEach((guide, i) => {
      expect(guide.offset![2]).toBeCloseTo(0, 7);
      expect(Math.hypot(...guide.offset!)).toBeCloseTo(i < 2 ? 1019 : 938.5, 6);
    });
    expect(result.guides[0]).toEqual(existing);
  });

test('pen and free measurement start at the floor surface center, with no hidden 50 mm drop', async ({
  page,
}) => {
  const floor = makeBody(2200, 2000, 100, [-100, -100, -100]);
  await ready(page, [floor]);
  await view(page, [floor]);
  const p = await project(page, [1000, 900, 0]);
  for (const tool of ['k', 't']) {
    await page.keyboard.press(tool);
    if (tool === 't') {
      await page.getByRole('button', { name: 'Valitse mittatyökalu', exact: true }).click();
      await page.getByRole('menuitemradio', { name: /Vapaa mittaviiva/ }).click();
    }
    await page.mouse.move(p.x, p.y);
    await expect(page.getByTestId('snap-hint')).toContainText('Pinnan keskipiste');
    const point = JSON.parse((await page.getByTestId('viewport').getAttribute('data-snap-point'))!);
    expect(point).toEqual([1000, 900, 0]);
    await click(page, p);
    await page.keyboard.press('Escape');
  }
});
