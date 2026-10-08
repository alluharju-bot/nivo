// Profiles a private saved project locally; no fixture or model data is committed.
import { chromium, expect } from '@playwright/test';
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const [url, modelPath, outputPath] = process.argv.slice(2);
if (!url || !modelPath)
  throw new Error(
    'Usage: node scripts/performance-project.mjs http://127.0.0.1:4173/nivo/ model.nivo [output-directory]',
  );
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname))
  throw new Error(
    'Saved-project profiling requires a local server. The project stays on this machine.',
  );
const input = JSON.parse(await readFile(modelPath, 'utf8'));
const out = outputPath ?? (await mkdtemp(join(tmpdir(), 'nivo-project-profile-')));
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  channel: process.env.NIVO_BROWSER || undefined,
  headless: false,
});
const results = {};
try {
  for (const variant of ['original', 'no-guides', 'flat-materials']) {
    const project = structuredClone(input);
    if (variant === 'no-guides') project.guides = [];
    if (variant === 'flat-materials')
      for (const body of project.bodies) {
        body.appearance = {
          preset: 'paint',
          texture: {
            width: 1000,
            height: 1000,
            offsetX: 0,
            offsetY: 0,
            rotation: 0,
            lockAspect: true,
          },
        };
        body.color = '#cccccc';
      }
    const page = await browser.newPage({
      viewport: { width: 1728, height: 1117 },
      deviceScaleFactor: 2,
    });
    page.on('pageerror', (err) => console.log('Page error:', String(err)));
    page.on('requestfailed', (r) => console.log('Request failed:', r.url(), r.failure()));
    page.setDefaultTimeout(60000);
    await page.goto(url);
    console.log('Profiling:', variant);
    await expect(
      page.getByRole('button', { name: 'Piirrä suorakulmio', exact: true }),
    ).toBeEnabled();
    await page
      .getByTestId('project-file')
      .setInputFiles({
        name: 'profile.nivo',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(project)),
      });
    await page.waitForFunction(
      (n) => document.querySelector('[data-testid="viewport"]')?.dataset.meshCount === String(n),
      project.bodies.filter((b) => {
        if (b.hidden) return false;
        let id = b.groupId;
        const visited = new Set();
        while (id && !visited.has(id)) {
          visited.add(id);
          const g = project.groups.find((g) => g.id === id);
          if (g?.hidden) return false;
          id = g?.parentId;
        }
        return true;
      }).length,
    );
    await page.getByRole('button', { name: 'Piilota mallilista' }).press('Enter');
    await page.getByRole('button', { name: 'Yleisnäkymä', exact: true }).click();
    await page.waitForTimeout(2000);
    const canvas = page.getByTestId('viewport'),
      r = await canvas.boundingBox();
    const client = await page.context().newCDPSession(page);
    await client.send('Profiler.enable');
    results[variant] = {};
    for (const tool of ['select', 'move']) {
      await page
        .getByRole('button', { name: tool === 'select' ? 'Valitse' : 'Siirrä', exact: true })
        .click();
      await page.getByRole('button', { name: 'Yleisnäkymä', exact: true }).click();
      await page.mouse.move(r.x + r.width * 0.55, r.y + r.height * 0.5);
      await page.mouse.down({ button: 'right' });
      await client.send('Profiler.start');
      const metrics = await canvas.evaluate(async (node) => {
        const r = node.getBoundingClientRect(),
          frames = [];
        let previous = performance.now();
        for (let i = 0; i < 180; i++)
          await new Promise((resolve) =>
            requestAnimationFrame((t) => {
              frames.push(t - previous);
              previous = t;
              node.dispatchEvent(
                new PointerEvent('pointermove', {
                  bubbles: true,
                  pointerId: 1,
                  pointerType: 'mouse',
                  isPrimary: true,
                  buttons: 2,
                  button: -1,
                  clientX: r.x + r.width * (0.55 + 0.15 * Math.sin(i / 30)),
                  clientY: r.y + r.height * (0.5 + 0.1 * Math.cos(i / 23)),
                }),
              );
              resolve();
            }),
          );
        const sorted = frames.slice(10).sort((a, b) => a - b);
        const gl = node.getContext('webgl2'),
          debug = gl.getExtension('WEBGL_debug_renderer_info');
        return {
          median: sorted[Math.floor(sorted.length * 0.5)],
          p95: sorted[Math.floor(sorted.length * 0.95)],
          max: sorted.at(-1),
          slowFrames: sorted.filter((ms) => ms > 32).length,
          frames,
          data: { ...node.dataset },
          gpu: gl.getParameter(debug.UNMASKED_RENDERER_WEBGL),
          browser: navigator.userAgent,
        };
      });
      const profile = await client.send('Profiler.stop');
      await writeFile(`${out}/${variant}-${tool}.cpuprofile`, JSON.stringify(profile.profile));
      await page.mouse.move(r.x + r.width * 0.65, r.y + r.height * 0.6);
      await page.mouse.up({ button: 'right' });
      results[variant][tool] = metrics;
      console.log(
        variant,
        tool,
        JSON.stringify({
          ...metrics,
          frames: undefined,
          data: {
            calls: metrics.data.drawCalls,
            triangles: metrics.data.triangles,
            builds: metrics.data.geometryBuilds,
            visibilityTrees: metrics.data.occlusionBuilds,
          },
        }),
      );
    }
    await page.screenshot({ path: `${out}/${variant}.png` });
    await page.close();
  }
  await writeFile(`${out}/metrics.json`, JSON.stringify(results, null, 2));
  console.log('Saved profiles:', out);
} finally {
  await browser.close();
}
