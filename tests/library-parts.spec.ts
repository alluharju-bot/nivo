import { expect, test, type Page } from '@playwright/test';
import { freshProject, makeBody, type Project } from '../src/model/project';
import { productCatalog } from '../src/model/productCatalog';
import { importedProductProject } from '../src/model/productLibrary';
import { ready, save } from './helpers';

const file = (project: Project) => ({
  name: `${project.name}.nivo`,
  mimeType: 'application/json',
  buffer: Buffer.from(JSON.stringify(project)),
});
async function parts(page: Page) {
  await page.getByRole('button', { name: 'Projektikirjasto', exact: true }).click();
  const library = page.getByRole('dialog', { name: 'Projektikirjasto', exact: true });
  await library.getByRole('button', { name: 'Omat osat', exact: true }).click();
  return library;
}

test('imports independent reusable parts atomically without replacing the active model or its history', async ({
  page,
}) => {
  await ready(page, [makeBody(100, 60, 20, [0, 0, 0], 'Alkuperäinen')]);
  const before = await save(page);
  const name = page.getByLabel('Projektin nimi', { exact: true });
  await name.fill('Oma työ');
  await name.press('Enter');
  await expect(page.locator('.save-status')).toContainText('Tallessa');
  // Same IDs as the active model in both files: neither may overwrite the other.
  const source = importedProductProject(
    before,
    productCatalog.find((p) => p.key === 'hettich-sensys')!,
    { article: 'TEST', name: 'Testisample' },
  );
  const other = { ...before, name: 'Toinen osa' };
  let library = await parts(page);
  await library.getByTestId('library-part-files').setInputFiles([file(source), file(other)]);
  await expect(library.getByRole('status')).toHaveText('2 osaa lisätty kirjastoon.');
  await expect(library.locator('.library-card')).toHaveCount(2);
  await library.getByRole('button', { name: 'Sulje kirjasto' }).click();
  await page.reload();
  await expect(name).toHaveValue('Oma työ');
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
  expect((await save(page)).bodies).toEqual(before.bodies);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  await expect(name).toHaveValue(before.name);
  library = await parts(page);
  const card = library.locator('.library-card').filter({ hasText: 'Sensys' });
  await card.getByRole('button', { name: 'Lisää malliin', exact: true }).click();
  await expect(library).toBeHidden();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '2');
  await page.keyboard.press('Escape');
  const result = await save(page);
  const added = result.bodies.find((b) => b.id !== before.bodies[0].id)!;
  expect(added.product?.article).toBe('TEST');
  expect(result.groups.some((g) => g.kind === 'assembly')).toBe(true);
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect((await save(page)).bodies).toEqual(before.bodies);
});

test('rejects a mixed invalid batch without leaving partial library entries and accepts a corrected retry', async ({
  page,
}) => {
  await ready(page);
  const library = await parts(page);
  const valid = file({ ...freshProject(), name: 'Oma osa', bodies: [makeBody(10, 20, 30)] });
  await library
    .getByTestId('library-part-files')
    .setInputFiles([
      valid,
      { name: 'rikki.nivo', mimeType: 'application/json', buffer: Buffer.from('{broken') },
    ]);
  await expect(library.getByRole('alert')).toContainText('rikki.nivo');
  await expect(library.getByRole('alert')).toContainText('Mitään osia ei tuotu');
  await expect(library.locator('.library-card')).toHaveCount(0);
  await library.getByTestId('library-part-files').setInputFiles([valid]);
  await expect(library.getByRole('status')).toHaveText('1 osa lisätty kirjastoon.');
  await expect(library.locator('.library-card')).toHaveCount(1);
  await library.getByTestId('library-part-files').setInputFiles([file(freshProject())]);
  await expect(library.getByRole('alert')).toContainText('Tiedostossa ei ole osia');
  await expect(library.locator('.library-card')).toHaveCount(1);
});

test('keeps the parts import reachable on a phone without horizontal overflow', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  const library = await parts(page);
  await expect(library.getByRole('button', { name: 'Tuo osia kirjastoon' })).toBeVisible();
  expect(await library.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await library.screenshot({ path: info.outputPath('parts-phone.png') });
});

test('a storage transaction failure leaves no half-imported batch', async ({ page }) => {
  await ready(page, [makeBody(100, 60, 20)]);
  const original = await save(page);
  const library = await parts(page);
  await page.evaluate(() => {
    const add = IDBObjectStore.prototype.add;
    let count = 0;
    IDBObjectStore.prototype.add = function (...args) {
      const request = add.apply(this, args);
      if (this.name === 'entries' && ++count === 2) {
        this.transaction.abort();
        IDBObjectStore.prototype.add = add;
      }
      return request;
    };
  });
  await library
    .getByTestId('library-part-files')
    .setInputFiles([file({ ...original, name: 'Osa 1' }), file({ ...original, name: 'Osa 2' })]);
  await expect(library.getByRole('alert')).toContainText('Mitään osia ei tuotu');
  await expect(library.locator('.library-card')).toHaveCount(0);
  await library.getByRole('button', { name: 'Sulje kirjasto' }).click();
  await page.reload();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
  expect((await save(page)).bodies).toEqual(original.bodies);
  await parts(page);
  await expect(library.locator('.library-card')).toHaveCount(0);
});
