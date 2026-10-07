import { test, expect } from '@playwright/test';
import * as THREE from 'three';
import { ready } from './helpers';
import { freshProject, makeBody } from '../src/model/project';
import { defaultAppearance } from '../src/model/materials';

test('a sheltered LED illuminates the room by reflected light rather than leaking through its panel', async ({
  page,
}, info) => {
  test.setTimeout(300000);
  const white = (w: number, d: number, h: number, origin: [number, number, number]) => ({
    ...makeBody(w, d, h, origin),
    color: '#ffffff',
    appearance: { ...defaultAppearance('paint-solid'), roughness: 1, clearcoat: 0 },
  });
  const bodies = [
    white(800, 600, 20, [-400, -300, -20]),
    white(800, 20, 420, [-400, 280, 0]),
    white(800, 600, 20, [-400, -300, 400]),
    white(800, 530, 20, [-400, -300, 320]),
    white(800, 20, 80, [-400, -300, 340]),
    white(20, 600, 420, [-420, -300, 0]),
    white(20, 600, 420, [400, -300, 0]),
    {
      ...makeBody(600, 10, 5, [-300, 205, 360], 'LED katon välissä'),
      appearance: {
        ...defaultAppearance('led-warm'),
        emission: {
          enabled: true,
          type: 'surface' as const,
          color: '#ffffff',
          intensity: 50,
          angle: 45,
          direction: '-z' as const,
        },
      },
    },
  ];
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await ready(page);
  const load = async (sealed = false) => {
    await page.getByTestId('project-file').setInputFiles({
      name: 'epasuora.nivo',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({
          ...freshProject(),
          bodies: [...bodies, ...(sealed ? [white(800, 50, 20, [-400, 230, 320])] : [])],
          settings: {
            guideXray: false,
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
    await expect(page.getByTestId('viewport')).toHaveAttribute(
      'data-mesh-count',
      String(bodies.length + Number(sealed)),
    );
    await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  };
  await load();
  const canvas = page.getByTestId('render-canvas');
  const sample = async () => {
    const data = JSON.parse((await canvas.getAttribute('data-camera'))!);
    const camera = new THREE.PerspectiveCamera();
    camera.position.fromArray(data.position);
    camera.quaternion.fromArray(data.quaternion);
    camera.projectionMatrix.fromArray(data.projection);
    camera.updateMatrixWorld();
    const p = new THREE.Vector3(0, -200, 0).project(camera);
    return canvas.evaluate(
      (el, p) => {
        const c = el as HTMLCanvasElement,
          gl = c.getContext('webgl2')!;
        const pixels = new Uint8Array(21 * 21 * 4);
        gl.readPixels(
          Math.round(((p.x + 1) * c.width) / 2) - 10,
          Math.round(((p.y + 1) * c.height) / 2) - 10,
          21,
          21,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          pixels,
        );
        let sum = 0;
        for (let i = 0; i < pixels.length; i += 4)
          sum += (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
        return sum / (21 * 21);
      },
      { x: p.x, y: p.y },
    );
  };
  const direct = await sample();
  await page.getByRole('button', { name: 'Kuva', exact: true }).click();
  await page.getByRole('button', { name: 'Tarkentuva', exact: true }).click();
  await page.getByLabel('Tarkennuksen tavoite', { exact: true }).selectOption('64');
  await expect(page.getByTestId('trace-status')).toContainText('Tavoite saavutettu', {
    timeout: 150000,
  });
  const indirect = await sample();
  await page.screenshot({ path: info.outputPath('sheltered-led.png') });
  await page.getByRole('button', { name: 'Takaisin malliin', exact: true }).click();
  await load(true);
  await page.getByRole('button', { name: 'Kuva', exact: true }).click();
  await page.getByRole('button', { name: 'Tarkentuva', exact: true }).click();
  await page.getByLabel('Tarkennuksen tavoite', { exact: true }).selectOption('64');
  await expect(page.getByTestId('trace-status')).toContainText('Tavoite saavutettu', {
    timeout: 150000,
  });
  const sealed = await sample();
  await info.attach('receiver.json', {
    body: JSON.stringify({ direct, indirect, sealed }),
    contentType: 'application/json',
  });
  await page.screenshot({ path: info.outputPath('sealed-led.png') });
  expect(sealed).toBeLessThan(1);
  expect(direct).toBeLessThan(3);
  expect(indirect).toBeGreaterThan(direct + 8);
  expect(errors).toEqual([]);
});
