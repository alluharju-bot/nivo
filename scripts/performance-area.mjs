// Compare production versions with the same floor, guides, camera and pointer path.
import { chromium, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const url = process.argv[2] ?? 'http://127.0.0.1:4173/nivo/';
const browser = await chromium.launch();
try {
  for (const guideCount of [0, 120]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    await page.goto(url);
    await expect(
      page.getByRole('button', { name: 'Piirrä suorakulmio', exact: true }),
    ).toBeEnabled();
    const floor = {
      id: 'floor',
      name: 'Lattia',
      kind: 'cad',
      feature: { type: 'rectangle-extrusion', width: 6000, depth: 6000, height: 100 },
      origin: [0, 0, -100],
      color: '#c3a57e',
    };
    const project = {
      format: 'nivo',
      version: 6,
      id: 'area-perf',
      name: 'Pinta-ala',
      units: 'mm',
      bodies: [floor],
      groups: [],
      dimensions: [],
      guides: Array.from({ length: guideCount }, (_, i) => ({
        id: `g${i}`,
        mode: 'free',
        plane: 'XY',
        angle: i < 60 ? 0 : 90,
        length: 6000,
        anchor: { point: i < 60 ? [0, i * 100, 0] : [(i - 60) * 100, 0, 0] },
        endAnchor: { point: i < 60 ? [6000, i * 100, 0] : [(i - 60) * 100, 6000, 0] },
      })),
      settings: {
        guideXray: false,
        axisStyle: 'subtle',
        axisLabels: false,
        dimensionDisplay: 'hidden',
      },
      updatedAt: new Date().toISOString(),
    };
    await page.getByTestId('project-file').setInputFiles({
      name: 'area-perf.nivo',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(project)),
    });
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
    await page.getByRole('button', { name: 'Valitse mittatyökalu', exact: true }).click();
    await page.getByRole('menuitemradio', { name: /^Pinta-ala/ }).click();
    await page.getByRole('button', { name: 'Näkymä: Ylhäältä', exact: true }).press('Enter');
    await page.getByRole('button', { name: 'Sovita näkymään', exact: true }).click();
    if (
      (await page
        .getByRole('complementary', { name: 'Mallilista' })
        .getAttribute('data-expanded')) === 'true'
    )
      await page.getByRole('button', { name: 'Piilota mallilista', exact: true }).press('Enter');
    const box = await page.getByTestId('viewport').boundingBox();
    await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.45);
    const client = await page.context().newCDPSession(page);
    await client.send('Profiler.enable');
    await client.send('Profiler.start');
    const result = await page.getByTestId('viewport').evaluate(async (node) => {
      const b = node.getBoundingClientRect(),
        times = [],
        frames = [];
      let previous = performance.now();
      for (let i = 0; i < 120; i++) {
        await new Promise(requestAnimationFrame);
        const t = performance.now();
        if (i > 10) frames.push(t - previous);
        previous = t;
        node.dispatchEvent(
          new PointerEvent('pointermove', {
            bubbles: true,
            pointerType: 'mouse',
            pointerId: 1,
            buttons: 0,
            clientX: b.x + b.width * (0.52 + 0.12 * Math.sin(i * 0.1)),
            clientY: b.y + b.height * (0.58 + 0.1 * Math.cos(i * 0.1)),
          }),
        );
        if (i > 10) times.push(performance.now() - t);
      }
      const metric = (values) => {
        values.sort((a, b) => a - b);
        return {
          median: +values[Math.floor(values.length * 0.5)].toFixed(2),
          p95: +values[Math.floor(values.length * 0.95)].toFixed(2),
        };
      };
      return { pointerMs: metric(times), frameMs: metric(frames) };
    });
    const { profile } = await client.send('Profiler.stop');
    if (process.env.NIVO_CPU_PROFILE)
      await writeFile(
        `${process.env.NIVO_CPU_PROFILE}-${guideCount}.json`,
        JSON.stringify(profile),
      );
    const costs = new Map(),
      nodes = new Map(profile.nodes.map((n) => [n.id, n.callFrame]));
    profile.samples.forEach((id, i) => {
      const f = nodes.get(id),
        key = f.functionName || f.url.split('/').at(-1) || '(anonymous)';
      costs.set(key, (costs.get(key) ?? 0) + profile.timeDeltas[i] / 1000);
    });
    console.log(
      JSON.stringify({
        guideCount,
        ...result,
        hot: [...costs]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([name, ms]) => ({ name, ms: Math.round(ms) })),
      }),
    );
    await page.close();
  }
} finally {
  await browser.close();
}
