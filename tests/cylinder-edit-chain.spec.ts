import { test, expect } from '@playwright/test';
import { makeProfileBody } from '../src/model/project';
import { sketchFrame } from '../src/model/sketch';
import { ready, save } from './helpers';
import { open, panel, bar, projected } from './precision-helpers';

test('a cylinder rim is pickable in perspective and its enlarged cap stays push/pull editable', async ({
  page,
}, info) => {
  const body = makeProfileBody({ kind: 'circle', radius: 100 }, sketchFrame([0, 0, 0]), 120);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await ready(page, [body]);
  await page.getByRole('button', { name: 'Yleisnäkymä', exact: true }).click();
  await open(page, body, 'Reunat');
  await panel(page).getByRole('button', { name: 'Muokkaa verkkokopiota', exact: true }).click();
  const project = await projected(page),
    rim = project(100 / Math.sqrt(2), -100 / Math.sqrt(2), 120);
  await page.mouse.move(rim.x, rim.y);
  await page.mouse.click(rim.x, rim.y);
  await expect
    .poll(async () => Number((await panel(page).getByRole('status').innerText()).match(/\d+/)?.[0]))
    .toBeGreaterThan(12);
  await page.screenshot({ path: info.outputPath('cylinder-rim.png') });
  await bar(page).getByRole('button', { name: 'Pinnat', exact: true }).click();
  const center = project(0, 0, 120);
  await page.mouse.click(center.x, center.y);
  await expect(panel(page).getByRole('status')).not.toContainText('0 pistettä');
  await page.keyboard.press('l');
  const scale = panel(page).getByRole('textbox', { name: 'Geometrian skaala Skaala', exact: true });
  await scale.fill('150');
  await scale.press('Enter');
  await expect(scale).toHaveValue('100');
  const scaled = await save(page),
    mesh = scaled.bodies.find((b) => !b.hidden)!;
  expect(mesh.feature.width).toBeCloseTo(300, 0);
  await page.getByTestId('viewport').focus();
  await page.keyboard.press('e');
  const p = (await projected(page))(0, 0, 120);
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y);
  await page.keyboard.type('30');
  await page.keyboard.press('Enter');
  await expect
    .poll(async () => (await save(page)).bodies.find((b) => b.id === mesh.id)!.feature.height)
    .toBeCloseTo(150, 3);
  await page.screenshot({ path: info.outputPath('scaled-and-pulled.png') });
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual(scaled.bodies);
  expect(errors).toEqual([]);
});
