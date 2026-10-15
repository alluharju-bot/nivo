import { test, expect } from '@playwright/test';
import { makeBody } from '../src/model/project';
import { defaultAppearance, findPreset } from '../src/model/materials';
import { ready, save } from './helpers';

test('gel optics survive edits, undo, reload and switching between modeling and progressive rendering', async ({
  page,
}, info) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  const body = {
    ...makeBody(120, 60, 100),
    color: '#ffffff',
    appearance: defaultAppearance('abs-matte'),
  };
  await ready(page, [body]);
  await page.getByTestId(`body-${body.id}`).click();
  await page.locator('.model-materials > summary').click();
  await page.getByLabel('Osan materiaali', { exact: true }).selectOption('gel-amber');
  await page.getByText('Läpäisy ja sisäinen sävy', { exact: true }).click();
  await expect(page.getByLabel('Taittokerroin', { exact: true })).toHaveValue('1.4');
  await page.getByLabel('Taittokerroin', { exact: true }).fill('1.37');
  await page.getByLabel('Taittokerroin', { exact: true }).press('Enter');
  const distance = page.getByLabel('Sävyn syvyys (mm)', { exact: true });
  await distance.fill('25');
  await distance.press('Enter');
  await page.getByLabel('Sisäinen sävy', { exact: true }).fill('#88ccff');
  await page.getByRole('button', { name: 'Käytä sisäistä sävyä', exact: true }).click();
  let saved = await save(page);
  expect(saved.bodies[0]).toMatchObject({
    feature: body.feature,
    color: findPreset('gel-amber').color,
    appearance: {
      preset: 'gel-amber',
      ior: 1.37,
      attenuationDistance: 25,
      attenuationColor: '#88ccff',
    },
  });
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  await expect(page.getByLabel('Sisäinen sävy', { exact: true })).toHaveValue(
    findPreset('gel-amber').attenuationColor!,
  );
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  await distance.fill('-1');
  await distance.press('Enter');
  await expect(distance).toHaveValue('25');
  await expect(page.locator('.save-status')).toContainText('Tallessa');
  await page.reload();
  await page.getByRole('button', { name: 'Renderöi', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Renderöinnin asetukset' });
  await panel.getByText('Läpäisy ja sisäinen sävy', { exact: true }).click();
  await expect(panel.getByLabel('Taittokerroin', { exact: true })).toHaveValue('1.37');
  await expect(panel.getByLabel('Sisäinen sävy', { exact: true })).toHaveValue('#88ccff');
  await page.screenshot({ path: info.outputPath('gel-preview.png') });
  await panel.getByRole('button', { name: 'Kuva', exact: true }).click();
  await panel.getByLabel('Tarkennuksen tavoite', { exact: true }).selectOption('8');
  await expect(page.getByTestId('trace-status')).toContainText('Tavoite saavutettu', {
    timeout: 120000,
  });
  await expect(page.getByTestId('render-canvas')).toHaveAttribute('data-trace-opacity', '1');
  await page.screenshot({ path: info.outputPath('gel-traced.png') });
  await panel.getByRole('button', { name: 'Materiaali', exact: true }).click();
  await panel.getByRole('button', { name: 'Palauta läpäisyn oletukset', exact: true }).click();
  await expect(panel.getByLabel('Taittokerroin', { exact: true })).toHaveValue('1.4');
  saved = await save(page);
  expect(saved.bodies[0].appearance).toEqual(defaultAppearance('gel-amber'));
  expect(saved.bodies[0].feature).toEqual(body.feature);
  expect(errors).toEqual([]);
});

test('paint palette exposes plastics and aerogel with the same optical controls', async ({
  page,
}) => {
  await ready(page);
  await page.getByTestId('viewport').click();
  await page.keyboard.press('p');
  const palette = page.getByRole('region', { name: 'Maalipensselin paletti' });
  await palette.getByLabel('Pensselin materiaali').selectOption('polycarbonate-clear');
  await palette.getByText('Läpäisy ja sisäinen sävy', { exact: true }).click();
  await expect(palette.getByLabel('Taittokerroin')).toHaveValue('1.58');
  await palette.getByLabel('Pensselin materiaali').selectOption('aerogel');
  await expect(
    palette.getByText('Aerogeelin sameus on pinta-arvio.', { exact: false }),
  ).toBeVisible();
  await palette.getByText('Läpäisy ja sisäinen sävy', { exact: true }).click();
  await expect(palette.getByLabel('Taittokerroin')).toHaveValue('1.04');
});
