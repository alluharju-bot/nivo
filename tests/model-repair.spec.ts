import { test, expect, type Page } from '@playwright/test';
import { Camera, Vector3 } from 'three';
import { makeBody, makeProfileBody, type Vec3 } from '../src/model/project';
import { asComponent } from '../src/model/components';
import { sketchFrame } from '../src/model/sketch';
import { ready, view, save } from './helpers';

async function at(page: Page, point: Vec3) {
  const viewport = page.getByTestId('viewport'),
    box = (await viewport.boundingBox())!;
  const data = JSON.parse((await viewport.getAttribute('data-camera'))!);
  const camera = new Camera();
  camera.position.fromArray(data.position);
  camera.quaternion.fromArray(data.quaternion);
  camera.projectionMatrix.fromArray(data.projection);
  camera.updateMatrixWorld();
  const p = new Vector3(...point).project(camera);
  return { x: box.x + ((p.x + 1) * box.width) / 2, y: box.y + ((1 - p.y) * box.height) / 2 };
}
for (const linked of [false, true])
  test(`edge selections survive other parts and commit together (${linked ? 'linked' : 'independent'})`, async ({
    page,
  }) => {
    const a = asComponent(makeBody(300, 200, 40));
    const b = linked
      ? { ...a, id: 'copy', origin: [400, 0, 0] as Vec3 }
      : makeBody(300, 200, 40, [400, 0, 0]);
    await ready(page, [a, b]);
    const p = await view(page, [a, b]);
    await page.keyboard.press('f');
    const first = p(100, 0, 40),
      second = p(500, 200, 40);
    await page.mouse.click(first.x, first.y);
    const center = p(550, 100, 40);
    await page.mouse.click(center.x, center.y);
    const panel = page.getByRole('region', { name: 'Viisteet ja pyöristykset' });
    await expect(panel).toContainText('1 reunaa valittu');
    await page.mouse.click(second.x, second.y);
    await expect(panel).toContainText('2 osaa · 2 reunaa valittu');
    await page.getByTestId('detail-size').fill('2');
    const accept = page.getByRole('button', { name: 'Hyväksy reunakäsittely', exact: true });
    await expect(accept).toBeEnabled();
    await accept.click();
    await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
    const model = await save(page);
    expect(model.bodies.every((body) => body.edgeTreatment?.size === 2)).toBe(true);
    await page.getByRole('button', { name: 'Peru', exact: true }).click();
    expect((await save(page)).bodies).toEqual([a, b]);
  });

test('long edges stay selectable close up in perspective', async ({ page }, info) => {
  const body = makeBody(2400, 100, 40);
  await ready(page, [body]);
  await view(page, [body]);
  await page.getByRole('button', { name: 'Yleisnäkymä', exact: true }).click();
  let point = await at(page, [2100, 0, 40]);
  await page.mouse.move(point.x, point.y);
  await page.mouse.wheel(0, -1900);
  await page.waitForTimeout(400);
  point = await at(page, [2100, 0, 40]);
  await page.keyboard.press('f');
  await page.mouse.move(point.x, point.y);
  await expect(page.getByTestId('viewport')).toHaveAttribute(
    'data-detail-hover',
    new RegExp(`^${body.id}:`),
  );
  await page.mouse.click(point.x, point.y);
  await expect(page.getByRole('region', { name: 'Viisteet ja pyöristykset' })).toContainText(
    '1 reunaa valittu',
  );
  await page.screenshot({ path: info.outputPath('close-edge.png') });
});

test('circle stays on the bucket tangent while changing its diameter and can be reopened', async ({
  page,
}, info) => {
  const bucket = makeProfileBody(
    { kind: 'circle', radius: 100 },
    sketchFrame([0, 0, 0]),
    200,
    'Kylki',
  );
  await ready(page, [bucket]);
  await view(page, [bucket], 'front');
  await page.keyboard.press('c');
  const center: Vec3 = [30, -Math.sqrt(10000 - 900), 100];
  const p = await at(page, center);
  await page.mouse.move(p.x, p.y);
  await expect(page.getByTestId('snap-hint')).toContainText('tangenttitaso');
  await page.mouse.click(p.x, p.y);
  const next = await at(page, [center[0], center[1], center[2] + 25]);
  await page.mouse.move(next.x, next.y);
  for (const size of ['24', '40', '18']) await page.getByTestId('diameter-input').fill(size);
  await page.getByTestId('diameter-input').press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  const model = await save(page);
  const circle = model.bodies.at(-1)!;
  expect(circle.feature.type).toBe('profile-extrusion');
  if (circle.feature.type !== 'profile-extrusion') throw new Error('Missing circle');
  expect(circle.feature.profile).toMatchObject({ kind: 'circle', radius: 9 });
  const frame = circle.feature.frame;
  const anchor = circle.origin.map((n, i) => n + frame.origin[i]);
  anchor.forEach((n, i) => expect(n).toBeCloseTo(center[i], 4));
  expect(frame.normal[0]).toBeCloseTo(0.3, 4);
  expect(frame.normal[1]).toBeCloseTo(-Math.sqrt(0.91), 4);
  await page.screenshot({ path: info.outputPath('bucket-tangent.png') });
  await expect(page.locator('.save-status')).toContainText('Tallessa');
  await page.reload();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '2');
  expect((await save(page)).bodies.at(-1)).toEqual(circle);
});
