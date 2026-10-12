import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { freshProject, parseProject } from '../src/model/project';
import { bodyVisible } from '../src/model/transforms';
import { ready, view, save } from './helpers';

const modelPath = process.env.NIVO_AUDIT_MODEL;
test('private sauna model restores every stock size and its rounded bucket accepts a tangent circle', async ({
  page,
}, info) => {
  test.skip(!modelPath, 'The private model is never committed or fetched from the public site.');
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const project = parseProject(await readFile(modelPath!, 'utf8'));
  await ready(page);
  await page.getByTestId('project-file').setInputFiles(modelPath!);
  await expect(page.getByTestId('viewport')).toHaveAttribute(
    'data-mesh-count',
    String(project.bodies.filter((b) => bodyVisible(b, project.groups)).length),
    { timeout: 60000 },
  );
  await page.getByRole('button', { name: 'Osat', exact: true }).click();
  await page.getByRole('button', { name: 'Määrät', exact: true }).click();
  await expect(page.locator('.quantity-warning')).toHaveCount(0);
  const measured = await save(page);
  expect(
    measured.bodies.every((b) =>
      b.quantityBasis?.dimensions.every((n, i, d) => !i || n <= d[i - 1]),
    ),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath('private-quantities.png') });
  const bucket = { ...project.bodies.at(-4)!, groupId: undefined, locked: false, hidden: false };
  expect(bucket.feature.width).toBeCloseTo(200);
  await page.getByRole('button', { name: 'Malli', exact: true }).click();
  await page.getByTestId('project-file').setInputFiles({
    name: 'isolated-local-bucket.nivo',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...freshProject(), bodies: [bucket] })),
  });
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
  const at = await view(page, [bucket], 'front');
  await page.keyboard.press('c');
  const center = [
    bucket.origin[0] + 130,
    bucket.origin[1] + 100 - Math.sqrt(9100),
    bucket.origin[2] + 100,
  ];
  const p = at(...(center as [number, number, number]));
  await page.mouse.move(p.x, p.y);
  await expect(page.getByTestId('snap-hint')).toContainText('tangenttitaso');
  await page.mouse.click(p.x, p.y);
  await page.mouse.move(p.x, p.y - 30);
  await page.getByTestId('diameter-input').fill('24');
  await page.getByTestId('diameter-input').press('Enter');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '2');
  const circle = (await save(page)).bodies.at(-1)!;
  expect(circle.feature.type).toBe('profile-extrusion');
  if (circle.feature.type !== 'profile-extrusion') throw new Error('Missing circle');
  const frame = circle.feature.frame;
  circle.origin.forEach((n, i) => expect(n + frame.origin[i]).toBeCloseTo(center[i], 4));
  await page.screenshot({ path: info.outputPath('private-bucket-circle.png') });
  expect(errors).toEqual([]);
});
