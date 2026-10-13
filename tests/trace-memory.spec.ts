import { expect, test } from '@playwright/test';
import { makeBody } from '../src/model/project';
import { defaultAppearance } from '../src/model/materials';
import { ready } from './helpers';

test('export releases preview GPU textures and repeated refinement does not leak them', async ({
  page,
}) => {
  test.setTimeout(180000);
  await page.addInitScript(() => {
    const live = new WeakMap<WebGL2RenderingContext, Set<WebGLTexture>>();
    const proto = WebGL2RenderingContext.prototype;
    const create = proto.createTexture,
      remove = proto.deleteTexture;
    proto.createTexture = function () {
      const texture = create.call(this);
      if (!live.has(this)) live.set(this, new Set());
      if (texture) live.get(this)!.add(texture);
      return texture;
    };
    proto.deleteTexture = function (texture) {
      if (texture) live.get(this)?.delete(texture);
      return remove.call(this, texture);
    };
    (window as unknown as { liveTraceTextures: () => number }).liveTraceTextures = () => {
      const canvas = document.querySelector('[data-testid="render-canvas"]') as HTMLCanvasElement;
      return live.get(canvas.getContext('webgl2')!)?.size ?? 0;
    };
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await ready(page, [
    { ...makeBody(400, 200, 50), appearance: defaultAppearance('pbr-coated_pine') },
  ]);
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  await page.getByRole('button', { name: 'Kuva', exact: true }).click();
  await page.getByLabel('Tarkennuksen tavoite', { exact: true }).selectOption('8');
  const counts: number[] = [];
  await expect(page.getByTestId('render-canvas')).toHaveAttribute(
    'data-trace-texture-size',
    '2048',
    { timeout: 120000 },
  );
  expect(
    Number(await page.getByTestId('render-canvas').getAttribute('data-trace-texture-bytes')),
  ).toBeLessThanOrEqual(128 * 1024 * 1024);
  for (let i = 0; i < 3; i++) {
    if (i) await page.getByRole('button', { name: 'Tarkentuva', exact: true }).click();
    await expect(page.getByTestId('trace-status')).toContainText('Tavoite saavutettu', {
      timeout: 120000,
    });
    const peak = await page.evaluate(() =>
      (window as unknown as { liveTraceTextures: () => number }).liveTraceTextures(),
    );
    await page.getByLabel('Kuvan leveys', { exact: true }).selectOption('800');
    await page.getByLabel('Kuvan laskenta', { exact: true }).selectOption('path');
    await page.getByLabel('Kuvan näytemäärä', { exact: true }).selectOption('8');
    await page.getByRole('button', { name: 'Laske tarkka kuva', exact: true }).click();
    const job = page.getByRole('complementary', { name: 'Kuvan renderöinti', exact: true });
    await expect(job).toHaveAttribute('data-state', 'done', { timeout: 60000 });
    const released = await page.evaluate(() =>
      (window as unknown as { liveTraceTextures: () => number }).liveTraceTextures(),
    );
    expect(released).toBeLessThan(peak - 5);
    counts.push(released);
    await job.getByRole('button', { name: 'Sulje kuvan tila', exact: true }).click();
  }
  console.log(JSON.stringify({ previewTexturesAfterRelease: counts }));
  expect(Math.max(...counts) - Math.min(...counts)).toBe(0);
  expect(errors).toEqual([]);
});
