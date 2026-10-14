import { test, expect, type Page } from '@playwright/test';
import * as THREE from 'three';
import { ready, save, editBody } from './helpers';
import { makeBody, makeProfileBody, bounds, type Body } from '../src/model/project';
import { sketchFrame } from '../src/model/sketch';
import { asComponent } from '../src/model/components';

const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const list: string[] = [];
  errors.set(page, list);
  page.on('pageerror', (e) => list.push(e.message));
});
test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([]);
});

const dialog = (page: Page) =>
  page.getByRole('dialog', { name: 'Geometrian muokkaus', exact: true });
async function open(page: Page, id: string, edit = false) {
  const start = page.getByRole('dialog', { name: 'Enemmän tilaa mallille' });
  if (await start.isVisible())
    await start.getByRole('button', { name: 'Jatka selaimessa', exact: true }).click();
  if (edit) {
    if ((await page.getByTestId('viewport').getAttribute('data-editing-body')) !== id)
      await editBody(page, id);
  } else {
    const list = page.getByRole('complementary', { name: 'Mallilista' });
    if (!(await list.count()) || (await list.getAttribute('data-expanded')) === 'false')
      await page.getByRole('button', { name: 'Näytä mallilista' }).press('Enter');
    await page.getByTestId(`body-${id}`).click();
    if (await page.getByRole('button', { name: 'Piilota mallilista' }).isVisible())
      await page.getByRole('button', { name: 'Piilota mallilista' }).press('Enter');
  }
  if (!(await page.getByRole('button', { name: 'Geometrian muokkaus', exact: true }).isVisible()))
    await page.getByRole('button', { name: 'Avaa ominaisuudet', exact: true }).click();
  await page.getByRole('button', { name: 'Geometrian muokkaus', exact: true }).click();
  await expect(dialog(page)).toBeVisible();
}
async function topPoints(page: Page) {
  await dialog(page).getByText('Valinta ja tarkkuus', { exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Valitse Z+ tason pisteet', exact: true }).click();
}
async function project(page: Page, body: Body, kind: 'top' | 'front' | 'right' = 'top') {
  const d = dialog(page);
  await d
    .getByRole('button', {
      name: { top: 'Ylhäältä', front: 'Edestä', right: 'Sivulta' }[kind],
      exact: true,
    })
    .click();
  const rect = (await page.getByTestId('geometry-stage').boundingBox())!;
  const b = bounds([body]),
    min = new THREE.Vector3(...b.min),
    max = new THREE.Vector3(...b.max);
  const centre = min.clone().add(max).multiplyScalar(0.5),
    aspect = rect.width / rect.height;
  const camera = new THREE.PerspectiveCamera(40, aspect, 0.01, 1e6);
  camera.up.set(0, 0, 1);
  const distance = Math.max(min.distanceTo(max) * 1.8, 30) / Math.min(aspect, 1);
  camera.position
    .copy(centre)
    .addScaledVector(
      new THREE.Vector3(
        ...{ top: [0, -0.00001, 1], front: [0, -1, 0.001], right: [1, 0, 0.001] }[kind],
      ).normalize(),
      distance,
    );
  camera.lookAt(centre);
  camera.updateMatrixWorld();
  return (x: number, y: number, z: number) => {
    const p = new THREE.Vector3(x, y, z).project(camera);
    return { x: rect.x + ((p.x + 1) * rect.width) / 2, y: rect.y + ((1 - p.y) * rect.height) / 2 };
  };
}
test('direct editor previews, cancels, commits exact CAD and supports project undo and reload', async ({
  page,
}) => {
  const body = makeBody(100, 80, 60);
  await ready(page, [body]);
  await open(page, body.id);
  await topPoints(page);
  const d = dialog(page);
  await expect(d.getByText('Valittuna 4 pistettä', { exact: true })).toBeVisible();
  await d.getByRole('textbox', { name: 'Geometrian siirtymä Z', exact: true }).fill('10');
  await d.getByRole('button', { name: 'Peru · Esc', exact: true }).click();
  expect((await save(page)).bodies).toEqual([body]);
  await open(page, body.id);
  await topPoints(page);
  await d.getByRole('textbox', { name: 'Geometrian siirtymä Z', exact: true }).fill('10');
  await d.getByRole('button', { name: 'Hyväksy osaan', exact: true }).click();
  await expect(d).not.toBeVisible();
  const result = await save(page);
  expect(result.bodies[0].feature.type).toBe('brep');
  expect(bounds(result.bodies)).toEqual({ min: [0, 0, 0], max: [100, 80, 70] });
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual([body]);
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  expect((await save(page)).bodies).toEqual(result.bodies);
  await page.reload();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
  expect((await save(page)).bodies).toEqual(result.bodies);
});
test('point and edge picking, Shift selection, planar face scaling and edit context', async ({
  page,
}) => {
  const body = makeBody(100, 80, 60);
  await ready(page, [body]);
  await open(page, body.id, true);
  const d = dialog(page),
    p = await project(page, body),
    a = p(0, 0, 60),
    b = p(100, 80, 60);
  await page.mouse.move(a.x, a.y);
  await expect(d.locator('canvas')).toHaveCSS('cursor', 'crosshair');
  await page.mouse.click(a.x, a.y);
  await expect(d.getByText('Valittuna 1 pistettä', { exact: true })).toBeVisible();
  await d.getByRole('button', { name: 'Skaalaa', exact: true }).click();
  await expect(
    d.getByText('Poimi ankkuri eri pisteeseen tai valitse useita pisteitä.', { exact: true }),
  ).toBeVisible();
  await d.getByRole('button', { name: 'Siirrä', exact: true }).click();
  await page.keyboard.down('Shift');
  await page.mouse.click(b.x, b.y);
  await page.keyboard.up('Shift');
  await expect(d.getByText('Valittuna 2 pistettä', { exact: true })).toBeVisible();
  await d.getByRole('button', { name: 'Tyhjennä', exact: true }).click();
  await d.getByRole('button', { name: 'Reunat', exact: true }).click();
  const mid = p(50, 0, 60);
  await page.mouse.click(mid.x, mid.y);
  await expect(d.getByText('Valittuna 2 pistettä', { exact: true })).toBeVisible();
  await d.getByRole('button', { name: 'Tyhjennä', exact: true }).click();
  await d.getByRole('button', { name: 'Pinnat', exact: true }).click();
  const c = p(50, 40, 60);
  await page.mouse.click(c.x, c.y);
  await expect(d.getByText('Valittuna 4 pistettä', { exact: true })).toBeVisible();
  await d.getByRole('button', { name: 'Skaalaa', exact: true }).click();
  await d.getByRole('button', { name: 'Z', exact: true }).click();
  await d.getByRole('textbox', { name: 'Geometrian skaala Skaala', exact: true }).fill('50');
  await page.screenshot({ path: test.info().outputPath('geometry-face-scale.png') });
  await d.getByRole('button', { name: 'Hyväksy osaan', exact: true }).click();
  await expect(d).not.toBeVisible();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-editing-body', body.id);
  const result = await save(page);
  expect(bounds(result.bodies)).toEqual({ min: [0, 0, 0], max: [100, 80, 60] });
  await open(page, body.id, true);
  await topPoints(page);
  await expect(d.getByText('Valittuna 4 pistettä', { exact: true })).toBeVisible();
  await d.getByRole('textbox', { name: 'Geometrian siirtymä Z', exact: true }).fill('-10');
  await d.getByRole('button', { name: 'Hyväksy osaan', exact: true }).click();
  await expect(d).not.toBeVisible();
  expect(bounds((await save(page)).bodies).max[2]).toBe(50);
});
test('invalid geometry remains a cancellable draft and can be corrected', async ({ page }) => {
  const body = makeBody(100, 80, 60);
  await ready(page, [body]);
  await open(page, body.id);
  await topPoints(page);
  const d = dialog(page),
    z = d.getByRole('textbox', { name: 'Geometrian siirtymä Z', exact: true });
  await z.fill('-60');
  await d.getByRole('button', { name: 'Hyväksy osaan', exact: true }).click();
  await expect(d.getByRole('alert')).toContainText('Pisteet osuvat yhteen');
  await z.fill('15');
  await d.getByRole('button', { name: 'Hyväksy osaan', exact: true }).click();
  await expect(d).not.toBeVisible();
  expect(bounds((await save(page)).bodies).max[2]).toBe(75);
});
test('linked edits propagate while a held sibling requires an explicit unique part', async ({
  page,
}) => {
  const a = asComponent(makeBody(100, 80, 60)),
    b = asComponent(makeBody(100, 80, 60, [200, 0, 0]), a.component!.id);
  await ready(page, [a, b]);
  await open(page, a.id);
  await topPoints(page);
  const d = dialog(page);
  await expect(d.getByText('Muutos jaetaan 2 linkitettyyn osaan.')).toBeVisible();
  await d.getByRole('textbox', { name: 'Geometrian siirtymä Z', exact: true }).fill('10');
  await d.getByRole('button', { name: 'Hyväksy osaan', exact: true }).click();
  await expect(d).not.toBeVisible();
  expect((await save(page)).bodies.map((b) => b.feature.height)).toEqual([70, 70]);
});
test('held linked copy requires an explicit unique part', async ({ page }) => {
  const a = asComponent(makeBody(100, 80, 60)),
    b = asComponent(makeBody(100, 80, 60, [200, 0, 0]), a.component!.id);
  const d = dialog(page);
  await ready(page, [a, { ...b, locked: true }]);
  await open(page, a.id);
  await topPoints(page);
  await d.getByRole('textbox', { name: 'Geometrian siirtymä Z', exact: true }).fill('10');
  await expect(d.getByRole('button', { name: 'Hyväksy osaan', exact: true })).toBeDisabled();
  await d
    .getByRole('checkbox', { name: 'Muokkaa vain tätä osaa · tee uniikki', exact: true })
    .check();
  await d.getByRole('button', { name: 'Hyväksy osaan', exact: true }).click();
  await expect(d).not.toBeVisible();
  const result = await save(page);
  expect(result.bodies[0].feature.height).toBe(70);
  expect(result.bodies[0].component).toBeUndefined();
  expect(result.bodies[1]).toEqual({ ...b, locked: true });
});
test('curved CAD requires a separate mesh and preserves original with one-step undo', async ({
  page,
}) => {
  const body = makeProfileBody(
    { kind: 'circle', radius: 30 },
    sketchFrame([0, 0, 0]),
    40,
    'Sylinteri',
    'model',
  );
  await ready(page, [body]);
  await open(page, body.id);
  const d = dialog(page);
  await expect(d.getByText('sisältää kaarevia CAD-pintoja.', { exact: false })).toBeVisible();
  await d.getByRole('button', { name: 'Muokkaa verkkokopiota', exact: true }).click();
  await topPoints(page);
  await d.getByRole('button', { name: 'Skaalaa', exact: true }).click();
  await d.getByRole('button', { name: 'Z', exact: true }).click();
  await d.getByRole('textbox', { name: 'Geometrian skaala Skaala', exact: true }).fill('50');
  await d.getByRole('button', { name: 'Luo verkkokopio', exact: true }).click();
  await expect(d).not.toBeVisible();
  const result = await save(page);
  expect(result.bodies).toHaveLength(2);
  expect(result.bodies[0]).toEqual({ ...body, hidden: true });
  expect(result.bodies[1].feature.type).toBe('mesh');
  expect(result.bodies[1].feature.type === 'mesh' && result.bodies[1].feature.solid).toBe(true);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual([body]);
});
test('axis handle drag stays local to the draft', async ({ page }) => {
  const body = makeBody(100, 80, 60);
  await ready(page, [body]);
  await open(page, body.id);
  const d = dialog(page),
    p = await project(page, body);
  await topPoints(page);
  const c = p(50, 40, 60),
    stage = page.getByTestId('geometry-stage');
  const builds = await page.getByTestId('viewport').getAttribute('data-geometry-builds');
  await page.mouse.move(c.x + 45, c.y);
  await expect(stage).toHaveAttribute('data-handle-axis', 'X');
  await page.mouse.down();
  await page.mouse.move(c.x + 80, c.y, { steps: 8 });
  await page.mouse.up();
  await expect(d.getByRole('button', { name: 'Peru geometriamuutos', exact: true })).toBeEnabled();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-geometry-builds', builds!);
  await d.getByRole('button', { name: 'Hyväksy osaan', exact: true }).click();
  await expect(d).not.toBeVisible();
  const result = await save(page);
  expect(result.bodies[0].feature.width).toBeGreaterThan(105);
  expect(result.bodies[0].feature.height).toBe(60);
  expect(result.bodies[0].origin).toEqual([0, 0, 0]);
});
test('box selection, explicit pivot and local undo work without changing the main tool', async ({
  page,
}) => {
  const body = makeBody(100, 80, 60);
  await ready(page, [body]);
  await open(page, body.id);
  const d = dialog(page),
    p = await project(page, body),
    a = p(0, 80, 60),
    b = p(100, 0, 60);
  await d
    .getByRole('checkbox', { name: 'Valitse myös takana olevat pisteet', exact: true })
    .check();
  await page.mouse.move(a.x - 18, a.y - 18);
  await page.mouse.down();
  await page.mouse.move(b.x + 18, b.y + 18, { steps: 6 });
  await page.mouse.up();
  await expect(d.getByText('Valittuna 8 pistettä', { exact: true })).toBeVisible();
  await d.getByRole('button', { name: 'Poimi ankkuri', exact: true }).click();
  const anchor = p(0, 0, 60);
  await page.mouse.click(anchor.x, anchor.y);
  await d.getByRole('button', { name: 'Kierrä', exact: true }).click();
  await d.getByRole('textbox', { name: 'Geometrian kierto Z', exact: true }).fill('90');
  await d.getByRole('textbox', { name: 'Geometrian kierto Z', exact: true }).press('Enter');
  await d.getByRole('button', { name: 'Peru geometriamuutos', exact: true }).click();
  await expect(d.getByRole('button', { name: 'Hyväksy osaan', exact: true })).toBeDisabled();
  await d.getByRole('button', { name: 'Palauta geometriamuutos', exact: true }).click();
  await d.getByRole('button', { name: 'Hyväksy osaan', exact: true }).click();
  await expect(d).not.toBeVisible();
  const result = await save(page),
    extent = bounds(result.bodies);
  expect(extent.min[0]).toBeCloseTo(-80, 5);
  expect(extent.min[1]).toBeCloseTo(0, 5);
  expect(extent.max[0]).toBeCloseTo(0, 5);
  expect(extent.max[1]).toBeCloseTo(100, 5);
});
test('dialog fits a phone screen and Escape leaves the main geometry unchanged', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const body = makeBody(100, 80, 60);
  await ready(page, [body]);
  await open(page, body.id);
  const d = dialog(page);
  await expect(d.locator('canvas')).toBeVisible();
  const rect = (await d.boundingBox())!;
  expect(rect.x).toBeGreaterThanOrEqual(0);
  expect(rect.y).toBeGreaterThanOrEqual(0);
  expect(rect.x + rect.width).toBeLessThanOrEqual(390);
  expect(rect.y + rect.height).toBeLessThanOrEqual(844);
  await expect(d.getByRole('button', { name: 'Peru · Esc', exact: true })).toBeInViewport({
    ratio: 1,
  });
  await page.screenshot({ path: test.info().outputPath('geometry-mobile.png') });
  await d.getByRole('button', { name: 'Kaikki', exact: true }).click();
  await d.getByRole('textbox', { name: 'Geometrian siirtymä X', exact: true }).fill('20');
  await d.getByRole('textbox', { name: 'Geometrian siirtymä X', exact: true }).press('Escape');
  await expect(d).not.toBeVisible();
  await page.setViewportSize({ width: 1440, height: 960 });
  expect((await save(page)).bodies).toEqual([body]);
});

test('reference pickup projects onto enabled axes from the chosen anchor', async ({ page }) => {
  const body = makeBody(100, 80, 60);
  await ready(page, [body]);
  await open(page, body.id);
  const d = dialog(page),
    p = await project(page, body, 'front');
  await d.getByRole('button', { name: 'Kaikki', exact: true }).click();
  await d.getByRole('button', { name: 'Poimi ankkuri', exact: true }).click();
  const a = p(0, 0, 60);
  await page.mouse.click(a.x, a.y);
  await d.getByRole('button', { name: 'X', exact: true }).click();
  await d.getByRole('button', { name: 'Y', exact: true }).click();
  await d.getByRole('button', { name: 'Poimi viite', exact: true }).click();
  const b = p(100, 0, 0);
  await page.mouse.click(b.x, b.y);
  await expect(d.getByRole('textbox', { name: 'Geometrian siirtymä Z', exact: true })).toHaveValue(
    '-60',
  );
  await d.getByRole('button', { name: 'Hyväksy osaan', exact: true }).click();
  await expect(d).not.toBeVisible();
  expect(bounds((await save(page)).bodies)).toEqual({ min: [0, 0, -60], max: [100, 80, 0] });
});

test('a failed tool module download leaves the model and normal tools available', async ({
  page,
}) => {
  const body = makeBody(100, 80, 60);
  await ready(page, [body]);
  await page.route(/GeometryEditor[^/]*\.(?:js|tsx)(?:\?.*)?$/, (route) => route.abort());
  await open(page, body.id);
  const d = dialog(page);
  await expect(d.getByText('Työkalua ei saatu ladattua.', { exact: false })).toBeVisible();
  await d.getByRole('button', { name: 'Palaa malliin', exact: true }).click();
  await expect(d).not.toBeVisible();
  expect((await save(page)).bodies).toEqual([body]);
  await page.getByRole('button', { name: 'Siirrä', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Siirrä', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});
