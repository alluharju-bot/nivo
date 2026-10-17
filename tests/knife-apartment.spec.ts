import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parseProject } from '../src/model/project';
import { ready, save, view } from './helpers';
test('private apartment supports a freehand demolition stroke without losing its sheet', async ({
  page,
}, info) => {
  test.skip(!process.env.NIVO_APARTMENT_MODEL, 'Private project stays outside the repository');
  test.setTimeout(120000);
  const p = parseProject(readFileSync(process.env.NIVO_APARTMENT_MODEL!, 'utf8'));
  await ready(page, p.bodies);
  const target = p.bodies.find((b) => b.name === 'Kerrostalo')!;
  await page.getByTestId(`body-${target.id}`).click();
  const project = await view(page, p.bodies, 'front');
  await page.keyboard.press('n');
  await page.getByLabel('Veitsen reitti', { exact: true }).selectOption('free');
  const points = Array.from({ length: 21 }, (_, i) =>
    project(
      target.origin[0] - 1000 + ((target.feature.width + 2000) * i) / 20,
      0,
      9000 + Math.sin(i * 0.7) * 1800,
    ),
  );
  await page.mouse.move(points[0].x, points[0].y);
  await page.mouse.down();
  for (const point of points.slice(1)) await page.mouse.move(point.x, point.y, { steps: 2 });
  await page.mouse.up();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '11', {
    timeout: 90000,
  });
  const changed = await save(page);
  expect(changed.bodies.some((b) => b.name === 'Kerrostalo · pinnat')).toBe(true);
  await page.screenshot({ path: info.outputPath('apartment-freehand-cut.png') });
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '9');
  expect((await save(page)).bodies.map((b) => b.feature)).toEqual(p.bodies.map((b) => b.feature));
});
