// Production interaction benchmark. Uses its own browser profile and generated parts.
import { chromium } from '@playwright/test';
import { Matrix4, Vector3, Quaternion } from 'three';
import { readFile, writeFile } from 'node:fs/promises';
const url = process.argv[2] ?? 'http://127.0.0.1:4173/nivo/',
  count = Number(process.argv[3] ?? 1184);
if (!Number.isInteger(count) || count < 1 || count > 10000)
  throw new Error('Count must be 1–10000.');
const browser = await chromium.launch({
  args:
    process.env.NIVO_GPU === 'metal'
      ? ['--use-angle=metal', '--enable-gpu', '--enable-precise-memory-info']
      : ['--enable-precise-memory-info'],
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 960 },
  deviceScaleFactor: 1,
});
page.setDefaultTimeout(60000);
const timings = {};
const run = async (name, action) => {
  const t = performance.now();
  const result = await action();
  timings[name] = Math.round(performance.now() - t);
  return result;
};
const viewport = page.getByTestId('viewport');
const idle = async () => {
  await page.locator('.busy-badge').waitFor({ state: 'hidden' });
  await page.locator('.save-status').filter({ hasText: 'Tallessa selaimessa' }).waitFor();
};
const save = async () => {
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Tallenna tiedosto', exact: true }).click();
  return JSON.parse(await readFile(await (await downloaded).path(), 'utf8'));
};
const reveal = async () => {
  // Pin while interacting so the normal 650 ms auto-hide does not affect timings.
  if (
    (await page
      .getByRole('complementary', { name: 'Mallilista' })
      .getAttribute('data-expanded')) === 'false'
  )
    await page.getByRole('button', { name: 'Näytä mallilista' }).click();
  const pin = page.getByRole('button', { name: 'Pidä mallilista näkyvissä', exact: true });
  if (await pin.count()) await pin.click();
};
try {
  await page.goto(url);
  await page.getByRole('button', { name: 'Piirrä suorakulmio', exact: true }).waitFor();
  const columns = Math.max(20, Math.ceil(Math.sqrt(count)));
  const bodies = Array.from({ length: count }, (_, i) => ({
    id: `action-${i}`,
    name: `Levy ${i + 1}`,
    kind: 'cad',
    feature: { type: 'rectangle-extrusion', width: 500, depth: 400, height: 18 },
    origin: [(i % columns) * 600, Math.floor(i / columns) * 500, 0],
    color: '#c3a57e',
    groupId: 'site',
  }));
  const project = {
    format: 'nivo',
    version: 6,
    id: `actions-${count}`,
    name: `Työmaa ${count}`,
    units: 'mm',
    bodies,
    groups: [{ id: 'site', name: 'Työmaa', hidden: false }],
    dimensions: [],
    guides: [],
    updatedAt: new Date().toISOString(),
  };
  await run('loadMs', async () => {
    await page.getByTestId('project-file').setInputFiles({
      name: 'actions.nivo',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(project)),
    });
    await page.waitForFunction(
      (n) => Number(document.querySelector('[data-mesh-count]')?.dataset.meshCount) === n,
      count,
    );
    await idle();
  });
  await page.getByRole('button', { name: 'Ylhäältä', exact: true }).click();
  await reveal();
  const allocations = Number(await viewport.getAttribute('data-geometry-builds'));
  await run('selectionMs', async () => {
    await page.getByRole('button', { name: 'Valitse ryhmä: Työmaa', exact: true }).click();
    await page.getByRole('button', { name: 'Kopioi valinta', exact: true }).waitFor();
  });
  const allocationAfterSelection = Number(await viewport.getAttribute('data-geometry-builds'));
  await page.keyboard.press('m');
  if (
    (await page
      .getByRole('complementary', { name: 'Mallilista' })
      .getAttribute('data-expanded')) === 'true'
  )
    await page.getByRole('button', { name: 'Piilota mallilista' }).click();
  await page.keyboard.press('x');
  const target = bodies[Math.min(count - 1, Math.floor(count / 2) + Math.floor(columns / 2))],
    world = new Vector3(target.origin[0] + 500, target.origin[1] + 400, 18);
  const rect = await viewport.boundingBox(),
    camera = JSON.parse(await viewport.getAttribute('data-camera'));
  const inverse = new Matrix4()
    .compose(
      new Vector3(...camera.position),
      new Quaternion().fromArray(camera.quaternion),
      new Vector3(1, 1, 1),
    )
    .invert();
  const p = world.applyMatrix4(inverse).applyMatrix4(new Matrix4().fromArray(camera.projection));
  const x = rect.x + ((p.x + 1) * rect.width) / 2,
    y = rect.y + ((1 - p.y) * rect.height) / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  if (!(await viewport.getAttribute('data-move-grab')))
    throw new Error('The preview benchmark did not grab a part.');
  const profiler = process.env.NIVO_CPU_PROFILE
    ? await page.context().newCDPSession(page)
    : undefined;
  await profiler?.send('Profiler.enable');
  await profiler?.send('Profiler.start');
  const preview = await page.evaluate(
    async ({ x, y }) => {
      const canvas = document.querySelector('[data-testid=viewport]'),
        frames = [],
        calls = [];
      let previous = performance.now();
      for (let i = 0; i < 120; i++) {
        await new Promise(requestAnimationFrame);
        const now = performance.now();
        if (i >= 20) {
          frames.push(now - previous);
          calls.push(Number(canvas.dataset.drawCalls));
        }
        previous = now;
        canvas.dispatchEvent(
          new PointerEvent('pointermove', {
            bubbles: true,
            pointerId: 1,
            pointerType: 'mouse',
            buttons: 1,
            clientX: x + 20 + Math.sin(i / 20) * 45,
            clientY: y,
          }),
        );
      }
      frames.sort((a, b) => a - b);
      calls.sort((a, b) => a - b);
      return {
        medianMs: +frames[50].toFixed(2),
        p95Ms: +frames[95].toFixed(2),
        drawCalls: calls[50],
      };
    },
    { x, y },
  );
  if (profiler) {
    const { profile } = await profiler.send('Profiler.stop');
    await writeFile(process.env.NIVO_CPU_PROFILE, JSON.stringify(profile));
  }
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await reveal();
  await page.getByRole('button', { name: 'Valitse ryhmä: Työmaa', exact: true }).click();
  await page.keyboard.press('m');
  await run('moveCommitMs', async () => {
    await page.getByTestId('move-x').fill('100');
    await page.getByTestId('move-x').press('Enter');
    await idle();
  });
  const moved = await save();
  if (
    moved.bodies.some(
      (b, i) =>
        b.origin[0] !== bodies[i].origin[0] + 100 ||
        b.origin[1] !== bodies[i].origin[1] ||
        b.origin[2] !== 0,
    )
  )
    throw new Error('Move drifted from the exact X delta.');
  await page.keyboard.press('Escape');
  await run('undoMs', async () => {
    await page.getByRole('button', { name: 'Peru', exact: true }).click();
    await idle();
  });
  let expected = count;
  if (count <= 5000) {
    await reveal();
    await page.getByRole('button', { name: 'Valitse ryhmä: Työmaa', exact: true }).click();
    await run('copyCommitMs', async () => {
      await page.getByRole('button', { name: 'Kopioi valinta', exact: true }).click();
      await page.getByTestId('move-y').fill('1000');
      await page.getByTestId('move-y').press('Enter');
      await page.waitForFunction(
        (n) => Number(document.querySelector('[data-mesh-count]')?.dataset.meshCount) === n,
        count * 2,
      );
      await idle();
    });
    expected = count * 2;
  }
  const saved = await run('saveFileMs', save);
  if (saved.bodies.length !== expected) throw new Error('Wrong saved part count.');
  await run('reloadMs', async () => {
    await page.reload();
    await page.waitForFunction(
      (n) => Number(document.querySelector('[data-mesh-count]')?.dataset.meshCount) === n,
      expected,
    );
  });
  const heapMiB = await page.evaluate(() =>
    performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
  );
  console.log(
    JSON.stringify(
      {
        parts: count,
        resultParts: expected,
        ...timings,
        preview,
        allocationAfterSelection: allocationAfterSelection - allocations,
        heapMiBAfterReload: heapMiB,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
