import { test, expect, type Page } from '@playwright/test';
import { freshProject, makeBody } from '../src/model/project';
import { defaultAppearance } from '../src/model/materials';
import { ready, save } from './helpers';
import * as THREE from 'three';
import { decode } from 'fast-png';

async function colorImage(page: Page, normal = false) {
  return page.evaluate((normal) => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 64;
    const ctx = c.getContext('2d')!;
    for (let x = 0; x < 256; x++) {
      ctx.fillStyle = normal
        ? `rgb(${128 + Math.round(60 * Math.sin(x / 8))},160,240)`
        : `rgb(${120 + Math.round(80 * Math.sin(x / 8))},95,45)`;
      ctx.fillRect(x, 0, 1, 64);
    }
    return c.toDataURL();
  }, normal);
}

test('a rectangular color image generates adjustable relief, accepts DirectX normals and survives undo and reload', async ({
  page,
}, info) => {
  test.setTimeout(180000);
  const body = makeBody(600, 300, 50);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await ready(page, [body]);
  await page.getByTestId(`body-${body.id}`).click();
  await page.locator('.model-materials > summary').click();
  const url = await colorImage(page);
  await page.getByTestId('model-texture-file').setInputFiles({
    name: 'grain.png',
    mimeType: 'image/png',
    buffer: Buffer.from(url.split(',')[1], 'base64'),
  });
  await page.getByText('Pinnan rakenne · PBR', { exact: true }).click();
  await page.getByLabel('Luo rakenne värikuvasta', { exact: true }).check();
  const depth = page.getByLabel('Kohokuvion syvyys', { exact: true });
  await depth.fill('0.35');
  await depth.press('Enter');
  let project = await save(page);
  expect(project.bodies[0].appearance).toMatchObject({
    generatedSurface: true,
    bumpDepth: 0.35,
    normalStrength: 1,
  });
  expect(project.bodies[0].appearance!.texture).toMatchObject({ width: 300, height: 75 });
  expect(project.assets![project.bodies[0].appearance!.assetId!]).toMatchObject({
    width: 256,
    height: 64,
  });
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  await expect(depth).toHaveValue('0.2');
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  await expect(depth).toHaveValue('0.35');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Normal-kartta', exact: true }).click();
  const normal = await colorImage(page, true);
  await (
    await chooser
  ).setFiles({
    name: 'normal-dx.png',
    mimeType: 'image/png',
    buffer: Buffer.from(normal.split(',')[1], 'base64'),
  });
  await page.getByLabel('Normal-kartan suunta', { exact: true }).selectOption('directx');
  await expect(depth).toHaveCount(0);
  project = await save(page);
  expect(project.bodies[0].appearance!.normalFormat).toBe('directx');
  expect(Object.keys(project.assets!)).toHaveLength(2);
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Renderöinnin asetukset' });
  await panel.getByText('Pinnan rakenne · PBR', { exact: true }).click();
  await expect(panel.getByLabel('Normal-kartan suunta')).toHaveValue('directx');
  await page.screenshot({ path: info.outputPath('pbr-material.png') });
  const canvas = page.getByTestId('render-canvas');
  const pixels = () => canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL());
  const directX = await pixels();
  await panel.getByLabel('Normal-kartan suunta').selectOption('opengl');
  await expect.poll(pixels).not.toBe(directX);
  await panel.getByLabel('Normal-kartan suunta').selectOption('directx');
  await panel.getByRole('button', { name: 'Kuva', exact: true }).click();
  await panel.getByRole('button', { name: 'Tarkentuva', exact: true }).click();
  await panel.getByLabel('Tarkennuksen tavoite', { exact: true }).selectOption('8');
  await expect(page.getByTestId('trace-status')).toContainText('Tavoite saavutettu', {
    timeout: 120000,
  });
  await page.screenshot({ path: info.outputPath('directx-normal-trace.png') });
  await panel.getByRole('button', { name: 'Materiaali', exact: true }).click();
  await panel.getByRole('button', { name: 'Poista Normal-kartta', exact: true }).click();
  await expect(panel.getByLabel('Kohokuvion syvyys')).toHaveValue('0.35');
  await page.screenshot({ path: info.outputPath('generated-relief.png') });
  await panel.getByRole('button', { name: 'Kuva', exact: true }).click();
  await panel.getByRole('button', { name: 'Tarkentuva', exact: true }).click();
  await panel.getByLabel('Tarkennuksen tavoite', { exact: true }).selectOption('8');
  await expect(page.getByTestId('trace-status')).toContainText('Tavoite saavutettu', {
    timeout: 120000,
  });
  await page.screenshot({ path: info.outputPath('generated-relief-trace.png') });
  const generated = decode(Buffer.from((await pixels()).split(',')[1], 'base64'));
  let warm = 0;
  for (let i = 0; i < generated.data.length; i += generated.channels) {
    const [r, g, b] = [generated.data[i], generated.data[i + 1], generated.data[i + 2]];
    if (r > g * 1.1 && g > b * 1.1 && r > 70) warm++;
  }
  expect(warm).toBeGreaterThan(500);
  await expect(page.locator('.save-status')).toContainText('Tallessa');
  await page.reload();
  expect((await save(page)).bodies[0].appearance).toMatchObject({
    generatedSurface: true,
    bumpDepth: 0.35,
  });
  expect((await save(page)).bodies[0].feature).toEqual(body.feature);
  expect(errors).toEqual([]);
});

test('LED presets light nearby geometry in preview and spot settings are editable in Model', async ({
  page,
}, info) => {
  test.setTimeout(180000);
  const floor = { ...makeBody(800, 600, 20, [-400, -300, -20], 'Taso'), color: '#ffffff' };
  const lamp = {
    ...makeBody(400, 100, 10, [-200, -50, 180], 'LED'),
    appearance: defaultAppearance('matte'),
  };
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await ready(page);
  await page.getByTestId('project-file').setInputFiles({
    name: 'light.nivo',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        ...freshProject(),
        bodies: [floor, lamp],
        settings: {
          ...freshProject().settings,
          render: {
            environment: 'dark',
            exposure: 1,
            shadows: true,
            lightPower: 0,
            environmentPower: 0,
            ground: false,
          },
        },
      }),
    ),
  });
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '2');
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  const canvas = page.getByTestId('render-canvas');
  // Read a point on the receiver, away from the visible emissive part.
  const sample = async () => {
    const data = JSON.parse((await canvas.getAttribute('data-camera'))!);
    const camera = new THREE.PerspectiveCamera();
    camera.position.fromArray(data.position);
    camera.quaternion.fromArray(data.quaternion);
    camera.projectionMatrix.fromArray(data.projection);
    camera.updateMatrixWorld();
    const p = new THREE.Vector3(0, -150, 0).project(camera);
    return canvas.evaluate(
      (element, point) => {
        const c = element as HTMLCanvasElement,
          gl = c.getContext('webgl2')!;
        const x = Math.round(((point.x + 1) / 2) * c.width),
          y = Math.round(((point.y + 1) / 2) * c.height);
        const pixels = new Uint8Array(4 * 25);
        gl.readPixels(x - 2, y - 2, 5, 5, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        let brightness = 0;
        for (let i = 0; i < pixels.length; i += 4)
          brightness += (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
        return brightness / 25;
      },
      { x: p.x, y: p.y },
    );
  };
  const unlit = await sample();
  await page.getByLabel('Materiaalin kohde').selectOption(lamp.id);
  await page.getByText('Osa valonlähteenä', { exact: true }).click();
  await page.getByLabel('Valaisimen esiasetus').selectOption('led-warm');
  await expect(canvas).toHaveAttribute('data-preview-surface-lights', '1');
  const lit = await sample();
  expect(lit).toBeGreaterThan(unlit + 20);
  await info.attach('receiver-pixels.json', {
    body: JSON.stringify({ unlit, lit }),
    contentType: 'application/json',
  });
  await page.screenshot({ path: info.outputPath('led-preview.png') });
  await page.getByRole('button', { name: 'Kuva', exact: true }).click();
  await page.getByRole('button', { name: 'Tarkentuva', exact: true }).click();
  await page.getByLabel('Tarkennuksen tavoite', { exact: true }).selectOption('8');
  await expect(page.getByTestId('trace-status')).toContainText('Tavoite saavutettu', {
    timeout: 120000,
  });
  await page.screenshot({ path: info.outputPath('led-trace.png') });
  await page.getByRole('button', { name: 'Takaisin malliin', exact: true }).click();
  await page.getByTestId(`body-${lamp.id}`).click();
  await page.locator('.model-materials > summary').click();
  await page.getByLabel('Valaisimen esiasetus').selectOption('spot-neutral');
  await page.getByLabel('Spotin suunta').selectOption('-y');
  await page.getByLabel('Spotin kulma').fill('52');
  await page.getByLabel('Spotin kulma').press('Enter');
  expect(
    (await save(page)).bodies.find((b) => b.id === lamp.id)!.appearance!.emission,
  ).toMatchObject({ type: 'spot', direction: '-y', angle: 52, intensity: 12 });
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-preview-surface-lights', '0');
  await expect(canvas).toHaveAttribute('data-spot-lights', '1');
  expect(errors).toEqual([]);
});
