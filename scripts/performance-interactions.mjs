// Profile tool interactions on a private, local-only copy. Never connects to cloud sync.
import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const [url, file, out] = process.argv.slice(2);
if (!url || !file || !out || !['127.0.0.1', 'localhost'].includes(new URL(url).hostname))
  throw new Error(
    'Usage: node scripts/performance-interactions.mjs local-url model.nivo output-dir',
  );
await mkdir(out, { recursive: true });
const project = JSON.parse(await readFile(file, 'utf8'));
const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({
  viewport: { width: 1440, height: 960 },
  deviceScaleFactor: 1,
});
page.setDefaultTimeout(60000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const results = {};
try {
  await page.goto(url);
  await expect(page.getByRole('button', { name: 'Piirrä suorakulmio', exact: true })).toBeEnabled();
  await page.getByTestId('project-file').setInputFiles(file);
  const canvas = page.getByTestId('viewport');
  await expect(canvas).not.toHaveAttribute('data-mesh-count', '0');
  await expect(page.getByRole('button', { name: 'Peru', exact: true })).toBeDisabled();
  const hide = page.getByRole('button', { name: 'Piilota mallilista', exact: true });
  if (await hide.isVisible()) await hide.press('Enter');
  const side = process.env.NIVO_PERF_SIDE || 'Edestä';
  await page.getByRole('button', { name: `Näkymä: ${side}`, exact: true }).press('Enter');
  await page.getByRole('button', { name: 'Sovita näkymään', exact: true }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/view.png` });
  const client = await page.context().newCDPSession(page);
  await client.send('Profiler.enable');
  for (const tool of (process.env.NIVO_PERF_TOOLS || 'v,e,t,k,m').split(',')) {
    await page.keyboard.press('Escape');
    await page.keyboard.press(tool[0]);
    await page.waitForTimeout(400);
    const active = tool.endsWith('-drag');
    if (active) {
      const r = await canvas.boundingBox();
      // The long facade's wall between window rows / top edge, respectively.
      await page.mouse.move(r.x + r.width * 0.65, r.y + r.height * (tool[0] === 'e' ? 0.46 : 0.32));
      if (tool[0] === 'e') await expect(canvas).not.toHaveAttribute('data-hover-face', '');
      await page.mouse.down();
      await expect(page.getByTestId('dynamic-input')).toBeVisible();
    }
    await client.send('Profiler.start');
    const metrics = await canvas.evaluate(async (node, active) => {
      const r = node.getBoundingClientRect(),
        frames = [],
        events = [],
        targets = new Set();
      let previous = performance.now();
      for (let i = 0; i < 100; i++)
        await new Promise((resolve) =>
          requestAnimationFrame((t) => {
            frames.push(t - previous);
            previous = t;
            const start = performance.now();
            node.dispatchEvent(
              new PointerEvent('pointermove', {
                bubbles: true,
                pointerId: 1,
                pointerType: 'mouse',
                isPrimary: true,
                buttons: active ? 1 : 0,
                clientX: r.x + r.width * (active ? 0.65 : 0.5 + 0.23 * Math.sin(i / 11)),
                clientY:
                  r.y +
                  r.height *
                    (active ? 0.46 - 0.04 * Math.sin(i / 11) : 0.5 + 0.18 * Math.cos(i / 8)),
              }),
            );
            events.push(performance.now() - start);
            targets.add(
              node.dataset.hoverFace || node.dataset.snapKey || node.dataset.moveSnap || '',
            );
            resolve();
          }),
        );
      const summarize = (a) => {
        const sorted = a.slice(10).sort((x, y) => x - y);
        return {
          median: sorted[Math.floor(sorted.length * 0.5)],
          p95: sorted[Math.floor(sorted.length * 0.95)],
          max: sorted.at(-1),
          over32: sorted.filter((t) => t > 32).length,
        };
      };
      return {
        frames: summarize(frames),
        events: summarize(events),
        firstEvent: events[0],
        targets: targets.size,
        triangles: node.dataset.triangles,
        calls: node.dataset.drawCalls,
        builds: node.dataset.geometryBuilds,
        width: node.width,
        height: node.height,
      };
    }, active);
    const { profile } = await client.send('Profiler.stop');
    await writeFile(`${out}/${tool}.cpuprofile`, JSON.stringify(profile));
    results[tool] = metrics;
    console.log(tool, JSON.stringify(metrics));
    if (active) {
      await page.screenshot({ path: `${out}/${tool}.png` });
      await page.keyboard.press('Escape');
      await page.mouse.up();
    }
  }
  await writeFile(
    `${out}/metrics.json`,
    JSON.stringify({ parts: project.bodies.length, results, errors }, null, 2),
  );
  console.log('Profile directory:', out, 'page errors:', errors.length);
} finally {
  await browser.close();
}
