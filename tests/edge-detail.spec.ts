import { expect, test } from '@playwright/test';
import { bounds, makeBody, makeProfileBody } from '../src/model/project';
import { sketchFrame } from '../src/model/sketch';
import * as THREE from 'three';
import { ready, view, click, save, revealBrowser } from './helpers';

test('picked edges fillet with a preview, exact size and persistent undo', async ({
  page,
}, info) => {
  const body = makeBody(300, 200, 40, [0, 0, 0], 'Hylly');
  await ready(page, [body]);
  const p = await view(page, [body]);
  await page.keyboard.press('f');
  const edge = p(120, 0, 40);
  await page.mouse.move(edge.x, edge.y);
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-detail-hover', /.+:\d+/);
  await click(page, edge);
  await page.getByTestId('detail-size').fill('5');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-detail-preview', body.id);
  await expect(page.getByRole('region', { name: 'Viisteet ja pyöristykset' })).toContainText(
    '1 reunaa valittu',
  );
  expect((await save(page)).bodies).toEqual([body]);
  await page.screenshot({ path: info.outputPath('fillet-preview.png') });
  await page.getByRole('button', { name: 'Hyväksy reunakäsittely', exact: true }).click();
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  const result = await save(page);
  expect(result.bodies[0].feature.type).toBe('brep');
  expect(result.bodies[0].id).toBe(body.id);
  expect(result.bodies[0].feature.width).toBeCloseTo(300);
  await expect(page.locator('.save-status')).toContainText('Tallessa selaimessa');
  await page.reload();
  await expect(page.locator('.busy-badge')).toHaveCount(0);
  expect((await save(page)).bodies).toEqual(result.bodies);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual([body]);
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  expect((await save(page)).bodies).toEqual(result.bodies);
});

test('all-edge chamfer can be cancelled, rejects oversized cuts, and applies a valid size', async ({
  page,
}) => {
  const body = makeBody(200, 160, 40);
  await ready(page, [body]);
  await revealBrowser(page);
  await page.getByTestId(`body-${body.id}`).click();
  await page.keyboard.press('f');
  await page.getByRole('combobox', { name: 'Reunakäsittely', exact: true }).selectOption('chamfer');
  await page.getByRole('button', { name: 'Kaikki reunat', exact: true }).click();
  await page.getByTestId('detail-size').fill('1000');
  await expect(page.getByRole('alert')).toContainText('Pienennä');
  expect((await save(page)).bodies).toEqual([body]);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-detail-preview', '');
  expect((await save(page)).bodies).toEqual([body]);
  await revealBrowser(page);
  await page.getByTestId(`body-${body.id}`).click();
  await page.keyboard.press('f');
  await page.getByRole('button', { name: 'Kaikki reunat', exact: true }).click();
  await page.getByTestId('detail-size').fill('3');
  await expect(
    page.getByRole('button', { name: 'Hyväksy reunakäsittely', exact: true }),
  ).toBeEnabled();
  await page.getByTestId('detail-size').press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  expect((await save(page)).bodies[0].feature.type).toBe('brep');
});

test('edge dragging grows and shrinks the preview, release commits once and undo restores the original', async ({
  page,
}, info) => {
  const body = makeBody(300, 200, 40, [0, 0, 0], 'Vedettävä hylly');
  await ready(page, [body]);
  const p = await view(page, [body]);
  await page.keyboard.press('f');
  const a = p(120, 0, 40),
    large = p(120, 8, 40),
    small = p(120, 3, 40);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(large.x, large.y, { steps: 6 });
  await expect
    .poll(async () => Number(await page.getByTestId('detail-size').inputValue()))
    .toBeCloseTo(10, 1);
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-detail-preview-size', '10');
  await page.mouse.move(small.x, small.y, { steps: 4 });
  await expect
    .poll(async () => Number(await page.getByTestId('detail-size').inputValue()))
    .toBeCloseTo(5, 1);
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-detail-preview-size', '5');
  await expect(page.getByTestId('snap-hint')).toContainText('Säde 5 mm');
  await page.screenshot({ path: info.outputPath('edge-drag.png') });
  await page.mouse.up();
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  let result = await save(page);
  expect(result.bodies[0]).toMatchObject({
    id: body.id,
    name: body.name,
    feature: { type: 'brep', width: 300, depth: 200, height: 40 },
  });
  result.bodies[0].origin.forEach((n, i) => expect(n).toBeCloseTo(body.origin[i], 8));
  await expect(page.getByRole('button', { name: 'Reunat', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual([body]);
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  expect((await save(page)).bodies).toEqual(result.bodies);
});

test('dragging a selected edge preserves the multi-selection; typed size wins and Enter plus release commits once', async ({
  page,
}) => {
  const body = makeBody(300, 200, 40);
  await ready(page, [body]);
  const p = await view(page, [body]);
  await page.keyboard.press('f');
  await page.getByRole('combobox', { name: 'Reunakäsittely', exact: true }).selectOption('chamfer');
  const a = p(100, 0, 40),
    b = p(100, 200, 40),
    end = p(100, 5, 40);
  await click(page, a);
  await click(page, b);
  const panel = page.getByRole('region', { name: 'Viisteet ja pyöristykset' });
  await expect(panel).toContainText('2 reunaa valittu');
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 5 });
  await expect(panel).toContainText('2 reunaa valittu');
  await page.keyboard.type('3.5');
  await page.mouse.move(end.x + 50, end.y - 30, { steps: 5 });
  await expect(page.getByTestId('detail-size')).toHaveValue('3.5');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-detail-preview-size', '3.5');
  await expect(page.getByTestId('snap-hint')).toContainText('Viiste 3,5 mm · lukittu');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  await page.mouse.up();
  expect((await save(page)).bodies[0].feature.type).toBe('brep');
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual([body]);
});

test('Esc cancels a drag, invalid sizes preserve geometry, and correcting the size recovers', async ({
  page,
}) => {
  const body = makeBody(200, 160, 40);
  await ready(page, [body]);
  const p = await view(page, [body]);
  const a = p(80, 0, 40),
    b = p(80, 5, 40);
  await page.keyboard.press('f');
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-detail-preview', '');
  expect((await save(page)).bodies).toEqual([body]);
  await page.keyboard.press('f');
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  const huge = p(80, 90, 40);
  await page.mouse.move(huge.x, huge.y, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator('.error-toast')).toContainText('Pienennä');
  expect((await save(page)).bodies).toEqual([body]);
  await page.getByTestId('detail-size').fill('0');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-detail-preview', '');
  await expect(
    page.getByRole('button', { name: 'Hyväksy reunakäsittely', exact: true }),
  ).toBeDisabled();
  // Rapid changes must settle on the latest size rather than a stale CAD response.
  for (const size of ['4', '6', '3']) await page.getByTestId('detail-size').fill(size);
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-detail-preview-size', '3');
  await page.getByTestId('detail-size').press('Enter');
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  expect((await save(page)).bodies[0].feature.type).toBe('brep');
});

test('inherited Hold blocks edge dragging', async ({ page }) => {
  const body = { ...makeBody(200, 160, 40), groupId: 'held' };
  await ready(
    page,
    [body],
    [],
    [{ id: 'held', name: 'Kiinnitetty ryhmä', hidden: false, locked: true }],
  );
  const p = await view(page, [body]);
  await page.keyboard.press('f');
  const a = p(80, 0, 40),
    b = p(80, 10, 40);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-detail-hover', '');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-detail-preview', '');
  expect((await save(page)).bodies).toEqual([body]);
});

test('touch dragging previews and commits, while a second finger restores the pre-drag selection and size', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'tablet', 'Touch emulation');
  const body = makeBody(200, 160, 40);
  await ready(page, [body]);
  const p = await view(page, [body]);
  await page.keyboard.press('f');
  const a = p(80, 0, 40),
    b = p(80, 5, 40);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ ...a, id: 1 }],
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...b, id: 1 }] });
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-detail-dragging', body.id);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { ...b, id: 1 },
      { x: b.x + 70, y: b.y, id: 2 },
    ],
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.getByTestId('detail-size')).toHaveValue('2');
  await expect(page.getByRole('region', { name: 'Viisteet ja pyöristykset' })).toContainText(
    '0 reunaa valittu',
  );
  expect((await save(page)).bodies).toEqual([body]);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ ...a, id: 1 }],
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...b, id: 1 }] });
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-detail-preview-size', '7');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  expect((await save(page)).bodies[0].feature.type).toBe('brep');
});

test('curved edges drag in perspective and a quick release commits the latest size', async ({
  page,
}, info) => {
  const body = makeProfileBody(
    { kind: 'circle', radius: 40 },
    sketchFrame([0, 0, 0]),
    80,
    'Pyöreä jalka',
  );
  await ready(page, [body]);
  await page.getByRole('button', { name: 'Yleisnäkymä', exact: true }).click();
  const rect = (await page.getByTestId('viewport').boundingBox())!,
    box = bounds([body]);
  const min = new THREE.Vector3(...box.min),
    max = new THREE.Vector3(...box.max),
    center = min.clone().add(max).multiplyScalar(0.5);
  const aspect = rect.width / rect.height,
    radius = Math.max(min.distanceTo(max) * 0.65, 100) / Math.min(aspect, 1);
  const camera = new THREE.PerspectiveCamera(40, aspect, 0.1, 1e6);
  camera.up.set(0, 0, 1);
  camera.position
    .copy(center)
    .addScaledVector(new THREE.Vector3(1, -1.4, 1).normalize(), radius / Math.tan(Math.PI / 9));
  camera.lookAt(center);
  camera.updateMatrixWorld();
  const point = new THREE.Vector3(40 / Math.sqrt(2), -40 / Math.sqrt(2), 80).project(camera);
  const a = {
    x: rect.x + ((point.x + 1) * rect.width) / 2,
    y: rect.y + ((1 - point.y) * rect.height) / 2,
  };
  await page.keyboard.press('f');
  await page.mouse.move(a.x, a.y);
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-detail-hover', /.+:\d+/);
  await page.mouse.down();
  await page.mouse.move(a.x + 12, a.y + 10, { steps: 4 });
  const size = Number(await page.getByTestId('detail-size').inputValue());
  expect(size).toBeGreaterThan(2);
  await page.mouse.up();
  await expect(page.getByTestId('dynamic-input')).toHaveCount(0);
  expect((await save(page)).bodies[0].feature.type).toBe('brep');
  await page.screenshot({ path: info.outputPath('curved-edge-drag.png') });
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual([body]);
});

test('pointer cancellation and window blur restore the original draft without changing geometry', async ({
  page,
}) => {
  const body = makeBody(200, 160, 40);
  await ready(page, [body]);
  const p = await view(page, [body]);
  const a = p(80, 0, 40),
    b = p(80, 5, 40);
  await page.keyboard.press('f');
  await click(page, a);
  await page.getByTestId('detail-size').fill('4');
  for (const interruption of ['pointercancel', 'blur']) {
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 5 });
    await expect(page.getByTestId('detail-size')).toHaveValue('9');
    if (interruption === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    else await page.getByTestId('viewport').dispatchEvent('pointercancel', { pointerId: 1 });
    await page.mouse.up();
    await expect(page.getByTestId('detail-size')).toHaveValue('4');
    await expect(page.getByRole('region', { name: 'Viisteet ja pyöristykset' })).toContainText(
      '1 reunaa valittu',
    );
    expect((await save(page)).bodies).toEqual([body]);
  }
});
