import { test, expect, type Page } from '@playwright/test';
import { Camera, Vector3 } from 'three';
import { makeBody, type Vec3 } from '../src/model/project';
import { ready, view, click, save, revealBrowser } from './helpers';

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

for (const perspective of [false, true])
  test(`Move Shift references the rounded door edge exactly in ${perspective ? 'perspective' : 'top view'}, shows the reference and preserves the movement axis`, async ({
    page,
  }) => {
    const door = makeBody(600, 600, 60, [0, 0, 0], 'Pyöristetty ovi');
    const part = makeBody(40, 50, 20, [300, -200, 40], 'Siirrettävä osa');
    await ready(page, [door, part]);
    await view(page, [door, part]);
    await click(page, await at(page, [200, 200, 60]));
    await page.keyboard.press('f');
    await click(page, await at(page, [240, 0, 60]));
    await page.getByTestId('detail-size').fill('45');
    await page.getByRole('button', { name: 'Hyväksy reunakäsittely', exact: true }).click();
    await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await revealBrowser(page);
    await page.getByTestId(`body-${part.id}`).click();
    await view(page, [door, part]);
    if (perspective) await page.getByRole('button', { name: 'Yleisnäkymä', exact: true }).click();
    await page.keyboard.press('m');
    const start: Vec3 = [300, -150, 60];
    const p = await at(page, start);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.keyboard.press('y');
    await page.keyboard.down('Shift');
    const target: Vec3 = [perspective ? 600 : 0, 45 - 45 * Math.SQRT1_2, 15 + 45 * Math.SQRT1_2];
    const q = await at(page, target);
    await page.mouse.move(q.x, q.y, { steps: 8 });
    const canvas = page.getByTestId('viewport');
    await expect(canvas).toHaveAttribute('data-move-axis', 'y');
    const end = JSON.parse((await canvas.getAttribute('data-move-end'))!);
    [300, target[1], 60].forEach((value, i) => expect(end[i]).toBeCloseTo(value, 3));
    await expect(page.getByTestId('snap-hint')).toContainText('Shift-viite');
    const reference = JSON.parse((await canvas.getAttribute('data-move-reference'))!);
    target.forEach((value, i) => expect(reference[i]).toBeCloseTo(value, 3));
    if (perspective) await page.screenshot({ path: test.info().outputPath('move-reference.png') });
    await page.mouse.up();
    await page.keyboard.up('Shift');
    await expect(canvas).toHaveAttribute('data-move-reference', '');
    const model = await save(page);
    const moved = model.bodies.find((b) => b.id === part.id)!;
    expect(moved.origin[0]).toBe(300);
    expect(moved.origin[1]).toBeCloseTo(target[1] - 50, 3);
    expect(moved.origin[2]).toBe(40);
    expect(model.bodies[0].edgeTreatment?.size).toBe(45);
    await page.getByRole('button', { name: 'Peru', exact: true }).click();
    expect((await save(page)).bodies.find((b) => b.id === part.id)).toEqual(part);
  });

test('pressing Shift over a face center acquires its surface height immediately, with no pointer movement or grid rounding', async ({
  page,
}) => {
  const target = makeBody(600, 600, 48.625, [0, 0, 100], 'Viitepinta');
  const part = makeBody(40, 50, 20, [-100, 300, 0], 'Siirrettävä osa');
  await ready(page, [target, part]);
  await revealBrowser(page);
  await page.getByTestId(`body-${part.id}`).click();
  await view(page, [target, part]);
  await page.keyboard.press('m');
  const p = await at(page, [-100, 300, 20]);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.keyboard.press('z');
  const q = await at(page, [300, 300, 148.625]);
  await page.mouse.move(q.x, q.y, { steps: 8 });
  await page.keyboard.down('Shift');
  await expect(page.getByTestId('snap-hint')).toContainText('Pinnan keskipiste');
  const canvas = page.getByTestId('viewport');
  const end = JSON.parse((await canvas.getAttribute('data-move-end'))!);
  expect(end).toEqual([-100, 300, 148.625]);
  await expect(canvas).toHaveAttribute('data-move-reference', JSON.stringify([300, 300, 148.625]));
  // Releasing the modifier just before the mouse must preserve the exact result.
  await page.keyboard.up('Shift');
  await page.mouse.up();
  const model = await save(page);
  expect(model.bodies[0]).toEqual(target);
  expect(model.bodies[1].origin).toEqual([-100, 300, 128.625]);
});
