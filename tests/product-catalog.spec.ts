import { test, expect, type Page } from '@playwright/test';
import { ready, save } from './helpers';
import { makeBody } from '../src/model/project';

async function catalog(page: Page) {
  await page.getByRole('button', { name: 'Projektikirjasto', exact: true }).click();
  const library = page.getByRole('dialog', { name: 'Projektikirjasto', exact: true });
  await library.getByRole('button', { name: 'Tuotekirjasto', exact: true }).click();
  return library;
}

test('searches product codes, places a measured mounting volume and restores metadata with undo and reload', async ({
  page,
}, info) => {
  await ready(page, [makeBody(600, 500, 30, [-300, -250, -30], 'Työtaso')]);
  const library = await catalog(page);
  await library.getByLabel('Hae tuotteita').fill('79934');
  await expect(library.locator('.product-card')).toHaveCount(1);
  await library
    .getByRole('button', { name: 'Avaa tuote SAVO / Bachmann TWIST', exact: true })
    .click();
  await library.getByLabel('Tuoteversio').selectOption('2');
  await expect(library).toContainText('Ø 105 mm');
  await expect(library.getByRole('link', { name: 'Tuotetiedot ja lataukset' })).toHaveAttribute(
    'href',
    'https://savo.fi/tuote/pistorasia-twist/',
  );
  await library.screenshot({ path: info.outputPath('product-twist.png') });
  await library.getByRole('button', { name: 'Lisää upotustila', exact: true }).click();
  await expect(library).toBeHidden();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '2');
  await page.keyboard.press('Escape');
  let p = await save(page);
  expect(p.bodies[1].origin).toEqual([-52.5, -52.5, -40]);
  expect(p.bodies[1].feature.height).toBe(40);
  expect(p.bodies[1].product?.article).toBe('79934');
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toHaveLength(1);
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  await expect(page.locator('.save-status')).toContainText('Tallessa selaimessa');
  await page.reload();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '2');
  p = await save(page);
  expect(p.bodies[1].product?.catalogKey).toBe('savo-twist');
});

test('keeps filters and distinguishes source-only entries from verified installation geometry', async ({
  page,
}, info) => {
  await ready(page);
  const library = await catalog(page);
  await library.getByLabel('Valmistaja', { exact: true }).selectOption('Hettich');
  await expect(library.locator('.product-card')).toHaveCount(7);
  await library.getByLabel('Tuoteryhmä', { exact: true }).selectOption('lighting');
  await expect(library.locator('.product-card')).toHaveCount(1);
  await library
    .getByRole('button', { name: 'Avaa tuote Hettich AvanTech YOU Illumination', exact: true })
    .click();
  await expect(library.getByRole('button', { name: 'Lisää upotustila' })).toHaveCount(0);
  await expect(library.getByRole('button', { name: 'Tuo tuotteen 3D-tiedosto' })).toBeVisible();
  await library.getByRole('button', { name: 'Takaisin tuotteisiin' }).click();
  await expect(library.getByLabel('Valmistaja', { exact: true })).toHaveValue('Hettich');
  await library.getByLabel('Hae tuotteita').fill('olematon');
  await expect(library).toContainText('Hakua vastaavia tuotteita ei löytynyt.');
  await library.getByRole('button', { name: 'Tyhjennä haku ja rajaukset' }).click();
  await expect(library.locator('.product-card')).toHaveCount(43);
  await library.screenshot({ path: info.outputPath('product-catalog.png') });
  await library.getByLabel('Hae tuotteita').fill('elevator');
  await library.locator('.product-card').click();
  await expect(library.getByRole('button', { name: 'Lisää upotustila' })).toHaveCount(0);
  await library.getByRole('button', { name: 'Lisää aukkoluonnos' }).click();
  await expect(library).toBeHidden();
  await page.keyboard.press('Escape');
  const p = await save(page);
  expect(p.bodies[0].feature.height).toBe(0);
  expect(p.bodies[0].feature.width).toBe(80);
  expect(p.bodies[0].product?.representation).toBe('opening-profile');
});

test('uses a catalog mounting profile to cut a worktop and undoes the cut without losing the product reference', async ({
  page,
}) => {
  const top = makeBody(600, 500, 30, [-300, -250, -30], 'Työtaso');
  await ready(page, [top]);
  const library = await catalog(page);
  await library.getByLabel('Hae tuotteita').fill('twist');
  await library.locator('.product-card').click();
  await library.getByRole('button', { name: 'Lisää aukkoluonnos', exact: true }).click();
  await expect(library).toBeHidden();
  await page.keyboard.press('Escape');
  const before = await save(page);
  await page.getByRole('button', { name: 'Muotoile', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Kohde: Työtaso', exact: true }).check();
  await page.getByRole('button', { name: 'Työstökappaleet 0', exact: true }).click();
  const cutter = page.getByRole('checkbox', {
    name: `Työstökappale: ${before.bodies[1].name}`,
    exact: true,
  });
  await cutter.check();
  await page.getByRole('button', { name: 'Hyväksy Cut', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Kohteet 0', exact: true })).toBeVisible();
  await page.keyboard.press('v');
  const after = await save(page);
  expect(after.bodies.find((b) => b.id === top.id)?.feature.type).toBe('brep');
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  const undone = await save(page);
  expect(undone.bodies.find((b) => b.id === top.id)?.feature).toEqual(top.feature);
  expect(undone.bodies.find((b) => b.product)?.product?.catalogKey).toBe('savo-twist');
});

const triangleSTL = Buffer.from(
  'solid sample\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 10 0 0\nvertex 0 20 0\nendloop\nendfacet\nendsolid sample',
);

test('keeps product details usable on a narrow phone and links in the keyboard focus order', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  const library = await catalog(page);
  await library.getByLabel('Hae tuotteita').fill('79930');
  await library.locator('.product-card').click();
  await expect(library.getByRole('button', { name: 'Takaisin tuotteisiin' })).toBeFocused();
  const source = library.getByRole('link', { name: 'Tuotetiedot ja lataukset' });
  await library.getByLabel('Tuoteversio').focus();
  await page.keyboard.press('Tab');
  await expect(source).toBeFocused();
  await library.getByRole('button', { name: 'Tuo tuotteen 3D-tiedosto' }).scrollIntoViewIfNeeded();
  expect(await library.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await library.screenshot({ path: info.outputPath('product-phone.png') });
  await library.getByRole('button', { name: 'Sulje kirjasto' }).click();
  await expect(library).toBeHidden();
});

test('imports a personal product model, stores it in own parts and can cancel a second import safely', async ({
  page,
}) => {
  await ready(page, [makeBody(100, 100, 20)]);
  let library = await catalog(page);
  await library.getByLabel('Hae tuotteita').fill('sensys');
  await library.locator('.product-card').click();
  await library.getByLabel('Tuotekoodi', { exact: true }).fill('Oma testimalli');
  await page
    .getByTestId('catalog-file')
    .setInputFiles({ name: 'oma-malli.stl', mimeType: 'model/stl', buffer: triangleSTL });
  const importer = page.getByRole('dialog', { name: 'Tuo tuote · Sensys', exact: true });
  await expect(importer.getByLabel('Siirrä mallin lisäämisen jälkeen')).toBeChecked();
  await importer.getByLabel('Tuonnin yksikkö').selectOption('mm');
  await importer.getByRole('button', { name: 'Lisää malliin', exact: true }).click();
  await expect(importer).toBeHidden();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '2');
  await page.keyboard.press('Escape');
  const p = await save(page);
  expect(p.bodies[1].product?.article).toBe('Oma testimalli');
  expect(p.bodies[1].product?.representation).toBe('imported-model');
  expect(p.groups.some((g) => g.kind === 'assembly')).toBe(true);
  await page.getByRole('button', { name: 'Projektikirjasto', exact: true }).click();
  library = page.getByRole('dialog', { name: 'Projektikirjasto', exact: true });
  await library.getByRole('button', { name: 'Omat osat', exact: true }).click();
  await expect(library.locator('.library-card')).toHaveCount(1);
  await expect(library.locator('.library-card')).toContainText('Sensys');
  await library.getByRole('button', { name: 'Tuotekirjasto', exact: true }).click();
  await library.getByLabel('Hae tuotteita').fill('twist');
  await library.locator('.product-card').click();
  await page
    .getByTestId('catalog-file')
    .setInputFiles({ name: 'cancel.stl', mimeType: 'model/stl', buffer: triangleSTL });
  await page
    .getByRole('dialog', { name: 'Tuo tuote · TWIST', exact: true })
    .getByRole('button', { name: 'Peruuta' })
    .click();
  await expect(library.getByRole('button', { name: 'Sulje kirjasto' })).toBeEnabled();
  await library.getByRole('button', { name: 'Sulje kirjasto' }).click();
  expect((await save(page)).bodies).toEqual(p.bodies);
});
