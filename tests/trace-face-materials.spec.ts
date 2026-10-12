import { expect, test } from '@playwright/test';
import { Camera, Vector3 } from 'three';
import { makeBody } from '../src/model/project';
import { defaultAppearance } from '../src/model/materials';
import { ready } from './helpers';

test('tracing keeps neighboring part colors when another part has a painted LED face', async ({
  page,
}, info) => {
  test.setTimeout(150000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const bodies = ['#ffffff', '#ee1008', '#08dd10', '#1010ee'].map((color, i) => ({
    ...makeBody(160, 160, 20, [i * 220, 0, 0]),
    color,
    appearance: { ...defaultAppearance('paint-solid'), roughness: 1, clearcoat: 0 },
    ...(i === 0
      ? { faceMaterials: { 5: { color: '#fff2df', appearance: defaultAppearance('led-warm') } } }
      : {}),
  }));
  await ready(page, bodies);
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  await page.getByRole('button', { name: 'Kuva', exact: true }).click();
  await page.getByRole('button', { name: 'Tarkentuva', exact: true }).click();
  await page.getByLabel('Tarkennuksen tavoite', { exact: true }).selectOption('8');
  await expect(page.getByTestId('trace-status')).toContainText('Tavoite saavutettu', {
    timeout: 120000,
  });
  const canvas = page.getByTestId('render-canvas');
  const data = JSON.parse((await canvas.getAttribute('data-camera'))!);
  const camera = new Camera();
  camera.position.fromArray(data.position);
  camera.quaternion.fromArray(data.quaternion);
  camera.projectionMatrix.fromArray(data.projection);
  camera.updateMatrixWorld();
  for (let i = 1; i < 4; i++) {
    const point = new Vector3(i * 220 + 80, 80, 20).project(camera);
    const rgb = await canvas.evaluate(
      (el, p) => {
        const c = el as HTMLCanvasElement,
          gl = c.getContext('webgl2')!;
        const pixels = new Uint8Array(9 * 9 * 4);
        gl.readPixels(
          Math.round(((p.x + 1) * c.width) / 2) - 4,
          Math.round(((p.y + 1) * c.height) / 2) - 4,
          9,
          9,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          pixels,
        );
        return [0, 1, 2].map(
          (channel) => pixels.reduce((sum, n, j) => sum + (j % 4 === channel ? n : 0), 0) / 81,
        );
      },
      { x: point.x, y: point.y },
    );
    expect(rgb[i - 1]).toBeGreaterThan(60);
    for (const channel of [0, 1, 2].filter((c) => c !== i - 1))
      expect(rgb[i - 1]).toBeGreaterThan(rgb[channel] + 40);
  }
  await canvas.screenshot({ path: info.outputPath('painted-face-and-neighbor-colors.png') });
  expect(errors).toEqual([]);
});
