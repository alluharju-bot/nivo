import { test, expect } from '@playwright/test';
import { ready, save } from './helpers';
import { makeBody } from '../src/model/project';

test('named render views restore pose and lens without rebuilding the scene, and persist across reopen', async ({
  page,
}) => {
  await ready(page, [makeBody(600, 400, 300)]);
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  await page.getByRole('button', { name: 'Kuva', exact: true }).click();
  const canvas = page.getByTestId('render-canvas');
  const camera = async () => JSON.parse((await canvas.getAttribute('data-camera'))!);
  await page.getByText('Kuvakulmat', { exact: true }).click();
  await page.getByRole('button', { name: '50 mm', exact: true }).click();
  await expect.poll(async () => (await camera()).focalLength).toBeCloseTo(50);
  const before = await camera(),
    builds = await canvas.getAttribute('data-scene-builds');
  await page.getByRole('button', { name: 'Tallenna kuvakulma', exact: true }).click();
  await page.getByRole('button', { name: 'Nimeä: Kuvakulma 1', exact: true }).click();
  await page.getByRole('textbox', { name: 'Kuvakulman nimi', exact: true }).fill('Sauna · ovelta');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: '24 mm', exact: true }).click();
  const r = (await canvas.boundingBox())!;
  await page.mouse.move(r.x + r.width * 0.6, r.y + r.height * 0.5);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(r.x + r.width * 0.75, r.y + r.height * 0.6, { steps: 10 });
  await page.mouse.up({ button: 'right' });
  await expect
    .poll(async () => JSON.stringify((await camera()).position))
    .not.toBe(JSON.stringify(before.position));
  await page.getByRole('button', { name: 'Katso: Sauna · ovelta', exact: true }).click();
  await expect.poll(async () => (await camera()).focalLength).toBeCloseTo(50);
  const restored = await camera();
  before.position.forEach((n: number, i: number) => expect(restored.position[i]).toBeCloseTo(n, 6));
  before.target.forEach((n: number, i: number) => expect(restored.target[i]).toBeCloseTo(n, 6));
  await expect(canvas).toHaveAttribute('data-scene-builds', builds!);
  await page.getByRole('button', { name: 'Takaisin malliin', exact: true }).click();
  const project = await save(page);
  expect(project.renderViews).toHaveLength(1);
  expect(project.renderViews![0].name).toBe('Sauna · ovelta');
  await expect(page.locator('.save-status')).toContainText('Tallessa');
  await page.reload();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  await page.getByRole('button', { name: 'Kuva', exact: true }).click();
  await page.getByText('Kuvakulmat · 1', { exact: true }).click();
  await page.getByRole('button', { name: 'Katso: Sauna · ovelta', exact: true }).click();
  await expect.poll(async () => (await camera()).focalLength).toBeCloseTo(50);
  await page.getByRole('button', { name: 'Poista kuvakulma: Sauna · ovelta', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Katso: Sauna · ovelta', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Takaisin malliin', exact: true }).click();
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).renderViews).toEqual(project.renderViews);
});
