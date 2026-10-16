import { expect, test } from '@playwright/test';
import { build } from 'vite';
import { resolve } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';

test('wood texture transfer and chrome retain material detail', async ({ page }, info) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.text().includes('GL_INVALID')) errors.push(m.text());
  });
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      lib: {
        entry: resolve('tests/fixtures/trace-fidelity-harness.ts'),
        name: 'Fidelity',
        formats: ['iife'],
      },
    },
  });
  const bundle = Array.isArray(result) ? result[0] : result;
  if (!('output' in bundle)) throw Error();
  await page.goto('about:blank');
  await page.addScriptTag({ content: bundle.output.find((c) => c.type === 'chunk')!.code });
  const urls = await Promise.all(
    ['color', 'normal', 'roughness'].map(
      async (map) =>
        `data:image/jpeg;base64,${(await readFile(`public/materials/oak_veneer_01/2k/${map}.jpg`)).toString('base64')}`,
    ),
  );
  const transfer = await page.evaluate(
    (url) =>
      (
        window as unknown as { Fidelity: typeof import('./fixtures/trace-fidelity-harness') }
      ).Fidelity.textureFidelity(url),
    urls[0],
  );
  console.log(JSON.stringify({ transfer, errors }));
  const seams = await page.evaluate(
    (url) =>
      (
        window as unknown as { Fidelity: typeof import('./fixtures/trace-fidelity-harness') }
      ).Fidelity.textureFidelity(url, true),
    urls[0],
  );
  console.log(JSON.stringify({ seams, errors }));
  const renders = await page.evaluate(
    (urls) =>
      (
        window as unknown as { Fidelity: typeof import('./fixtures/trace-fidelity-harness') }
      ).Fidelity.renderFidelity(urls),
    urls,
  );
  for (const r of renders) {
    await writeFile(
      info.outputPath(`${r.material}-preview.png`),
      Buffer.from(r.preview.split(',')[1], 'base64'),
    );
    for (const c of r.checkpoints)
      for (const kind of ['raw', 'filtered'] as const)
        await writeFile(
          info.outputPath(`${r.material}-${c.samples}-${kind}.png`),
          Buffer.from(c[kind].split(',')[1], 'base64'),
        );
  }
  const summary = renders.map((r) => ({
    material: r.material,
    error: r.error,
    fidelity: r.fidelity,
    checkpoints: r.checkpoints.map(({ raw: _r, filtered: _f, ...c }) => c),
  }));
  await writeFile(
    info.outputPath('metrics.json'),
    JSON.stringify({ transfer, seams, renders: summary, errors }, null, 2),
  );
  console.log(JSON.stringify({ renders: summary, errors }));
  expect(errors).toEqual([]);
  for (const t of transfer) {
    expect(t.relativeError).toBeLessThan(0.001);
    expect(t.darkError).toBeLessThan(0.0001);
    expect(t.detail).toBeGreaterThan(0.98);
    expect(t.detail).toBeLessThan(1.02);
    expect(t.atlasBytes).toBeLessThanOrEqual(128 * 1024 * 1024);
  }
  // Hardware bilinear weights have finite subtexel precision; the explicit
  // repeat-edge filter uses float weights. Allow 0.2% at the seam itself,
  // while still rejecting adjacent-tile bleed (the other tiles differ greatly).
  for (const t of seams) expect(t.relativeError).toBeLessThan(0.002);
  for (const r of renders) {
    expect(r.error).toBe(0);
    const at256 = r.fidelity[1],
      final = r.fidelity.at(-1)!;
    expect(final.filteredDetail).toBeGreaterThan(0.9);
    expect(final.filteredDetail).toBeLessThan(1.1);
    expect(at256.filteredError).toBeLessThan(at256.rawError * 1.1);
    if (r.material === 'oak') expect(at256.filteredError).toBeLessThan(0.02);
    // These are comparisons to a finite, still slightly noisy 4096-sample
    // reference, not proof of a physically exact or fully converged image.
    expect(final.filteredError).toBeLessThan(0.015);
  }
});
