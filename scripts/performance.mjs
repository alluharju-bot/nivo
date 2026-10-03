// Run against a production build: node scripts/performance.mjs http://127.0.0.1:4173/nivo/
// The same 296 boxes, camera and pointer events are used for every version.
import { chromium } from '@playwright/test';
const url = process.argv[2] ?? 'http://127.0.0.1:4173/nivo/';
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 960 },
  deviceScaleFactor: 1,
});
await page.addInitScript(() => {
  window.drawCalls = 0;
  for (const method of [
    'drawElements',
    'drawArrays',
    'drawElementsInstanced',
    'drawArraysInstanced',
  ]) {
    const original = WebGL2RenderingContext.prototype[method];
    WebGL2RenderingContext.prototype[method] = function (...args) {
      window.drawCalls++;
      return original.apply(this, args);
    };
  }
});
try {
  await page.goto(url);
  await page.getByRole('button', { name: 'Piirrä suorakulmio', exact: true }).waitFor();
  const bodies = Array.from({ length: 296 }, (_, i) => ({
    id: `perf-${i}`,
    name: `Levy ${i + 1}`,
    kind: 'cad',
    feature: { type: 'rectangle-extrusion', width: 500, depth: 400, height: 18 },
    origin: [(i % 20) * 600, Math.floor(i / 20) * 500, (i % 4) * 100],
    color: '#c3a57e',
  }));
  const project = {
    format: 'nivo',
    version: 6,
    id: 'performance-296',
    name: '296 levyä',
    units: 'mm',
    bodies,
    groups: [],
    dimensions: [],
    guides: [],
    settings: {
      guideXray: false,
      axisStyle: 'subtle',
      axisLabels: false,
      dimensionDisplay: 'hidden',
    },
    updatedAt: new Date().toISOString(),
  };
  await page.getByTestId('project-file').setInputFiles({
    name: 'performance.nivo',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await page.locator('.object-list .object-select').last().waitFor();
  await page.getByRole('button', { name: 'Ylhäältä', exact: true }).click();
  // Retract the new browser so it has no effect on the measuring area.
  await page.locator('canvas[data-testid="viewport"]').click({ position: { x: 600, y: 200 } });
  await page.waitForTimeout(1000);
  const result = await page.evaluate(async () => {
    const canvas = document.querySelector('canvas[data-testid="viewport"]'),
      r = canvas.getBoundingClientRect();
    const gl = canvas.getContext('webgl2'),
      ext = gl.getExtension('WEBGL_debug_renderer_info');
    const sample = async (orbit) => {
      const frames = [],
        calls = [];
      let last = performance.now(),
        draws = window.drawCalls;
      const pointer = (type, x, y, button = -1, buttons = 0) =>
        canvas.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            pointerId: 1,
            pointerType: 'mouse',
            clientX: r.x + x,
            clientY: r.y + y,
            button,
            buttons,
          }),
        );
      if (orbit) pointer('pointerdown', r.width * 0.5, r.height * 0.5, 2, 2);
      for (let i = 0; i < 150; i++) {
        await new Promise(requestAnimationFrame);
        const now = performance.now();
        if (i > 29) {
          frames.push(now - last);
          calls.push(window.drawCalls - draws);
        }
        last = now;
        draws = window.drawCalls;
        pointer(
          'pointermove',
          r.width * (0.5 + Math.sin(i / 18) * 0.2),
          r.height * (0.5 + Math.cos(i / 23) * 0.2),
          -1,
          orbit ? 2 : 0,
        );
      }
      if (orbit) pointer('pointerup', r.width * 0.65, r.height * 0.5, 2, 0);
      frames.sort((a, b) => a - b);
      calls.sort((a, b) => a - b);
      return {
        frames: frames.length,
        medianFrameMs: +frames[Math.floor(frames.length / 2)].toFixed(2),
        p95FrameMs: +frames[Math.floor(frames.length * 0.95)].toFixed(2),
        medianDrawCallsPerFrame: calls[Math.floor(calls.length / 2)],
      };
    };
    return {
      renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown',
      viewport: [r.width, r.height],
      hover: await sample(false),
      orbit: await sample(true),
    };
  });
  console.log(JSON.stringify({ url, parts: 296, chromium: browser.version(), ...result }, null, 2));
} finally {
  await browser.close();
}
