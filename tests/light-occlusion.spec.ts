import { test, expect } from '@playwright/test';
import * as THREE from 'three';
import { ready } from './helpers';
import { freshProject, makeBody } from '../src/model/project';
import { defaultAppearance } from '../src/model/materials';

test('a solid panel blocks preview LED light before and through glass', async ({ page }, info) => {
  test.setTimeout(180000);
  const floor = {
    ...makeBody(800, 600, 20, [-400, -300, -20], 'Vastaanottava pinta'),
    color: '#ffffff',
  };
  const lamp = {
    ...makeBody(400, 20, 10, [-200, -10, 180], 'LED'),
    appearance: defaultAppearance('led-warm'),
  };
  const blocker = makeBody(500, 180, 18, [-250, -90, 100], 'Peittävä paneeli');
  const glass = {
    ...makeBody(800, 10, 400, [-400, -200, 0], 'Lasi'),
    appearance: defaultAppearance('glass-clear'),
    color: '#ffffff',
  };
  const base = freshProject();
  const load = async (blocked: boolean, glazed: boolean) => {
    await page.getByTestId('project-file').setInputFiles({
      name: 'led.nivo',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({
          ...base,
          bodies: [floor, lamp, ...(blocked ? [blocker] : []), ...(glazed ? [glass] : [])],
          settings: {
            ...base.settings,
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
      String(2 + Number(blocked) + Number(glazed)),
    );
    await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
    await expect(page.getByTestId('render-canvas')).toHaveAttribute(
      'data-body-count',
      String(2 + Number(blocked) + Number(glazed)),
    );
  };
  const sample = async () => {
    const canvas = page.getByTestId('render-canvas');
    const data = JSON.parse((await canvas.getAttribute('data-camera'))!);
    const camera = new THREE.PerspectiveCamera();
    camera.position.fromArray(data.position);
    camera.quaternion.fromArray(data.quaternion);
    camera.projectionMatrix.fromArray(data.projection);
    camera.updateMatrixWorld();
    const p = new THREE.Vector3(0, -120, 0).project(camera);
    return canvas.evaluate(
      (element, point) => {
        const c = element as HTMLCanvasElement,
          gl = c.getContext('webgl2')!;
        const pixels = new Uint8Array(4 * 25);
        gl.readPixels(
          Math.round(((point.x + 1) * c.width) / 2) - 2,
          Math.round(((point.y + 1) * c.height) / 2) - 2,
          5,
          5,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          pixels,
        );
        let value = 0;
        for (let i = 0; i < pixels.length; i += 4)
          value += (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
        return value / 25;
      },
      { x: p.x, y: p.y },
    );
  };
  await ready(page);
  for (const glazed of [false, true]) {
    await load(false, glazed);
    const exposed = await sample();
    await load(true, glazed);
    const shaded = await sample();
    await info.attach(`occlusion-${glazed}.json`, {
      body: JSON.stringify({ exposed, shaded }),
      contentType: 'application/json',
    });
    await page.screenshot({ path: info.outputPath(`panel-${glazed ? 'glass' : 'opaque'}.png`) });
    expect(exposed).toBeGreaterThan(20);
    expect(shaded).toBeLessThan(exposed * 0.2 + 2);
  }
});
