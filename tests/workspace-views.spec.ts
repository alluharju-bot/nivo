import { test, expect } from '@playwright/test';
import { ready, save, revealBrowser, view } from './helpers';
import { makeBody } from '../src/model/project';
import * as THREE from 'three';

async function screenPoint(page: any, point: number[]) {
  const canvas = page.getByTestId('viewport'),
    rect = await canvas.boundingBox();
  const data = JSON.parse(await canvas.getAttribute('data-camera'));
  const camera = new THREE.PerspectiveCamera();
  camera.position.fromArray(data.position);
  camera.quaternion.fromArray(data.quaternion);
  camera.projectionMatrix.fromArray(data.projection);
  camera.updateMatrixWorld();
  const p = new THREE.Vector3(...point).project(camera);
  return { x: rect.x + ((p.x + 1) * rect.width) / 2, y: rect.y + ((1 - p.y) * rect.height) / 2 };
}

test('saved sections keep geometry intact and export a dimensioned CAD section', async ({
  page,
}) => {
  const part = makeBody(600, 600, 1200);
  await ready(page, [part]);
  await page.getByRole('button', { name: 'Leikkaus', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Poikkileikkaus', exact: true });
  await panel.getByRole('button', { name: 'Uusi leikkaus', exact: true }).click();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-section-caps', '1');
  const initial = await save(page);
  expect(initial.bodies).toEqual([part]);
  expect(initial.sections).toHaveLength(1);
  await panel.getByLabel('Leikkauksen nimi').fill('A–A kaappi');
  await panel.getByLabel('Leikkauksen nimi').press('Enter');
  await panel.getByRole('button', { name: 'Z', exact: true }).click();
  const position = panel.getByLabel('Leikkaustason sijainti');
  await position.fill('400');
  await position.press('Enter');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-section-caps', '1');
  await panel.getByRole('button', { name: 'Avaa leikkaus mittakuvaan' }).click();
  const drawing = page.getByRole('region', { name: 'Leikkauskuvan työtila' });
  await expect(drawing.locator('[data-section-body]')).toHaveCount(1);
  await drawing.getByRole('button', { name: 'Mitoita kahdesta pisteestä' }).click();
  // The visible cut path and model transform give actual CAD points on the paper.
  const points = await drawing
    .locator('.drawing-paper svg')
    .first()
    .evaluate((svg) => {
      const group = svg.querySelector('g[transform]')!;
      const matrix = (group as SVGGraphicsElement).getScreenCTM()!;
      const box = (svg.querySelector('[data-section-body]') as SVGGraphicsElement).getBBox();
      return [
        [box.x, box.y + box.height],
        [box.x + box.width, box.y + box.height],
        [box.x + box.width, box.y + box.height + 120],
      ].map(([x, y]) => {
        const p = new DOMPoint(x, y).matrixTransform(matrix);
        return { x: p.x, y: p.y };
      });
    });
  await page.mouse.click(points[0].x, points[0].y);
  await page.mouse.click(points[1].x, points[1].y);
  await page.mouse.move(points[2].x, points[2].y);
  await page.mouse.click(points[2].x, points[2].y);
  await expect(drawing.locator('[data-section-dimension]')).toHaveAttribute('data-mm', '600');
  const svgDownload = page.waitForEvent('download');
  await drawing.getByRole('button', { name: 'Lataa SVG', exact: true }).click();
  expect((await svgDownload).suggestedFilename()).toMatch(/\.svg$/);
  const pdfDownload = page.waitForEvent('download');
  await drawing.getByRole('button', { name: 'Lataa PDF', exact: true }).click();
  expect((await pdfDownload).suggestedFilename()).toMatch(/\.pdf$/);
  const final = await save(page);
  expect(final.sections?.[0].dimensions).toHaveLength(1);
  expect(final.bodies).toEqual([part]);
  await page.reload();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-section-caps', '1');
  await page.getByRole('button', { name: 'Leikkaus', exact: true }).click();
  await expect(panel.getByLabel('Leikkauksen nimi')).toHaveValue('A–A kaappi');
  await panel.getByRole('button', { name: 'Näytä koko malli', exact: true }).click();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-section-caps', '0');
});

test('isolating selection preserves hidden state through editing and restoration', async ({
  page,
}) => {
  const a = makeBody(100, 100, 100),
    b = makeBody(100, 100, 100, [200, 0, 0]),
    c = { ...makeBody(100, 100, 100, [400, 0, 0]), hidden: true };
  await ready(page, [a, b, c]);
  await revealBrowser(page);
  await page.getByTestId(`body-${a.id}`).click();
  await page.getByRole('button', { name: 'Eristä valinta', exact: true }).click();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
  expect((await save(page)).bodies.map((b) => b.hidden)).toEqual([false, false, true]);
  await page.getByRole('button', { name: 'Palauta näkymä', exact: true }).click();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '2');
});

test('section arrow drag commits its exact axis and clipped objects cannot steal selection', async ({
  page,
}) => {
  const front = makeBody(600, 100, 600, [0, 0, 0], 'Etummainen'),
    back = makeBody(600, 100, 600, [0, 500, 0], 'Takimmainen');
  await ready(page, [front, back]);
  await page.getByRole('button', { name: 'Leikkaus', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Poikkileikkaus', exact: true });
  await panel.getByRole('button', { name: 'Uusi leikkaus', exact: true }).click();
  await expect(panel.getByLabel('Leikkaustason sijainti')).toHaveValue('300');
  const a = await screenPoint(page, [300, 140, 300]),
    b = await screenPoint(page, [300, 40, 300]);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await expect(panel.getByLabel('Leikkaustason sijainti')).toHaveValue('200');
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(panel.getByLabel('Leikkaustason sijainti')).toHaveValue('300');
  expect((await save(page)).sections![0].frame.origin).toEqual([300, 300, 300]);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
  await expect(panel.getByLabel('Leikkaustason sijainti')).toHaveValue('200');
  expect((await save(page)).sections![0].frame.origin).toEqual([300, 200, 300]);
  await panel.getByRole('button', { name: 'Sulje näkymän asetukset' }).click();
  const p = await view(page, [front, back], 'front');
  await page.mouse.click(p(300, 500, 300).x, p(300, 500, 300).y);
  await revealBrowser(page);
  await expect(page.getByTestId(`body-${back.id}`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId(`body-${front.id}`)).toHaveAttribute('aria-pressed', 'false');
  expect((await save(page)).bodies).toEqual([front, back]);
});

test('section plane can follow a picked face and reverse its kept side', async ({ page }) => {
  const part = makeBody(600, 600, 600);
  await ready(page, [part]);
  const p = await view(page, [part]);
  await page.getByRole('button', { name: 'Leikkaus', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Poikkileikkaus', exact: true });
  await panel.getByRole('button', { name: 'Uusi leikkaus', exact: true }).click();
  await panel.getByRole('button', { name: 'Pinnasta', exact: true }).click();
  await page.mouse.click(p(150, 450, 600).x, p(150, 450, 600).y);
  await expect(panel.getByLabel('Leikkaustason sijainti')).toHaveValue('600');
  expect((await save(page)).sections![0].frame.normal).toEqual([0, 0, 1]);
  await panel.getByRole('button', { name: 'Vaihda katselusuunta', exact: true }).click();
  expect((await save(page)).sections![0].flipped).toBe(true);
  expect((await save(page)).bodies).toEqual([part]);
});

test('floor image calibration saves a true scale and supports elevation placement', async ({
  page,
}) => {
  await ready(page);
  await page.getByRole('button', { name: 'Pohjakuva', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Pohjakuvat', exact: true });
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 300;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#dddddd';
    ctx.fillRect(0, 0, 400, 300);
    ctx.strokeStyle = '#222222';
    ctx.strokeRect(40, 30, 320, 240);
    return canvas.toDataURL().split(',')[1];
  });
  await panel.locator('input[type=file]').setInputFiles({
    name: 'Pohja.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  });
  await expect(panel).toContainText('tunnetun mitan alku');
  let project = await save(page);
  const image = project.referenceImages![0];
  const a = await screenPoint(page, [image.width * 0.3, image.height * 0.4, 0]);
  const b = await screenPoint(page, [image.width * 0.7, image.height * 0.4, 0]);
  await page.mouse.click(a.x, a.y);
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-calibration-points', '1');
  await page.mouse.click(b.x, b.y);
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-calibration-points', '2');
  await panel.getByLabel('Pohjakuvan tunnettu mitta').fill('2000');
  await panel.getByRole('button', { name: 'Aseta mittakaava', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Vapauta pohjakuva' })).toBeVisible();
  project = await save(page);
  expect(project.referenceImages![0].width).toBeCloseTo(5000, 1);
  expect(project.referenceImages![0].height).toBeCloseTo(3750, 1);
  expect(project.bodies).toHaveLength(0);
  await panel.getByRole('button', { name: 'Vapauta pohjakuva' }).click();
  await panel.getByLabel('Pohjakuvan taso').selectOption('y');
  await panel.getByLabel('Pohjakuvan Y', { exact: true }).fill('123');
  await panel.getByLabel('Pohjakuvan Y', { exact: true }).press('Enter');
  await panel.getByRole('button', { name: 'Katso kohtisuoraan', exact: true }).click();
  project = await save(page);
  expect(project.referenceImages![0].frame.normal).toEqual([0, -1, 0]);
  await panel.getByRole('button', { name: 'Sulje näkymän asetukset' }).click();
  const origin = project.referenceImages![0].frame.origin;
  const start = await screenPoint(page, [origin[0] + 1500, 123, origin[2] + 1500]);
  const end = await screenPoint(page, [origin[0] + 2500, 123, origin[2] + 1900]);
  await page.keyboard.press('s');
  await page.mouse.click(start.x, start.y);
  await page.mouse.move(end.x, end.y);
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-sketch-plane', '[0,-1,0]');
  await page.mouse.click(end.x, end.y);
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
  const drawn = (await save(page)).bodies[0];
  expect(drawn.origin[1]).toBe(123);
  expect(drawn.feature.width).toBe(1000);
  expect(drawn.feature.height).toBe(400);
  await page.reload();
  await page.getByRole('button', { name: 'Pohjakuva', exact: true }).click();
  await expect(panel.getByLabel('Pohjakuvan taso')).toHaveValue('y');
  await expect(panel).toContainText('Mittakaava asetettu');
});
