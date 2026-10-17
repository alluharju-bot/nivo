import { test, expect } from '@playwright/test';
import { ready, editBody, save } from './helpers';
import { readFile } from 'node:fs/promises';
import { makeBody } from '../src/model/project';
import { surfaceTestProject } from './fixtures/surface-models';
import { PerspectiveCamera, Vector3 } from 'three';
const workspace = (page: Parameters<typeof ready>[0]) =>
  page.getByRole('dialog', { name: 'Verkko ja pinta', exact: true });
test('surface workflow unwraps, bakes, paints and persists an independent part with atomic undo', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const body = makeBody(100, 80, 60, [0, 0, 0], 'Pintatesti');
  await ready(page, [body]);
  await editBody(page, body.id);
  await page.getByRole('button', { name: 'Verkko ja pinta', exact: true }).first().click();
  const dialog = workspace(page);
  await expect(dialog.getByTestId('surface-viewport')).toBeVisible();
  await dialog.getByRole('button', { name: 'Muotoile', exact: true }).click();
  await dialog.getByRole('button', { name: 'Lisää silmukka', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Leikkaussilmukat lisätty');
  await dialog.getByRole('button', { name: 'UV-kartta', exact: true }).click();
  await dialog.getByLabel('Pintakartan koko', { exact: true }).selectOption('128');
  await dialog.getByRole('button', { name: 'Luo UV-kartta', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText(
    'UV-kartta ja nykyiset pintavärit siirretty',
    { timeout: 60_000 },
  );
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Pintakartat', exact: true }).click();
  await dialog.getByRole('button', { name: 'Laske pintakartat', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Pintakartat valmiit', {
    timeout: 60_000,
  });
  await dialog.getByRole('button', { name: 'Maalaa', exact: true }).click();
  const viewport = await dialog.getByTestId('surface-viewport').boundingBox();
  await page.mouse.move(viewport!.x + viewport!.width * 0.5, viewport!.y + viewport!.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(
    viewport!.x + viewport!.width * 0.53,
    viewport!.y + viewport!.height * 0.5,
    { steps: 4 },
  );
  await page.mouse.up();
  await expect(dialog.getByRole('status')).toContainText('Siveltimenveto tallennettu');
  await page.screenshot({ path: test.info().outputPath('verkko-ja-pinta.png') });
  await dialog.getByLabel('Työversion nimi', { exact: true }).fill('Muokattu pinta');
  await dialog.getByRole('button', { name: 'Lisää työversio projektiin', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const result = await save(page);
  expect(result.bodies).toHaveLength(2);
  expect(result.bodies[0]).toEqual(JSON.parse(JSON.stringify({ ...body, hidden: true })));
  const copy = result.bodies[1];
  expect(copy.feature.type).toBe('mesh');
  expect(copy.surfaceWorkflow?.uvAtlas).toBe(true);
  expect(copy.appearance?.maps?.normal).toBeTruthy();
  expect(copy.appearance?.maps?.ao).toBeTruthy();
  expect(Object.keys(result.assets ?? {})).toHaveLength(5);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual([body]);
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  expect((await save(page)).bodies).toEqual(result.bodies);
  await page.reload();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
  expect((await save(page)).bodies).toEqual(result.bodies);
  await editBody(page, copy.id);
  await page.getByRole('button', { name: 'Verkko ja pinta', exact: true }).first().click();
  await expect(workspace(page).getByTestId('surface-viewport')).toBeVisible();
  await expect(workspace(page).getByText('UV valmis', { exact: true })).toBeVisible();
  await workspace(page).getByRole('button', { name: 'Sulje Verkko ja pinta', exact: true }).click();
  if (!(await page.getByRole('button', { name: 'Vie 3D-malli', exact: true }).isVisible()))
    await page.getByRole('button', { name: 'Lisää toimintoja', exact: true }).click();
  await page.getByRole('button', { name: 'Vie 3D-malli', exact: true }).click();
  const exportDialog = page.getByRole('dialog', { name: 'Vie 3D-malli', exact: true });
  await exportDialog.getByLabel('3D-tiedostomuoto').selectOption('glb');
  const pending = page.waitForEvent('download');
  await exportDialog.getByRole('button', { name: 'Lataa tiedosto', exact: true }).click();
  const file = await pending,
    buffer = await readFile((await file.path())!);
  const gltf = JSON.parse(buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString());
  expect(
    gltf.materials.some(
      (m: { normalTexture?: unknown; occlusionTexture?: unknown }) =>
        m.normalTexture && m.occlusionTexture,
    ),
  ).toBe(true);
  expect(
    gltf.meshes.some((m: { primitives: { attributes: Record<string, number> }[] }) =>
      m.primitives.some((p) => p.attributes.TEXCOORD_0 !== undefined),
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test('primitive segment control and sculpting stay local until acceptance; cancel leaves project intact', async ({
  page,
}) => {
  const body = makeBody(100, 80, 60);
  await ready(page, [body]);
  await editBody(page, body.id);
  await page.getByRole('button', { name: 'Verkko ja pinta', exact: true }).first().click();
  const d = workspace(page);
  await d.getByText('Ympyrä, sylinteri tai pallo', { exact: true }).click();
  await d.getByLabel('Verkon sivujen määrä', { exact: true }).fill('8');
  await d.getByRole('button', { name: 'Vaihda työversio tähän muotoon', exact: true }).click();
  await expect(d.getByTestId('surface-viewport')).toHaveAttribute('data-triangles', '48');
  await d.getByRole('button', { name: 'Muotoile', exact: true }).click();
  await d.getByRole('button', { name: 'Nosta', exact: true }).click();
  const box = await d.getByTestId('surface-viewport').boundingBox();
  await page.mouse.click(box!.x + box!.width * 0.5, box!.y + box!.height * 0.5);
  await d.getByRole('button', { name: 'Sulje Verkko ja pinta', exact: true }).click();
  await d.getByRole('button', { name: 'Hylkää työversio', exact: true }).click();
  expect((await save(page)).bodies).toEqual([body]);
});
test('cancelling a bake retains the UV draft and permits a subsequent job', async ({ page }) => {
  test.setTimeout(90_000);
  const body = makeBody(100, 80, 60);
  await ready(page, [body]);
  await editBody(page, body.id);
  await page.getByRole('button', { name: 'Verkko ja pinta', exact: true }).first().click();
  const d = workspace(page);
  await d.getByRole('button', { name: 'UV-kartta', exact: true }).click();
  await d.getByLabel('Pintakartan koko').selectOption('128');
  await d.getByRole('button', { name: 'Luo UV-kartta', exact: true }).click();
  await expect(d.getByRole('status')).toContainText('pintavärit siirretty', { timeout: 60000 });
  await d.getByRole('button', { name: 'Pintakartat', exact: true }).click();
  await d.getByLabel('Pintakartan koko').selectOption('1024');
  await d.getByLabel('AO-näytteet').selectOption('64');
  await d.getByRole('button', { name: 'Laske pintakartat', exact: true }).click();
  await d.getByRole('button', { name: 'Peru laskenta', exact: true }).click();
  await expect(d.getByRole('status')).toContainText('Laskenta peruttu');
  await expect(d.getByText('UV valmis', { exact: true })).toBeVisible();
  await d.getByLabel('Pintakartan koko').selectOption('128');
  await d.getByLabel('AO-näytteet').selectOption('8');
  await d.getByRole('button', { name: 'Laske pintakartat', exact: true }).click();
  await expect(d.getByRole('status')).toContainText('Pintakartat valmiit');
  await d.getByRole('button', { name: 'Sulje Verkko ja pinta', exact: true }).click();
  await d.getByRole('button', { name: 'Hylkää työversio', exact: true }).click();
  expect((await save(page)).bodies).toEqual([body]);
});

test('new loops transform immediately, protection and local undo stay coherent, invalid folds are refused', async ({
  page,
}) => {
  const body = makeBody(100, 80, 60);
  await ready(page, [body]);
  await editBody(page, body.id);
  await page.getByRole('button', { name: 'Verkko ja pinta', exact: true }).first().click();
  const d = workspace(page);
  await d.getByRole('button', { name: 'Muotoile', exact: true }).click();
  await d.getByRole('button', { name: 'Lisää silmukka', exact: true }).click();
  await expect(d.getByRole('status')).toContainText('Leikkaussilmukat lisätty');
  await expect(d.getByTestId('surface-viewport')).not.toHaveAttribute('data-selected', '0');
  await d.getByRole('button', { name: 'Suojaa valinta', exact: true }).click();
  await expect(d.getByTestId('surface-viewport')).not.toHaveAttribute('data-protected', '0');
  await d.getByRole('button', { name: 'Peru työversion muutos', exact: true }).click();
  await expect(d.getByTestId('surface-viewport')).toHaveAttribute('data-protected', '0');
  await d.getByLabel('Silmukan Z', { exact: true }).fill('5');
  await d.getByRole('button', { name: 'Hyväksy silmukan muutos', exact: true }).click();
  await expect(d.getByRole('status')).toContainText('Silmukan muutos hyväksytty');
  await d.getByLabel('Silmukan Z', { exact: true }).fill('100');
  await d.getByRole('button', { name: 'Hyväksy silmukan muutos', exact: true }).click();
  await expect(d.getByRole('alert')).toContainText(/leikkaavat|nurin|litistää/);
  await d.getByRole('button', { name: 'Skaalaa', exact: true }).click();
  await d.getByLabel('Silmukan X', { exact: true }).fill('80');
  await d.getByLabel('Silmukan Y', { exact: true }).fill('80');
  await d.getByRole('button', { name: 'Hyväksy silmukan muutos', exact: true }).click();
  await expect(d.getByRole('status')).toContainText('Silmukan muutos hyväksytty');
  await d.getByRole('button', { name: 'Suojaa valinta', exact: true }).click();
  await d.getByRole('button', { name: 'Lisää työversio projektiin', exact: true }).click();
  await expect(d).toHaveCount(0);
  const result = await save(page),
    mesh = result.bodies[1];
  expect(mesh.surfaceWorkflow?.mask?.some((n) => n === 1)).toBe(true);
  expect(mesh.surfaceWorkflow?.loops).toHaveLength(1);
  if (mesh.feature.type !== 'mesh') throw new Error('Expected mesh');
  const selected = mesh.surfaceWorkflow!.loops![0];
  expect(
    selected.every(
      (i) =>
        Math.abs(
          mesh.feature.type === 'mesh'
            ? mesh.feature.vertices[i * 3 + 2] + mesh.origin[2] - 35
            : Infinity,
        ) < 0.0001,
    ),
  ).toBe(true);
});

test('accepted strokes and loops recover after reload, and explicit discard removes the recovery', async ({
  page,
}) => {
  const body = makeBody(100, 80, 60);
  await ready(page, [body]);
  await editBody(page, body.id);
  await page.getByRole('button', { name: 'Verkko ja pinta', exact: true }).first().click();
  const d = workspace(page);
  await d.getByRole('button', { name: 'Muotoile', exact: true }).click();
  await d.getByRole('button', { name: 'Lisää silmukka', exact: true }).click();
  await expect(d.getByRole('status')).toContainText('Leikkaussilmukat lisätty');
  await d.getByRole('button', { name: 'Suojaa valinta', exact: true }).click();
  await d.getByLabel('Työversion nimi', { exact: true }).fill('Palautettava muoto');
  await expect(
    d.getByText('Työversio varmistettu tällä laitteella.', { exact: true }),
  ).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.reload();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
  expect((await save(page)).bodies).toEqual([body]);
  await editBody(page, body.id);
  await page.getByRole('button', { name: 'Verkko ja pinta', exact: true }).first().click();
  const prompt = page.getByRole('dialog', { name: 'Palauta keskeneräinen työversio', exact: true });
  await expect(prompt.getByText('Palautettava muoto', { exact: false })).toBeVisible();
  await prompt.getByRole('button', { name: 'Palauta työversio', exact: true }).click();
  await expect(d.getByTestId('surface-viewport')).not.toHaveAttribute('data-selected', '0');
  await expect(d.getByTestId('surface-viewport')).not.toHaveAttribute('data-protected', '0');
  await expect(d.getByLabel('Työversion nimi', { exact: true })).toHaveValue('Palautettava muoto');
  await d.getByRole('button', { name: 'Sulje Verkko ja pinta', exact: true }).click();
  await d.getByRole('button', { name: 'Hylkää työversio', exact: true }).click();
  await page.getByRole('button', { name: 'Verkko ja pinta', exact: true }).first().click();
  await expect(d.getByTestId('surface-viewport')).toBeVisible();
  await expect(prompt).toHaveCount(0);
  await expect(d.getByTestId('surface-viewport')).toHaveAttribute('data-selected', '0');
});

test('loop gizmo drags in the viewport and Escape cancels an unfinished drag', async ({ page }) => {
  const body = makeBody(100, 80, 60);
  await ready(page, [body]);
  await editBody(page, body.id);
  await page.getByRole('button', { name: 'Verkko ja pinta', exact: true }).first().click();
  const d = workspace(page);
  await d.getByRole('button', { name: 'Muotoile', exact: true }).click();
  await d.getByRole('button', { name: 'Lisää silmukka', exact: true }).click();
  await expect(d.getByRole('status')).toContainText('Leikkaussilmukat lisätty');
  const rect = (await d.getByTestId('surface-viewport').boundingBox())!;
  const camera = new PerspectiveCamera(42, rect.width / rect.height, 0.01, 10000),
    center = new Vector3(50, 40, 30);
  camera.up.set(0, 0, 1);
  camera.position.copy(center).add(new Vector3(1.4, -1.8, 1.2).normalize().multiplyScalar(270));
  camera.lookAt(center);
  camera.updateMatrixWorld();
  const screen = (z: number) => {
    const p = new Vector3(50, 40, z).project(camera);
    return { x: rect.x + ((p.x + 1) * rect.width) / 2, y: rect.y + ((1 - p.y) * rect.height) / 2 };
  };
  const start = screen(41),
    end = screen(49);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 5 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(d.getByRole('status')).toContainText('Leikkaussilmukat lisätty');
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 5 });
  await page.keyboard.press('ControlOrMeta+z');
  await page.mouse.up();
  await expect(d.getByRole('status')).toContainText('Leikkaussilmukat lisätty');
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 5 });
  await page.mouse.up();
  await expect(d.getByRole('status')).toContainText('Silmukan muutos hyväksytty');
  await d.getByRole('button', { name: 'Lisää työversio projektiin', exact: true }).click();
  await expect(d).toHaveCount(0);
  const part = (await save(page)).bodies[1];
  if (part.feature.type !== 'mesh') throw new Error('Expected mesh');
  const z = part.surfaceWorkflow!.loops![0].map((i) =>
    part.feature.type === 'mesh' ? part.feature.vertices[i * 3 + 2] + part.origin[2] : NaN,
  );
  expect(Math.max(...z) - Math.min(...z)).toBeLessThan(0.001);
  expect(z[0]).toBeGreaterThan(36);
  expect(z[0]).toBeLessThan(40);
});

for (const [i, label] of ['thin-shell', 'recess', 'mirrored', 'materials'].entries()) {
  test(`UV and bake hardening model: ${label}`, async ({ page }) => {
    test.setTimeout(120000);
    const project = surfaceTestProject(),
      body = project.bodies[i];
    await ready(page, [body]);
    await editBody(page, body.id);
    await page.getByRole('button', { name: 'Verkko ja pinta', exact: true }).first().click();
    const d = workspace(page);
    await d.getByRole('button', { name: 'UV-kartta', exact: true }).click();
    await d.getByLabel('Pintakartan koko', { exact: true }).selectOption('256');
    await d.getByRole('button', { name: 'Luo UV-kartta', exact: true }).click();
    await expect(d.getByRole('status')).toContainText(
      'UV-kartta ja nykyiset pintavärit siirretty',
      { timeout: 60000 },
    );
    await expect(d.getByRole('alert')).toHaveCount(0);
    await d.getByRole('button', { name: 'Pintakartat', exact: true }).click();
    // Keep the cage below thin-shell thickness to distinguish sides during high-to-low transfer.
    await d.getByLabel('Pinnan hakumatka · mm', { exact: true }).fill('0,2');
    await d.getByRole('button', { name: 'Laske pintakartat', exact: true }).click();
    await expect(d.getByRole('status')).toContainText('Pintakartat valmiit', { timeout: 60000 });
    await expect(d.getByRole('alert')).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath(`pintatesti-${label}.png`) });
    await d.getByRole('button', { name: 'Lisää työversio projektiin', exact: true }).click();
    await expect(d).toHaveCount(0);
    const result = await save(page),
      baked = result.bodies[1];
    expect(baked.surfaceWorkflow?.baked).toBe(true);
    expect(Object.keys(result.assets ?? {})).toHaveLength(5);
    expect(result.bodies[0]).toEqual(JSON.parse(JSON.stringify({ ...body, hidden: true })));
  });
}
