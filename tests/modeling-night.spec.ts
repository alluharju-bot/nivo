import { test, expect } from '@playwright/test';
import { makeBody } from '../src/model/project';
import { ready, view, click, save, revealBrowser } from './helpers';

async function shape(page: import('@playwright/test').Page, name: string) {
  await page.getByRole('button', { name: 'Muodot', exact: true }).click();
  await page.getByRole('button', { name, exact: true }).click();
}
test('sphere is placed from a snapped center and exact diameter, persists and undoes once', async ({
  page,
}) => {
  const bodies = [makeBody(600, 400, 18)];
  await ready(page, bodies);
  const p = await view(page, bodies);
  await shape(page, 'Pallo');
  await click(page, p(300, 200, 18));
  await page.mouse.move(p(350, 200, 18).x, p(350, 200, 18).y);
  await page.keyboard.type('100');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '2');
  const result = await save(page),
    sphere = result.bodies[1];
  expect(sphere.feature.type).toBe('brep');
  expect(sphere.feature.width).toBeCloseTo(100, 4);
  expect(sphere.feature.height).toBeCloseTo(100, 4);
  expect(sphere.origin).toEqual([250, 150, -32]);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual(bodies);
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  await expect(page.locator('.save-status')).toContainText('Tallessa');
  await page.reload();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '2');
});
test('Bézier uses the shared surface and snapping, remains separate as a drawing and exposes divide surface', async ({
  page,
}) => {
  const bodies = [makeBody(600, 400, 100)];
  await ready(page, bodies);
  const p = await view(page, bodies);
  await shape(page, 'Bézier-käyrä');
  await page.getByRole('combobox', { name: 'Bézierin piirtotapa' }).selectOption('bezier');
  await page.getByRole('combobox', { name: 'Muodon käyttö' }).selectOption('drawing');
  for (const xy of [
    [200, 0],
    [100, 100],
    [300, 300],
    [200, 400],
  ])
    await click(page, p(xy[0], xy[1], 100));
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '2');
  const result = await save(page);
  expect(result.bodies[0]).toEqual(bodies[0]);
  expect(result.bodies[1].feature.type).toBe('brep');
  expect(result.bodies[1].feature.height).toBeLessThan(1e-5);
  expect(result.bodies[1].purpose).toBe('drawing');
  await page.keyboard.press('Escape');
  await revealBrowser(page);
  await page.getByTestId(`body-${result.bodies[1].id}`).click();
  await expect(page.getByRole('button', { name: 'Jaa pinta', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual(bodies);
});
test('knife click path splits only selected parts, undo restores original linked and locked parts', async ({
  page,
}) => {
  const a = makeBody(600, 400, 100),
    b = { ...makeBody(600, 400, 100, [0, 0, -150]), locked: true };
  await ready(page, [a, b]);
  const p = await view(page, [a, b]);
  await click(page, p(300, 200, 100));
  await page.keyboard.press('n');
  await expect(page.getByRole('region', { name: 'Veitsen asetukset' })).toContainText(
    '1 muokattavaa',
  );
  await click(page, p(200, -80, 100));
  await page.mouse.move(p(200, 480, 100).x, p(200, 480, 100).y);
  await expect(
    page.getByTestId('knife-preview').locator('polyline.knife-stroke'),
  ).not.toHaveAttribute('points', '');
  await click(page, p(200, 480, 100));
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '3');
  const result = await save(page);
  expect(result.bodies.find((v) => v.id === b.id)).toEqual(b);
  expect(
    result.bodies
      .filter((v) => v.id !== b.id)
      .map((v) => Math.round(v.feature.width))
      .sort(),
  ).toEqual([200, 400]);
  await expect(page.getByRole('button', { name: 'Veitsi', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual([a, b]);
});
test('knife silhouette preserves inside and outside; Escape abandons the current stroke', async ({
  page,
}) => {
  const body = makeBody(600, 400, 100);
  await ready(page, [body]);
  const p = await view(page, [body]);
  await page.keyboard.press('n');
  await page.getByRole('combobox', { name: 'Veitsen reitti' }).selectOption('polyline');
  await click(page, p(100, 100, 100));
  await click(page, p(300, 100, 100));
  await page.keyboard.press('Escape');
  expect((await save(page)).bodies).toEqual([body]);
  await expect(page.getByRole('button', { name: 'Veitsi', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  for (const xy of [
    [100, 100],
    [300, 100],
    [300, 300],
    [100, 300],
    [100, 100],
  ])
    await click(page, p(...(xy as [number, number]), 100));
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '2');
  const result = await save(page);
  expect(result.bodies.every((v) => v.feature.type === 'brep' && v.feature.solid)).toBe(true);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual([body]);
});
test('knife Bézier and freehand support curved cuts without losing either side', async ({
  page,
}) => {
  const body = makeBody(600, 400, 100);
  await ready(page, [body]);
  let p = await view(page, [body]);
  await page.keyboard.press('n');
  await page.getByRole('combobox', { name: 'Veitsen reitti' }).selectOption('curve');
  for (const xy of [
    [200, -80],
    [100, 100],
    [350, 300],
    [200, 480],
  ])
    await click(page, p(...(xy as [number, number]), 100));
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '2');
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual([body]);
  await page.getByRole('combobox', { name: 'Veitsen reitti' }).selectOption('free');
  const start = p(300, -80, 100);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (const xy of [
    [300, 50],
    [350, 150],
    [280, 300],
    [300, 480],
  ]) {
    const end = p(...(xy as [number, number]), 100);
    await page.mouse.move(end.x, end.y, { steps: 5 });
  }
  await page.mouse.up();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '2');
});
test('soften all edges previews a measurable radius and can be cancelled without altering the model', async ({
  page,
}) => {
  const body = makeBody(100, 100, 100);
  await ready(page, [body]);
  const p = await view(page, [body]);
  const at = p(50, 50, 100);
  await page.mouse.click(at.x, at.y, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Pehmennä reunat…', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Viisteet ja pyöristykset' })).toContainText(
    '12 reunaa valittu',
  );
  await expect(
    page.getByRole('button', { name: 'Hyväksy reunakäsittely', exact: true }),
  ).toBeEnabled();
  await page.keyboard.press('Escape');
  expect((await save(page)).bodies).toEqual([body]);
});

test('a closed Bézier contour makes a planar face and the saved curve can cut an opening', async ({
  page,
}) => {
  const body = { ...makeBody(600, 400, 100), purpose: 'component' as const };
  await ready(page, [body]);
  const p = await view(page, [body]);
  await shape(page, 'Bézier-käyrä');
  await page.getByRole('combobox', { name: 'Bézierin piirtotapa' }).selectOption('bezier');
  for (const xy of [
    [200, 100],
    [300, 100],
    [300, 300],
    [200, 300],
    [100, 300],
    [100, 100],
    [200, 100],
  ])
    await click(page, p(...(xy as [number, number]), 100));
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '2');
  const result = await save(page);
  expect(result.bodies[0]).toEqual(body);
  expect(result.bodies[1].feature.type).toBe('brep');
  await page.keyboard.press('Escape');
  await revealBrowser(page);
  await page.getByTestId(`body-${result.bodies[1].id}`).click();
  await expect(page.getByRole('button', { name: 'Leikkaa aukko…', exact: true })).toBeVisible();
});

test('changing the view cancels the knife draft and a perspective stroke still splits exactly', async ({
  page,
}, info) => {
  const { Camera, Vector3 } = await import('three');
  const body = makeBody(600, 400, 200);
  await ready(page, [body]);
  const p = await view(page, [body]);
  await page.keyboard.press('n');
  await click(page, p(200, -50, 200));
  await page.mouse.move(p(200, 450, 200).x, p(200, 450, 200).y);
  await expect(page.getByTestId('knife-preview').locator('.knife-stroke')).not.toHaveAttribute(
    'points',
    '',
  );
  await page.getByRole('button', { name: 'Yleisnäkymä', exact: true }).click();
  await expect(page.getByTestId('knife-preview').locator('.knife-stroke')).toHaveAttribute(
    'points',
    '',
  );
  const viewport = page.getByTestId('viewport'),
    rect = (await viewport.boundingBox())!;
  await expect
    .poll(async () => JSON.parse((await viewport.getAttribute('data-camera'))!).position[0])
    .not.toBe(300);
  const data = JSON.parse((await viewport.getAttribute('data-camera'))!);
  const camera = new Camera();
  camera.position.fromArray(data.position);
  camera.quaternion.fromArray(data.quaternion);
  camera.projectionMatrix.fromArray(data.projection);
  camera.updateMatrixWorld();
  const center = new Vector3(300, 200, 100).project(camera);
  const x = rect.x + ((center.x + 1) * rect.width) / 2;
  await click(page, { x, y: rect.y + 70 });
  await page.mouse.move(x, rect.y + rect.height - 70);
  await page.screenshot({ path: info.outputPath('perspective-knife.png') });
  await click(page, { x, y: rect.y + rect.height - 70 });
  await expect(viewport).toHaveAttribute('data-mesh-count', '2');
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual([body]);
});

test('Escape cancels an in-flight knife operation and preserves the previous model and history', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (this: Worker, message: unknown, ...rest: unknown[]) {
      if ((message as { type?: string })?.type === 'knife') {
        const worker = this;
        setTimeout(() => Reflect.apply(post, worker, [message, ...rest]), 700);
      } else Reflect.apply(post, this, [message, ...rest]);
    } as typeof Worker.prototype.postMessage;
  });
  const body = makeBody(600, 400, 100);
  await ready(page, [body]);
  const p = await view(page, [body]);
  await page.keyboard.press('n');
  await click(page, p(200, -80, 100));
  await click(page, p(200, 480, 100));
  await expect(page.locator('.save-status')).toContainText('Lasketaan');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Tallenna tiedosto', exact: true })).toBeEnabled();
  expect((await save(page)).bodies).toEqual([body]);
  await expect(
    page.getByRole('button', { name: 'Toimintohistoria', exact: true }),
  ).not.toContainText('paloiteltu');
});
