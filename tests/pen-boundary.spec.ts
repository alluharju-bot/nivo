import { expect, test, type Page } from '@playwright/test';
import { Camera, Vector3 } from 'three';
import { ready, view, editBody, save } from './helpers';
import { makeBody, makePolygonBody, type Vec3, type Guide } from '../src/model/project';
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

for (const locked of [false, true])
  test(`a nearby off-plane reference cannot steal a face-boundary endpoint ${locked ? 'with Y locked' : 'while splitting a component'}`, async ({
    page,
  }) => {
    const floor = asComponent(makeBody(2000, 1200, 100, [0, 0, -100]));
    const guide: Guide = {
      id: 'above',
      mode: 'free',
      plane: 'XY',
      angle: 0,
      anchor: { point: [650, 1200, 8] },
      direction: [1, 0, 0],
      length: 100,
    };
    await ready(page, [floor], [guide]);
    await editBody(page, floor.id);
    await view(page, [floor]);
    await page.getByRole('button', { name: 'Yleisnäkymä', exact: true }).click();
    await page.keyboard.press('k');
    const start = await at(page, [650, 0, 0]),
      end = await at(page, [650, 1200, 0]);
    await page.mouse.click(start.x, start.y);
    if (locked) await page.keyboard.press('y');
    await page.mouse.move(end.x, end.y);
    const canvas = page.getByTestId('viewport');
    const hovered = JSON.parse((await canvas.getAttribute('data-pen-hover'))!);
    expect(hovered[2]).toBeCloseTo(0, 6);
    await page.mouse.click(end.x, end.y);
    await expect(page.locator('.status-bar [role="status"]')).toContainText('Pinta jaettu');
    const project = await save(page);
    expect(project.bodies).toHaveLength(1);
    expect(project.bodies[0].feature.type).toBe('brep');
    await page.getByRole('button', { name: 'Peru', exact: true }).click();
    expect((await save(page)).bodies).toEqual([floor]);
  });

const pairs: [string, Vec3, Vec3][] = [
  ['edge to edge', [500, 0, 0], [1800, 1200, 0]],
  ['corner to edge', [0, 0, 0], [2000, 800, 0]],
  ['corner to corner', [0, 0, 0], [2000, 1200, 0]],
  ['midpoint to midpoint', [1000, 0, 0], [1000, 1200, 0]],
];
for (const perspective of [false, true])
  for (const [name, a, b] of pairs)
    test(`${name} splits on the first attempt ${perspective ? 'in perspective' : 'from above'}`, async ({
      page,
    }) => {
      const floor = asComponent(makeBody(2000, 1200, 100, [0, 0, -100]));
      await ready(page, [floor]);
      await editBody(page, floor.id);
      await view(page, [floor]);
      if (perspective) await page.getByRole('button', { name: 'Yleisnäkymä', exact: true }).click();
      await page.keyboard.press('k');
      const start = await at(page, a),
        end = await at(page, b);
      await page.mouse.click(start.x, start.y);
      // Deliberately approach slightly beside the boundary, like a normal hand gesture.
      await page.mouse.move(end.x + 3, end.y - 2, { steps: 4 });
      const point = JSON.parse(
        (await page.getByTestId('viewport').getAttribute('data-pen-hover'))!,
      );
      expect(point[2]).toBeCloseTo(0, 5);
      await page.mouse.click(end.x + 3, end.y - 2);
      await expect(page.locator('.status-bar [role="status"]')).toContainText('Pinta jaettu');
      const result = await save(page);
      expect(result.bodies).toHaveLength(1);
      expect(result.bodies[0].feature.type).toBe('brep');
      expect(result.bodies[0].component).toEqual(floor.component);
      await page.getByRole('button', { name: 'Peru', exact: true }).click();
      expect((await save(page)).bodies).toEqual([floor]);
    });

function trapezoid() {
  const body = makePolygonBody([
    [0, 0, 0],
    [1000, 0, 0],
    [850, 600, 0],
    [0, 600, 0],
  ]);
  return asComponent({ ...body, feature: { ...body.feature, height: 50 } });
}
for (const lock of ['x', 'Shift', 'r'])
  test(`${lock} locks a line to the actual intersection with an angled boundary`, async ({
    page,
  }) => {
    const body = trapezoid();
    await ready(page, [body]);
    await editBody(page, body.id);
    await view(page, [body]);
    await page.keyboard.press('k');
    const start = await at(page, [0, 200, 50]),
      along = await at(page, [400, 200, 50]),
      end = await at(page, [948, 208, 50]);
    await page.mouse.click(start.x, start.y);
    await page.mouse.move(along.x, along.y);
    if (lock === 'Shift') await page.keyboard.down('Shift');
    else {
      await page.keyboard.press(lock);
      if (lock === 'r') {
        await page.getByTestId('pen-angle').fill('0');
        await page.keyboard.press('Enter');
      }
    }
    await page.mouse.move(end.x, end.y, { steps: 4 });
    const point = JSON.parse((await page.getByTestId('viewport').getAttribute('data-pen-hover'))!);
    [950, 200, 50].forEach((n, i) => expect(point[i]).toBeCloseTo(n, 3));
    await page.mouse.click(end.x, end.y);
    if (lock === 'Shift') await page.keyboard.up('Shift');
    await expect(page.locator('.status-bar [role="status"]')).toContainText('Pinta jaettu');
    expect((await save(page)).bodies).toHaveLength(1);
  });

test('typed length wins over a nearby boundary and never silently extends a short line', async ({
  page,
}) => {
  const body = trapezoid();
  await ready(page, [body]);
  const original = (await save(page)).bodies[0];
  await editBody(page, body.id);
  await view(page, [body]);
  await page.keyboard.press('k');
  const start = await at(page, [0, 200, 50]),
    end = await at(page, [950, 200, 50]);
  await page.mouse.click(start.x, start.y);
  await page.keyboard.press('x');
  await page.mouse.move(end.x, end.y);
  await page.keyboard.type('930');
  const point = JSON.parse((await page.getByTestId('viewport').getAttribute('data-pen-hover'))!);
  [930, 200, 50].forEach((n, i) => expect(point[i]).toBeCloseTo(n, 3));
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '2');
  const result = await save(page);
  expect(result.bodies[0]).toEqual(original);
  expect(result.bodies[1].feature.width).toBeCloseTo(930, 3);
});

test('a face center stays usable as an intermediate point; the next boundary completes the split', async ({
  page,
}) => {
  const body = asComponent(makeBody(2000, 1200, 100, [0, 0, -100]));
  await ready(page, [body]);
  await editBody(page, body.id);
  await view(page, [body]);
  await page.keyboard.press('k');
  for (const point of [
    [1000, 0, 0],
    [1000, 600, 0],
    [1000, 1200, 0],
  ] as Vec3[]) {
    const p = await at(page, point);
    await page.mouse.move(p.x, p.y);
    const hover = JSON.parse((await page.getByTestId('viewport').getAttribute('data-pen-hover'))!);
    point.forEach((n, i) => expect(hover[i]).toBeCloseTo(n, 5));
    await page.mouse.click(p.x, p.y);
  }
  await expect(page.locator('.status-bar [role="status"]')).toContainText('Pinta jaettu');
  expect((await save(page)).bodies).toHaveLength(1);
});
