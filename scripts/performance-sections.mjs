// Exact-section drag benchmark on the generated mixed CAD cabinet fixture.
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { Matrix4, Quaternion, Vector3 } from 'three';
const url = process.argv[2] ?? 'http://127.0.0.1:4173/nivo/';
if (!process.env.NIVO_PERF_FIXTURE) throw new Error('Set NIVO_PERF_FIXTURE to a .nivo file.');
const project = JSON.parse(await readFile(process.env.NIVO_PERF_FIXTURE, 'utf8'));
const min = [0, 1, 2].map((i) => Math.min(...project.bodies.map((b) => b.origin[i])));
const max = ['width', 'depth', 'height'].map((k, i) =>
  Math.max(...project.bodies.map((b) => b.origin[i] + b.feature[k])),
);
const center = min.map((n, i) => (n + max[i]) / 2),
  extent = Math.max(...max.map((n, i) => n - min[i]));
const origin = [300, center[1], center[2]];
project.sections = [
  {
    id: 'benchmark-section',
    name: 'A–A',
    frame: { origin, normal: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] },
    flipped: false,
    dimensions: [],
  },
];
project.settings = { ...project.settings, activeSectionId: 'benchmark-section' };
const browser = await chromium.launch({
  args: process.env.NIVO_GPU === 'metal' ? ['--use-angle=metal', '--enable-gpu'] : [],
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 960 },
  deviceScaleFactor: 1,
});
page.setDefaultTimeout(60000);
try {
  await page.goto(url);
  await page.getByRole('button', { name: 'Piirrä suorakulmio', exact: true }).waitFor();
  const started = performance.now();
  await page.getByTestId('project-file').setInputFiles({
    name: 'section.nivo',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await page.waitForFunction(
    (n) => Number(document.querySelector('[data-mesh-count]')?.dataset.meshCount) === n,
    project.bodies.length,
  );
  await page.waitForFunction(
    () => Number(document.querySelector('[data-section-caps]')?.dataset.sectionCaps) > 0,
  );
  const loadWithCapsMs = Math.round(performance.now() - started);
  await page.getByRole('button', { name: 'Ylhäältä', exact: true }).click();
  await page.getByRole('button', { name: 'Leikkaus', exact: true }).click();
  const canvas = page.getByTestId('viewport'),
    rect = await canvas.boundingBox();
  const data = JSON.parse(await canvas.getAttribute('data-camera'));
  const matrix = new Matrix4()
    .fromArray(data.projection)
    .multiply(
      new Matrix4()
        .compose(
          new Vector3(...data.position),
          new Quaternion(...data.quaternion),
          new Vector3(1, 1, 1),
        )
        .invert(),
    );
  const screen = (p) => {
    const q = new Vector3(...p).applyMatrix4(matrix);
    return { x: rect.x + ((q.x + 1) * rect.width) / 2, y: rect.y + ((1 - q.y) * rect.height) / 2 };
  };
  const a = screen([origin[0] + extent * 0.25, origin[1], origin[2]]),
    b = screen([origin[0] + extent * 0.25 + 100, origin[1], origin[2]]);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  const frames = await page.evaluate(
    async ({ a, b }) => {
      const canvas = document.querySelector('[data-testid=viewport]'),
        samples = [];
      let last = performance.now();
      for (let i = 0; i < 120; i++) {
        await new Promise(requestAnimationFrame);
        const now = performance.now();
        if (i >= 20) samples.push(now - last);
        last = now;
        canvas.dispatchEvent(
          new PointerEvent('pointermove', {
            bubbles: true,
            pointerId: 1,
            pointerType: 'mouse',
            buttons: 1,
            clientX: a.x + (b.x - a.x) * (1 + Math.sin(i / 12)),
            clientY: a.y,
          }),
        );
      }
      samples.sort((a, b) => a - b);
      return { medianMs: +samples[50].toFixed(2), p95Ms: +samples[95].toFixed(2) };
    },
    { a, b },
  );
  await page.mouse.move(b.x, b.y);
  const released = performance.now();
  await page.mouse.up();
  const panel = page.getByRole('complementary', { name: 'Poikkileikkaus', exact: true });
  await page.waitForFunction(
    () => document.querySelector('[aria-label="Leikkaustason sijainti"]')?.value === '400',
  );
  await panel.getByText('Lasketaan leikkauspintoja…', { exact: true }).waitFor({ state: 'hidden' });
  await page.waitForFunction(
    () => Number(document.querySelector('[data-section-caps]')?.dataset.sectionCaps) > 0,
  );
  console.log(
    JSON.stringify(
      {
        parts: project.bodies.length,
        loadWithCapsMs,
        drag: frames,
        releaseToCapsMs: Math.round(performance.now() - released),
        caps: Number(await canvas.getAttribute('data-section-caps')),
        position: 400,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
