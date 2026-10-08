import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { cabinetBodies, cabinetDefaults, cabinetPlan } from '../src/model/cabinet';
import { defaultAppearance } from '../src/model/materials';
import { ready, revealBrowser } from './helpers';

// Manual hardware profiling: run headed, without another browser suite in parallel.
// Frame timing is diagnostic, never a portable FPS acceptance threshold.
test.skip(process.env.NIVO_PROFILE !== '1', 'Set NIVO_PROFILE=1 to collect GPU/CPU profiles');

for (const surface of ['paint', 'pbr-oak_veneer_01']) {
  test(`profile twelve cabinets with ${surface} doors`, async ({ page }, info) => {
    test.setTimeout(120000);
    await page.addInitScript(() => {
      const state = { uploads: 0, deletes: 0, frames: [] as number[], cpu: [] as number[] };
      (window as any).__nivoPerf = state;
      for (const name of [
        'texImage2D',
        'texSubImage2D',
        'texImage3D',
        'texSubImage3D',
        'deleteTexture',
      ] as const) {
        const proto = WebGL2RenderingContext.prototype as any;
        const old = proto[name];
        proto[name] = function (...args: any[]) {
          if (name === 'deleteTexture') state.deletes++;
          else state.uploads++;
          return old.apply(this, args);
        };
      }
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (callback) =>
        raf((time) => {
          const start = performance.now();
          callback(time);
          state.frames.push(time);
          state.cpu.push(performance.now() - start);
        });
    });
    const groups = Array.from({ length: 12 }, (_, i) => ({
      id: `cabinet-${i}`,
      name: `Kaappi ${i}`,
      kind: 'assembly' as const,
      hidden: false,
    }));
    const bodies = groups.flatMap((group, i) => {
      const plan = cabinetPlan({
        ...cabinetDefaults,
        doors: 'single',
        height: 2200,
        shelves: 3,
        origin: [(i % 4) * 650, Math.floor(i / 4) * 1200, 0],
      });
      return cabinetBodies(plan, group.id).map((b, n) => ({
        ...b,
        color: plan[n].role === 'door' ? '#ffffff' : b.color,
        appearance: defaultAppearance(plan[n].role === 'door' ? surface : 'paint'),
      }));
    });
    await ready(page, bodies, [], groups);
    await page.getByRole('button', { name: 'Piilota mallilista' }).press('Enter');
    const canvas = page.getByTestId('viewport');
    await page.waitForTimeout(1500);
    const client = await page.context().newCDPSession(page);
    const rect = (await canvas.boundingBox())!;
    const result: Record<string, unknown> = {};
    for (const phase of ['hover', 'orbit']) {
      await page.evaluate(() => {
        const s = (window as any).__nivoPerf;
        s.uploads = s.deletes = 0;
        s.cpu = [];
        s.frames = [];
      });
      await client.send('Profiler.enable');
      await client.send('Profiler.start');
      await page.mouse.move(rect.x + rect.width * 0.5, rect.y + rect.height * 0.5);
      if (phase === 'orbit') await page.mouse.down({ button: 'right' });
      const start = Date.now();
      for (let i = 0; i < 100; i++) {
        await page.mouse.move(
          rect.x + rect.width * (0.5 + 0.25 * Math.sin(i / 12)),
          rect.y + rect.height * (0.5 + 0.18 * Math.cos(i / 10)),
        );
        await page.waitForTimeout(16);
      }
      if (phase === 'orbit') await page.mouse.up({ button: 'right' });
      const elapsed = Date.now() - start;
      const profile = await client.send('Profiler.stop');
      await writeFile(info.outputPath(`${phase}.cpuprofile`), JSON.stringify(profile.profile));
      result[phase] = {
        elapsed,
        ...(await page.evaluate(() => (window as any).__nivoPerf)),
        draws: await canvas.getAttribute('data-draw-calls'),
        builds: await canvas.getAttribute('data-geometry-builds'),
      };
    }
    await writeFile(info.outputPath('metrics.json'), JSON.stringify(result, null, 2));
    console.log(
      surface,
      JSON.stringify(
        Object.fromEntries(
          Object.entries(result).map(([phase, r]: [string, any]) => {
            const sorted = [...r.cpu].sort((a, b) => a - b);
            return [
              phase,
              {
                elapsed: r.elapsed,
                uploads: r.uploads,
                deletes: r.deletes,
                frames: r.frames.length,
                cpuP95: sorted[Math.floor(sorted.length * 0.95)],
                cpuMax: sorted.at(-1),
                draws: r.draws,
                builds: r.builds,
              },
            ];
          }),
        ),
      ),
    );
    expect(await canvas.getAttribute('data-mesh-count')).toBe(String(bodies.length));
  });
}

test.describe('retina reproduction', () => {
  test.use({ viewport: { width: 1728, height: 1117 }, deviceScaleFactor: 2 });
  test('black oak scaled and rotated, copied once and repeated as cabinets and doors', async ({
    page,
  }, info) => {
    test.setTimeout(180000);
    await page.addInitScript(() => {
      (window as any).__uploads = 0;
      const proto = WebGL2RenderingContext.prototype as any;
      for (const name of ['texImage2D', 'texSubImage2D']) {
        const old = proto[name];
        proto[name] = function (...args: any[]) {
          (window as any).__uploads++;
          return old.apply(this, args);
        };
      }
    });
    const plan = cabinetPlan({ ...cabinetDefaults, depth: 590, height: 760, doors: 'single' });
    const bodies = cabinetBodies(plan, 'cabinet');
    const door = bodies.find((b) => b.name === 'Ovi')!;
    door.color = '#ffffff';
    door.appearance = defaultAppearance('pbr-black_oak_veneer');
    door.appearance.texture.width = door.appearance.texture.height = 650;
    door.appearance.texture.rotation = 90;
    await ready(
      page,
      bodies,
      [],
      [{ id: 'cabinet', name: 'Kaappi', hidden: false, kind: 'assembly' }],
    );
    await revealBrowser(page);
    await page.getByRole('button', { name: 'Valitse ryhmä: Kaappi', exact: true }).click();
    await page.keyboard.press('m');
    await page.getByRole('checkbox', { name: 'Siirrä kopio', exact: true }).check();
    await page.getByTestId('move-x').fill('650');
    await page.getByTestId('move-x').press('Enter');
    for (let i = 0; i < 10; i++)
      await page.getByRole('button', { name: 'Toista', exact: true }).click();
    await page.keyboard.press('Escape');
    await revealBrowser(page);
    await page.getByTestId(`body-${door.id}`).press('Enter');
    await page.keyboard.press('m');
    await page.getByRole('checkbox', { name: 'Siirrä kopio', exact: true }).check();
    await page.getByTestId('move-y').fill('-650');
    await page.getByTestId('move-y').press('Enter');
    await page.getByLabel('Lisätoistojen määrä').fill('10');
    await page.getByRole('button', { name: 'Toista', exact: true }).click();
    await page.getByRole('button', { name: 'Piilota mallilista' }).press('Enter');
    if (await page.getByRole('button', { name: 'Sulje kokoonpano', exact: true }).isVisible())
      await page.getByRole('button', { name: 'Sulje kokoonpano', exact: true }).click();
    await page.getByRole('button', { name: 'Yleisnäkymä', exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            performance
              .getEntriesByType('resource')
              .filter((r) => /\/black_oak_veneer\/(color|normal|roughness)\.jpg$/.test(r.name))
              .length,
        ),
      )
      .toBe(3);
    await page.waitForTimeout(1500);
    const canvas = page.getByTestId('viewport');
    const rect = (await canvas.boundingBox())!;
    const results = {} as Record<string, unknown>;
    for (const mode of ['move', 'select']) {
      if (mode !== 'move') await page.getByRole('button', { name: 'Valitse', exact: true }).click();
      await page.getByRole('button', { name: 'Yleisnäkymä', exact: true }).click();
      await page.mouse.move(rect.x + rect.width * 0.55, rect.y + rect.height * 0.5);
      await page.mouse.down({ button: 'right' });
      const client = await page.context().newCDPSession(page);
      await client.send('Profiler.enable');
      await client.send('Profiler.start');
      results[mode] = await canvas.evaluate(async (node) => {
        const canvas = node as HTMLCanvasElement,
          r = canvas.getBoundingClientRect();
        const times: number[] = [],
          start = performance.now();
        (window as any).__uploads = 0;
        for (let i = 0; i < 150; i++) {
          await new Promise<void>((resolve) =>
            requestAnimationFrame((t) => {
              times.push(t);
              canvas.dispatchEvent(
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
        }
        const intervals = times
          .slice(1)
          .map((t, i) => t - times[i])
          .sort((a, b) => a - b);
        const gl = canvas.getContext('webgl2')!;
        const debug = gl.getExtension('WEBGL_debug_renderer_info');
        return {
          elapsed: performance.now() - start,
          p95: intervals[Math.floor(intervals.length * 0.95)],
          median: intervals[Math.floor(intervals.length / 2)],
          max: intervals.at(-1),
          framesOver32ms: intervals.filter((ms) => ms > 32).length,
          uploads: (window as any).__uploads,
          calls: canvas.dataset.drawCalls,
          triangles: canvas.dataset.triangles,
          camera: canvas.dataset.camera,
          width: canvas.width,
          height: canvas.height,
          renderer: debug
            ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
            : gl.getParameter(gl.RENDERER),
          browser: navigator.userAgent,
        };
      });
      await page.mouse.move(rect.x + rect.width * 0.65, rect.y + rect.height * 0.6);
      await page.mouse.up({ button: 'right' });
      const profile = await client.send('Profiler.stop');
      await writeFile(info.outputPath(`${mode}.cpuprofile`), JSON.stringify(profile.profile));
      await client.detach();
      await page.screenshot({ path: info.outputPath(`${mode}.png`) });
    }
    console.log('retina', results);
    await writeFile(info.outputPath('metrics.json'), JSON.stringify(results, null, 2));
    expect(await canvas.getAttribute('data-mesh-count')).toBe('95');
  });
});
