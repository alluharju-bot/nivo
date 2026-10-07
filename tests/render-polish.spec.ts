import { test, expect } from '@playwright/test';
import { decode } from 'fast-png';
import { ready, save } from './helpers';
import { makeBody } from '../src/model/project';
import { defaultAppearance } from '../src/model/materials';
import { pbrSurfaces } from '../src/model/pbrCatalog';

function imageStats(png: Buffer, ratio = 1.04) {
  const image = decode(png);
  let warm = 0,
    x = 0,
    y = 0;
  for (let i = 0; i < image.data.length; i += image.channels) {
    const [r, g, b] = [image.data[i], image.data[i + 1], image.data[i + 2]];
    if (r > 65 && r > g * ratio && g > b * ratio) {
      warm++;
      x += (i / image.channels) % image.width;
      y += Math.floor(i / image.channels / image.width);
    }
  }
  return { warm, x: x / warm, y: y / warm };
}

test('PBR changes retain geometry, exposure retains samples and prepared rendering starts at rest', async ({
  page,
}, info) => {
  test.setTimeout(240000);
  page.setDefaultTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await ready(page, [
    {
      ...makeBody(600, 500, 30),
      appearance: defaultAppearance('pbr-coated_pine'),
      color: '#ffffff',
    },
  ]);
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  const canvas = page.getByTestId('render-canvas');
  await expect(canvas).toHaveAttribute('data-environment', 'studio-hdri');
  const native = await canvas.evaluate(
    (c) =>
      !!(c as HTMLCanvasElement).getContext('webgl2')?.getExtension('KHR_parallel_shader_compile'),
  );
  if (native)
    await expect(canvas).toHaveAttribute('data-trace-prepared', 'true', { timeout: 30000 });
  await page.getByRole('button', { name: 'Kuva', exact: true }).click();
  const started = Date.now();
  await page.getByRole('button', { name: 'Tarkentuva', exact: true }).click();
  await page.getByLabel('Tarkennuksen tavoite', { exact: true }).selectOption('8');
  const status = page.getByTestId('trace-status');
  await expect(status).toContainText('Tavoite saavutettu', { timeout: native ? 20000 : 120000 });
  const startMs = Date.now() - started;
  const builds = await canvas.getAttribute('data-scene-builds');
  const traceBuilds = await canvas.getAttribute('data-trace-scene-builds');
  const image = await canvas.screenshot();
  expect(imageStats(image).warm).toBeGreaterThan(4000);
  await page.getByLabel('Kohinan pehmennys', { exact: true }).uncheck();
  await expect(canvas).toHaveAttribute('data-trace-samples', '8');
  const raw = await canvas.screenshot();
  expect(raw.equals(image)).toBe(false);
  await page.getByLabel('Kohinan pehmennys', { exact: true }).check();
  // Moving the camera while refinement is off must update the prepared tracer,
  // not jump back to its previous camera when the first new sample appears.
  await page.getByRole('button', { name: 'Nopea', exact: true }).click();
  const rect = (await canvas.boundingBox())!;
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(rect.x + rect.width / 2 + 120, rect.y + rect.height / 2, { steps: 6 });
  await page.mouse.up({ button: 'middle' });
  const moved = imageStats(await canvas.screenshot(), 1.15);
  await page.getByRole('button', { name: 'Tarkentuva', exact: true }).click();
  await expect(status).toContainText('Tavoite saavutettu', { timeout: native ? 20000 : 120000 });
  const refined = imageStats(await canvas.screenshot(), 1.15);
  expect(Math.abs(refined.x - moved.x)).toBeLessThan(25);
  expect(Math.abs(refined.y - moved.y)).toBeLessThan(25);
  await page.getByRole('button', { name: 'Materiaali', exact: true }).click();
  const uploads = Number(await canvas.getAttribute('data-trace-material-uploads'));
  const materialStarted = Date.now();
  await page
    .getByRole('combobox', { name: 'Materiaali', exact: true })
    .selectOption('pbr-american_walnut_veneer');
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-trace-material-uploads')))
    .toBeGreaterThan(uploads);
  await expect(status).toContainText('Tavoite saavutettu', { timeout: native ? 20000 : 120000 });
  const materialMs = Date.now() - materialStarted;
  await expect(canvas).toHaveAttribute('data-scene-builds', builds!);
  await expect(canvas).toHaveAttribute('data-trace-scene-builds', traceBuilds!);
  expect(imageStats(await canvas.screenshot()).warm).toBeGreaterThan(4000);
  await expect(page.getByText('Pintakartan mukaan', { exact: true })).toBeVisible();
  await page.getByLabel('Pintakäsittely', { exact: true }).selectOption('matte');
  await expect(status).toContainText('Tavoite saavutettu', { timeout: native ? 20000 : 120000 });
  const matte = (await save(page)).bodies[0].appearance!;
  expect(matte.roughness).toBe(1);
  expect(matte.clearcoat).toBe(0);
  await page.getByLabel('Pintakäsittely', { exact: true }).selectOption('native');
  await expect(status).toContainText('Tavoite saavutettu', { timeout: native ? 20000 : 120000 });
  await page.getByText('Studion valaistus', { exact: true }).click();
  const exposure = page.getByLabel('Valotus', { exact: true });
  const before = await canvas.screenshot();
  await exposure.focus();
  await exposure.press('ArrowRight');
  await expect(canvas).toHaveAttribute('data-trace-samples', '8');
  expect((await canvas.screenshot()).equals(before)).toBe(false);
  await expect(canvas).toHaveAttribute('data-trace-scene-builds', traceBuilds!);
  const project = await save(page);
  expect(project.bodies[0].appearance?.preset).toBe('pbr-american_walnut_veneer');
  expect(Object.keys(project.assets ?? {})).toHaveLength(0);
  await canvas.screenshot({ path: info.outputPath('walnut-pbr.png') });
  console.log(JSON.stringify({ native, startMs, materialMs, builds, traceBuilds }));
  expect(errors).toEqual([]);
});

test('all real surfaces load locally with normal or height relief and export their saved settings', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => {
    if (r.url().includes('/materials/') && r.status() >= 400)
      errors.push(`${r.status()} ${r.url()}`);
  });
  const bodies = pbrSurfaces.map((surface, i) => ({
    ...makeBody(600, 600, 35, [(i % 3) * 700, Math.floor(i / 3) * 700, 0], surface.name),
    color: '#ffffff',
    appearance: {
      ...defaultAppearance(`pbr-${surface.source}`),
      ...(i % 2 ? { surfaceSource: 'height' as const, bumpDepth: surface.relief } : {}),
    },
  }));
  await ready(page, bodies);
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  const canvas = page.getByTestId('render-canvas');
  await expect(canvas).toHaveAttribute('data-environment', 'studio-hdri');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Kuva', exact: true }).click();
  await page.getByLabel('Kuvan leveys', { exact: true }).selectOption('800');
  await page.getByRole('button', { name: /Tallenna PNG/ }).click();
  await (await download).saveAs(info.outputPath('pbr-surfaces.png'));
  expect((await save(page)).bodies.map((b) => b.appearance)).toEqual(
    bodies.map((b) => b.appearance),
  );
  expect(errors).toEqual([]);
});
