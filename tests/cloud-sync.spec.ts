import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { ready } from './helpers';
import { makeBody } from '../src/model/project';
import type { CloudHead } from '../src/cloud/types';
test.skip(
  ({ baseURL }) => !baseURL?.includes(':5183'),
  'Run with the isolated cloud fixture server.',
);
const alice = '11111111-1111-4111-8111-111111111111',
  bob = '22222222-2222-4222-8222-222222222222';
async function account(context: BrowserContext, owner: string) {
  const encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: owner, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 7200 })}.fixture`;
  await context.addInitScript(
    ({ owner, token }) =>
      localStorage.setItem(
        'nivo-cloud-auth',
        JSON.stringify({
          access_token: token,
          refresh_token: 'fixture',
          token_type: 'bearer',
          expires_in: 7200,
          expires_at: Math.floor(Date.now() / 1000) + 7200,
          user: {
            id: owner,
            email: owner.slice(0, 4) + '@example.test',
            aud: 'authenticated',
            role: 'authenticated',
          },
        }),
      ),
    { owner, token },
  );
}
async function library(page: Page) {
  await page.getByRole('button', { name: 'Projektikirjasto', exact: true }).click();
  return page.getByRole('dialog', { name: 'Projektikirjasto', exact: true });
}
test('two devices, offline edits, conflict preservation, restart and account isolation', async ({
  browser,
  page,
  context,
}) => {
  const heads = new Map<string, CloudHead>(),
    files = new Map<string, string>();
  async function backend(c: BrowserContext) {
    await c.route('https://nivo-cloud.test/**', async (route) => {
      const req = route.request(),
        url = new URL(req.url());
      const token = req.headers().authorization?.split(' ')[1];
      let owner = '';
      try {
        owner = JSON.parse(Buffer.from(token!.split('.')[1], 'base64url').toString()).sub;
      } catch {}
      const respond = (value: unknown, status = 200) =>
        route.fulfill({
          status,
          contentType: 'application/json',
          body: JSON.stringify(value),
          headers: { 'access-control-allow-origin': '*' },
        });
      if (req.method() === 'OPTIONS')
        return route.fulfill({
          status: 200,
          headers: {
            'access-control-allow-origin': '*',
            'access-control-allow-headers': '*',
            'access-control-allow-methods': '*',
          },
        });
      if (url.pathname.startsWith('/storage/v1/object/')) {
        const path = url.pathname.split('/nivo-projects/')[1];
        if (!path?.startsWith(owner + '/')) return respond({ message: 'Forbidden' }, 403);
        if (req.method() === 'POST') {
          const form = await new Response(new Uint8Array(req.postDataBuffer()!).buffer, {
            headers: { 'content-type': req.headers()['content-type'] },
          }).formData();
          files.set(path, await (form.get('') as File).text());
          return respond({ Key: 'nivo-projects/' + path });
        }
        const data = files.get(path);
        return data
          ? route.fulfill({ contentType: 'application/json', body: data })
          : respond({ message: 'Missing' }, 404);
      }
      if (url.pathname === '/rest/v1/nivo_projects') {
        const id = url.searchParams.get('id')?.replace('eq.', '');
        return respond(
          [...heads.entries()]
            .filter(([key, h]) => key.startsWith(owner + '/') && (!id || h.id === id))
            .map(([, h]) => h),
        );
      }
      if (url.pathname === '/rest/v1/rpc/nivo_commit_project') {
        const p = req.postDataJSON();
        if (p.p_owner !== owner) return respond({ message: 'Forbidden' }, 403);
        const key = owner + '/' + p.p_id,
          old = heads.get(key);
        if ((old?.revision ?? 0) !== p.p_expected) return respond([]);
        const h = {
          id: p.p_id,
          name: p.p_name,
          revision: p.p_expected + 1,
          hash: p.p_hash,
          object_path: p.p_path,
          updated_at: new Date().toISOString(),
          parts: p.p_parts,
        };
        heads.set(key, h);
        return respond([h]);
      }
      if (url.pathname === '/auth/v1/logout') return respond({});
      return respond({ message: 'Unhandled ' + url.pathname }, 404);
    });
  }
  await account(context, alice);
  await backend(context);
  await ready(page, [makeBody(200, 18, 600)]);
  const name = page.getByLabel('Projektin nimi', { exact: true });
  await name.fill('Pilvitesti');
  await name.press('Enter');
  const a = await library(page);
  await a.getByRole('button', { name: 'Synkronoi tämä projekti', exact: true }).click();
  await expect(a.getByText('Tallessa pilvessä', { exact: true })).toBeVisible();
  expect(heads.size).toBe(1);
  await a.getByRole('button', { name: 'Sulje kirjasto' }).click();
  const bContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  await account(bContext, alice);
  await backend(bContext);
  const b = await bContext.newPage();
  await ready(b);
  const bLib = await library(b);
  await expect(bLib.locator('.cloud-project-row')).toHaveCount(1);
  await bLib
    .locator('.cloud-project-row')
    .getByRole('button', { name: 'Avaa', exact: true })
    .click();
  await expect(b.getByLabel('Projektin nimi', { exact: true })).toHaveValue('Pilvitesti');
  await expect(bLib).toHaveCount(0);
  await expect(b.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '1');
  await bContext.setOffline(true);
  await b.getByLabel('Projektin nimi', { exact: true }).fill('MacBook offline');
  await b.getByLabel('Projektin nimi', { exact: true }).press('Enter');
  await expect(b.locator('.save-status')).toContainText('Tallessa');
  await name.fill('Desktop uudempi');
  await name.press('Enter');
  await library(page);
  await page.getByRole('button', { name: 'Synkronoi nyt', exact: true }).click();
  await expect(page.getByText('Tallessa pilvessä', { exact: true })).toBeVisible();
  await bContext.setOffline(false);
  await library(b);
  await b.getByRole('button', { name: 'Synkronoi nyt', exact: true }).click();
  await expect(
    b.getByText('Projektia on muutettu myös toisella laitteella.', { exact: true }),
  ).toBeVisible();
  await b.getByRole('button', { name: 'Säilytä tämäkin versio pilvessä', exact: true }).click();
  await expect.poll(() => heads.size).toBe(2);
  expect([...heads.values()].some((h) => h.name === 'Desktop uudempi')).toBe(true);
  await b.reload();
  await expect(b.getByLabel('Projektin nimi', { exact: true })).toHaveValue(
    'MacBook offline · rinnakkainen versio',
  );
  await library(b);
  await expect(b.getByRole('button', { name: 'Synkronoi nyt', exact: true })).toBeVisible();
  await b.screenshot({ path: test.info().outputPath('cloud-projects.png') });
  await bContext.close();
  const other = await browser.newContext();
  await account(other, bob);
  await backend(other);
  const c = await other.newPage();
  await ready(c);
  await library(c);
  await expect(c.locator('.cloud-project-row')).toHaveCount(0);
  await expect(
    c.getByRole('button', { name: 'Synkronoi tämä projekti', exact: true }),
  ).toBeVisible();
  await other.close();
});
