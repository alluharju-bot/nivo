import { expect, test } from '@playwright/test';
import { decode } from 'fast-png';
import { click, ready, save, view } from './helpers';
import { makeBody } from '../src/model/project';
import { asComponent } from '../src/model/components';
import { defaultAppearance } from '../src/model/materials';

for (const preset of ['pine', 'pbr-coated_pine']) {
  test(`P brush applies a new tint when repainting a ${preset} component`, async ({
    page,
  }, info) => {
    const body = asComponent(makeBody(600, 400, 30));
    await ready(page, [body]);
    const point = await view(page, [body]);
    const p = point(300, 200, 30);
    await page.keyboard.press('p');
    await page.getByLabel('Pensselin materiaali', { exact: true }).selectOption(preset);
    await click(page, p);
    expect((await save(page)).bodies[0].appearance?.preset).toBe(preset);
    const pixel = async () => {
      const png = decode(
        await page.screenshot({ clip: { x: p.x - 20, y: p.y - 20, width: 40, height: 40 } }),
      );
      const sums = [0, 0, 0];
      for (let i = 0; i < png.data.length; i += png.channels)
        sums.forEach((_, c) => {
          sums[c] += png.data[i + c];
        });
      return sums.map((n) => n / (png.width * png.height));
    };
    const before = await pixel();
    await page.getByLabel('Pensselin väri', { exact: true }).fill('#2244bb');
    await expect(page.getByLabel('Pensselin väri', { exact: true })).toHaveValue('#2244bb');
    await click(page, p);
    expect((await save(page)).bodies[0]).toMatchObject({
      color: '#2244bb',
      appearance: { preset },
    });
    await expect
      .poll(async () => {
        const rgb = await pixel();
        return rgb[2] - rgb[0];
      })
      .toBeGreaterThan(30);
    const after = await pixel();
    expect(after).not.toEqual(before);
    await page.screenshot({ path: info.outputPath('repainted-texture.png') });
    await page.getByRole('button', { name: 'Peru', exact: true }).click();
    expect((await save(page)).bodies[0].color).not.toBe('#2244bb');
  });
}

test('PBR tint previews in progressive rendering and white restores the source colour without rebuilding geometry', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop');
  test.setTimeout(150000);
  await ready(page, [
    {
      ...makeBody(600, 400, 30),
      color: '#ffffff',
      appearance: defaultAppearance('pbr-coated_pine'),
    },
  ]);
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  await page.getByRole('button', { name: 'Kuva', exact: true }).click();
  await page.getByRole('button', { name: 'Tarkentuva', exact: true }).click();
  await page.getByLabel('Tarkennuksen tavoite', { exact: true }).selectOption('8');
  const status = page.getByTestId('trace-status');
  await expect(status).toContainText('Tavoite saavutettu', { timeout: 120000 });
  const canvas = page.getByTestId('render-canvas');
  const builds = await canvas.getAttribute('data-trace-scene-builds');
  const pixels = async (color: 'blue' | 'warm') => {
    const png = decode(await canvas.screenshot());
    let count = 0;
    for (let i = 0; i < png.data.length; i += png.channels) {
      const r = png.data[i],
        g = png.data[i + 1],
        b = png.data[i + 2];
      if (color === 'blue' ? b > r + 25 && b > g + 10 : r > g + 20 && g > b + 15) count++;
    }
    return count;
  };
  expect(await pixels('warm')).toBeGreaterThan(1000);
  await page.getByRole('button', { name: 'Materiaali', exact: true }).click();
  const picker = page.getByLabel('Oma osaväri', { exact: true });
  for (const color of ['#2244bb', '#ffffff', '#2244bb']) {
    const uploads = Number(await canvas.getAttribute('data-trace-material-uploads'));
    await picker.fill(color);
    await expect
      .poll(async () => Number(await canvas.getAttribute('data-trace-material-uploads')))
      .toBeGreaterThan(uploads);
    await expect(status).toContainText('Tavoite saavutettu', { timeout: 120000 });
    expect(await pixels(color === '#ffffff' ? 'warm' : 'blue')).toBeGreaterThan(1000);
    await expect(canvas).toHaveAttribute('data-trace-scene-builds', builds!);
  }
  await page.getByRole('button', { name: 'Käytä väriä', exact: true }).click();
  expect((await save(page)).bodies[0]).toMatchObject({
    color: '#2244bb',
    appearance: { textureTint: 'colorize' },
  });
  await expect(status).toContainText('Tavoite saavutettu', { timeout: 120000 });
  await canvas.screenshot({ path: info.outputPath('tinted-pine-traced.png') });
});
