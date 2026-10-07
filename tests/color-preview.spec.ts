import { expect, test } from '@playwright/test';
import { ready, save, view } from './helpers';
import { makeBody } from '../src/model/project';
import { defaultAppearance, findPreset } from '../src/model/materials';
import { asComponent } from '../src/model/components';
import { decode } from 'fast-png';

function maxPixelDifference(a: Buffer, b: Buffer) {
  const first = decode(a),
    second = decode(b);
  expect([first.width, first.height, first.channels]).toEqual([
    second.width,
    second.height,
    second.channels,
  ]);
  let difference = 0;
  for (let i = 0; i < first.data.length; i++)
    difference = Math.max(difference, Math.abs(first.data[i] - second.data[i]));
  return difference;
}

test('texture tint previews every input without geometry work, cancels, and commits as one shared edit', async ({
  page,
}, info) => {
  const body = asComponent({
    ...makeBody(400, 300, 40),
    color: findPreset('pine').color,
    appearance: defaultAppearance('pine'),
  });
  const copy = {
    ...asComponent(makeBody(400, 300, 40), body.component!.id),
    color: body.color,
    appearance: body.appearance,
    origin: [500, 0, 0] as [number, number, number],
  };
  await ready(page, [body, copy]);
  await page.getByTestId(`body-${body.id}`).click();
  await view(page, [body, copy]);
  await page.locator('.model-materials > summary').click();
  const canvas = page.getByTestId('viewport');
  const builds = await canvas.getAttribute('data-geometry-builds');
  const original = await canvas.screenshot({ path: info.outputPath('original.png') });
  const picker = page.getByLabel('Tekstuurin sävy', { exact: true });
  await picker.fill('#2266aa');
  const blue = await canvas.screenshot();
  expect(blue.equals(original)).toBe(false);
  expect((await save(page)).bodies.map((b) => b.color)).toEqual([body.color, body.color]);
  await picker.fill('#bb4422');
  expect((await canvas.screenshot()).equals(blue)).toBe(false);
  await expect(canvas).toHaveAttribute('data-geometry-builds', builds!);
  await picker.press('Escape');
  await expect(picker).toHaveValue(body.color);
  // Native GPU compositing can differ by 1–2 levels in the translucent list;
  // compare decoded pixels rather than requiring identical PNG bytes.
  expect(
    maxPixelDifference(
      await canvas.screenshot({ path: info.outputPath('restored.png') }),
      original,
    ),
  ).toBeLessThanOrEqual(2);
  await picker.fill('#2266aa');
  await picker.fill('#668899');
  await page.getByRole('button', { name: 'Käytä sävyä', exact: true }).click();
  expect((await save(page)).bodies.map((b) => b.color)).toEqual(['#668899', '#668899']);
  await expect(picker).toHaveValue('#668899');
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies.map((b) => b.color)).toEqual([body.color, body.color]);
  await expect(canvas).toHaveAttribute('data-geometry-builds', builds!);
});

test('render tint previews before Apply and Escape restores the original material', async ({
  page,
}, info) => {
  const body = { ...makeBody(400, 300, 40), appearance: defaultAppearance('pine') };
  await ready(page, [body]);
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  const canvas = page.getByTestId('render-canvas');
  const original = await canvas.screenshot();
  const picker = page.getByLabel('Oma osaväri', { exact: true });
  await picker.fill('#2288aa');
  const blue = await canvas.screenshot();
  expect(blue.equals(original)).toBe(false);
  await picker.fill('#bb5533');
  expect((await canvas.screenshot()).equals(blue)).toBe(false);
  expect((await save(page)).bodies[0].color).toBe(body.color);
  await picker.press('Escape');
  await expect(picker).toHaveValue(body.color);
  expect((await canvas.screenshot()).equals(original)).toBe(true);
  await picker.fill('#2288aa');
  await page.screenshot({ path: info.outputPath('live-render-tint.png') });
  await page.getByRole('button', { name: 'Käytä väriä', exact: true }).click();
  expect((await save(page)).bodies[0].color).toBe('#2288aa');
  await expect(picker).toHaveValue('#2288aa');
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies[0].color).toBe(body.color);
});

test('progressive rendering refines the live tint without waiting for Apply', async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== 'desktop',
    'The material preview controls are covered separately on tablet.',
  );
  test.setTimeout(150000);
  await ready(page, [{ ...makeBody(400, 300, 40), appearance: defaultAppearance('pine') }]);
  // An already-open app must still start tracing after a deployment removes old
  // lazy chunks. No additional JavaScript should be needed at this point.
  const lateModules: string[] = [];
  await page.route('**/*.js', (route) => {
    lateModules.push(route.request().url());
    return route.abort();
  });
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Renderöinnin asetukset' });
  await panel.getByRole('button', { name: 'Kuva', exact: true }).click();
  await panel.getByRole('button', { name: 'Tarkentuva', exact: true }).click();
  await panel.getByLabel('Tarkennuksen tavoite', { exact: true }).selectOption('8');
  await expect(page.getByTestId('trace-status')).toContainText('Tavoite saavutettu', {
    timeout: 120000,
  });
  await panel.getByRole('button', { name: 'Materiaali', exact: true }).click();
  const canvas = page.getByTestId('render-canvas');
  const original = await canvas.screenshot();
  const uploads = await canvas.getAttribute('data-trace-material-uploads');
  const beforeCamera = await canvas.getAttribute('data-camera');
  const rect = (await canvas.boundingBox())!;
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down({ button: 'right' });
  for (let i = 1; i <= 10; i++)
    await page.mouse.move(rect.x + rect.width / 2 + i * 8, rect.y + rect.height / 2 + i * 3);
  await expect(canvas).toHaveAttribute('data-trace-interactive', 'true');
  await expect(canvas).not.toHaveAttribute('data-camera', beforeCamera!);
  await expect(canvas).toHaveAttribute('data-trace-samples', '0');
  await page.mouse.up({ button: 'right' });
  await expect(canvas).toHaveAttribute('data-trace-material-uploads', uploads!);
  await expect(page.getByTestId('trace-status')).toContainText('Tavoite saavutettu', {
    timeout: 120000,
  });
  await page.getByLabel('Oma osaväri', { exact: true }).fill('#2277bb');
  await expect(page.getByTestId('trace-status')).toContainText('Tavoite saavutettu', {
    timeout: 120000,
  });
  expect(
    (await canvas.screenshot({ path: info.outputPath('live-traced-tint.png') })).equals(original),
  ).toBe(false);
  await expect(page.getByRole('button', { name: 'Käytä väriä', exact: true })).toBeEnabled();
  expect(lateModules).toEqual([]);
});
