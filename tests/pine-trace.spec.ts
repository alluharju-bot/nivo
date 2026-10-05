import { test, expect } from '@playwright/test';
import { decode } from 'fast-png';
import { cabinetProject, makeBody } from '../src/model/project';
import { defaultAppearance, findPreset } from '../src/model/materials';
import { ready } from './helpers';

test('applying pine while tracing and then orbiting never leaves a black stationary image', async ({
  page,
}, info) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  await ready(page, cabinetProject().bodies);
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Renderöinnin asetukset' });
  const canvas = page.getByTestId('render-canvas');
  await panel.getByRole('button', { name: 'Kuva', exact: true }).click();
  await page.getByRole('button', { name: 'Tarkentuva', exact: true }).click();
  await page.getByLabel('Tarkennuksen tavoite', { exact: true }).selectOption('8');
  await expect(page.getByTestId('trace-status')).toContainText('Tavoite saavutettu', {
    timeout: 120000,
  });
  await panel.getByRole('button', { name: 'Materiaali', exact: true }).click();
  for (const preset of ['pine', 'walnut', 'pine']) {
    await panel.getByRole('combobox', { name: 'Materiaali', exact: true }).selectOption(preset);
    await expect(page.getByTestId('trace-status')).toContainText('Tavoite saavutettu', {
      timeout: 120000,
    });
    const url = await canvas.evaluate((c) => (c as HTMLCanvasElement).toDataURL());
    const image = decode(Buffer.from(url.split(',')[1], 'base64'));
    let bright = 0,
      warm = 0;
    for (let i = 0; i < image.data.length; i += image.channels) {
      const [r, g, b] = [image.data[i], image.data[i + 1], image.data[i + 2]];
      if (r + g + b > 150) bright++;
      if (r > g * 1.06 && g > b * 1.08 && r > 60) warm++;
    }
    await page.screenshot({ path: info.outputPath(`${preset}-trace.png`) });
    expect(bright).toBeGreaterThan(image.width * image.height * 0.2);
    expect(warm).toBeGreaterThan(1000);
  }
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.54, { steps: 5 });
  await page.mouse.up({ button: 'right' });
  await expect(page.getByTestId('trace-status')).toContainText('Tavoite saavutettu', {
    timeout: 120000,
  });
  expect(errors).toEqual([]);
});

test('296 pine parts finish a stationary traced image with a three-layer atlas', async ({
  page,
}, info) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  const bodies = Array.from({ length: 296 }, (_, i) => ({
    ...makeBody(90, 70, 60, [(i % 20) * 105, Math.floor(i / 20) * 85, 0], `Mänty ${i + 1}`),
    color: findPreset('pine').color,
    appearance: defaultAppearance('pine'),
  }));
  await ready(page, bodies);
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  await page.getByRole('button', { name: 'Kuva', exact: true }).click();
  await page.getByRole('button', { name: 'Tarkentuva', exact: true }).click();
  await page.getByLabel('Tarkennuksen tavoite', { exact: true }).selectOption('8');
  const canvas = page.getByTestId('render-canvas');
  await expect(canvas).toHaveAttribute('data-trace-texture-layers', '3', { timeout: 120000 });
  await expect(canvas).toHaveAttribute('data-trace-texture-bytes', String(3 * 1024 * 1024));
  await expect(page.getByTestId('trace-status')).toContainText('Tavoite saavutettu', {
    timeout: 120000,
  });
  const png = decode(
    Buffer.from(
      (await canvas.evaluate((c) => (c as HTMLCanvasElement).toDataURL())).split(',')[1],
      'base64',
    ),
  );
  let warm = 0;
  for (let i = 0; i < png.data.length; i += png.channels)
    if (
      png.data[i] > png.data[i + 1] * 1.06 &&
      png.data[i + 1] > png.data[i + 2] * 1.08 &&
      png.data[i] > 60
    )
      warm++;
  expect(warm).toBeGreaterThan(3000);
  await page.screenshot({ path: info.outputPath('296-pine-trace.png') });
  expect(errors).toEqual([]);
});

test('unsupported material atlas returns to a visible preview with an explanation', async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.addInitScript(() => {
    const original = WebGL2RenderingContext.prototype.getParameter;
    WebGL2RenderingContext.prototype.getParameter = function (name: number) {
      return name === this.MAX_ARRAY_TEXTURE_LAYERS ? 2 : original.call(this, name);
    };
  });
  await ready(page, [
    {
      ...makeBody(200, 200, 200),
      color: findPreset('pine').color,
      appearance: defaultAppearance('pine'),
    },
  ]);
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  await page.getByRole('button', { name: 'Kuva', exact: true }).click();
  await page.getByRole('button', { name: 'Tarkentuva', exact: true }).click();
  await expect(page.getByTestId('trace-status')).toContainText('3 eri materiaalikuvaa', {
    timeout: 60000,
  });
  const image = decode(
    Buffer.from(
      (
        await page
          .getByTestId('render-canvas')
          .evaluate((c) => (c as HTMLCanvasElement).toDataURL())
      ).split(',')[1],
      'base64',
    ),
  );
  let bright = 0;
  for (let i = 0; i < image.data.length; i += image.channels)
    if (image.data[i] + image.data[i + 1] + image.data[i + 2] > 150) bright++;
  expect(bright).toBeGreaterThan(image.width * image.height * 0.2);
});
