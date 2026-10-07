import { test, expect, type Page } from '@playwright/test';
import * as THREE from 'three';
import { makeBody } from '../src/model/project';
import { defaultAppearance, findPreset } from '../src/model/materials';
import { ready, save } from './helpers';

async function point(page: Page, xyz: [number, number, number]) {
  const canvas = page.getByTestId('render-canvas');
  const rect = (await canvas.boundingBox())!;
  const data = JSON.parse((await canvas.getAttribute('data-camera'))!);
  const camera = new THREE.PerspectiveCamera();
  camera.position.fromArray(data.position);
  camera.quaternion.fromArray(data.quaternion);
  camera.projectionMatrix.fromArray(data.projection);
  camera.updateMatrixWorld();
  const p = new THREE.Vector3(...xyz).project(camera);
  return { x: rect.x + ((p.x + 1) * rect.width) / 2, y: rect.y + ((1 - p.y) * rect.height) / 2 };
}

test('texture tool stays active across drags, commits, picks and undo, then brush paints chosen parts', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const a = {
    ...makeBody(200, 200, 100, [0, 0, 0], 'Ensimmäinen'),
    appearance: defaultAppearance('pbr-coated_pine'),
  };
  const b = {
    ...makeBody(200, 200, 100, [400, 0, 0], 'Toinen'),
    appearance: defaultAppearance('walnut'),
  };
  const held = {
    ...makeBody(200, 200, 100, [800, 0, 0], 'Lukittu'),
    locked: true,
    appearance: defaultAppearance('oak'),
  };
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await ready(page, [a, b, held]);
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  const texture = page.getByRole('button', { name: 'Muokkaa tekstuuria', exact: true });
  await texture.click();
  await expect(texture).toHaveAttribute('aria-pressed', 'true');
  let p = await point(page, [40, 40, 100]);
  await page.mouse.click(p.x, p.y);
  await expect(page.getByTestId('render-canvas')).toHaveAttribute('data-texture-editing', a.id);
  await expect(page.getByLabel('Tekstuurin kierto', { exact: true })).toBeInViewport();
  for (let i = 0; i < 2; i++) {
    p = await point(page, [40, 40, 100]);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.mouse.move(p.x + 18, p.y + 8, { steps: 4 });
    await page.mouse.up();
    await expect(texture).toBeEnabled();
    await expect(texture).toHaveAttribute('aria-pressed', 'true');
  }
  const dragged = (await save(page)).bodies[0].appearance!.texture;
  expect(Math.abs(dragged.offsetX) + Math.abs(dragged.offsetY)).toBeGreaterThan(1);
  await page.getByLabel('Tekstuurin kierto', { exact: true }).fill('33');
  await page.keyboard.press('Enter');
  await expect(texture).toHaveAttribute('aria-pressed', 'true');
  expect((await save(page)).bodies[0].appearance!.texture.rotation).toBe(33);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  await expect(page.getByLabel('Tekstuurin kierto', { exact: true })).toHaveValue('0');
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  await expect(page.getByLabel('Tekstuurin kierto', { exact: true })).toHaveValue('33');
  p = await point(page, [440, 40, 100]);
  await page.mouse.click(p.x, p.y);
  await expect(page.getByTestId('render-canvas')).toHaveAttribute('data-texture-editing', b.id);
  await page.getByLabel('Kuvion leveys', { exact: true }).fill('450');
  await page.keyboard.press('Enter');
  await expect(texture).toBeEnabled();
  await page.screenshot({ path: info.outputPath('persistent-texture-tool.png') });
  await page.keyboard.press('Escape');
  await expect(texture).toHaveAttribute('aria-pressed', 'false');
  let project = await save(page);
  expect(project.bodies[0].appearance!.texture.rotation).toBe(33);
  expect(project.bodies[1].appearance!.texture.width).toBe(450);
  await page.getByRole('button', { name: 'Maalaa', exact: true }).click();
  await page.getByLabel('Etsi materiaalia', { exact: true }).fill('betoni');
  await expect(page.locator('.material-swatches button')).toHaveCount(4);
  await page.getByRole('button', { name: 'Raaka betoni', exact: true }).click();
  // Choosing a brush material does not paint until the user clicks a part.
  expect((await save(page)).bodies[1].appearance!.preset).toBe('walnut');
  p = await point(page, [440, 40, 100]);
  await page.mouse.click(p.x, p.y);
  project = await save(page);
  expect(project.bodies[1].appearance!.preset).toBe('concrete-raw');
  expect(project.bodies[1].color).toBe(findPreset('concrete-raw').color);
  expect(project.bodies[0].appearance!.preset).toBe('pbr-coated_pine');
  p = await point(page, [840, 40, 100]);
  await page.mouse.click(p.x, p.y);
  await expect(page.locator('.render-panel')).toContainText('Osa on Hold-lukittu');
  expect((await save(page)).bodies[2]).toEqual(held);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Valitse pinta', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(errors).toEqual([]);
});
