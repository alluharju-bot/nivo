import { expect, it, vi } from 'vitest';
import { setupSupabase, managementApi, siteUrl } from '../../scripts/setup-supabase';

const ref = 'abcdefghijklmnopqrst';
function backend(name = 'Nivo') {
  const history: { name: string; version: string }[] = [];
  let auth: Record<string, unknown> = {
    uri_allow_list: 'http://localhost:5173/',
    smtp_host: 'smtp.example.test',
  };
  const keys = [{ type: 'secret', api_key: 'sb_secret_do_not_publish', name: 'server' }];
  const api = vi.fn(async (path: string, method = 'GET', body?: any): Promise<any> => {
    if (path === `/projects/${ref}`) return { name, status: 'ACTIVE_HEALTHY' };
    if (path.endsWith('/database/migrations')) {
      if (method === 'POST') history.push({ name: body.name, version: 'server_timestamp' });
      return history;
    }
    if (path.endsWith('/config/auth')) {
      if (method === 'PATCH') auth = { ...auth, ...body };
      return auth;
    }
    if (path.endsWith('/api-keys')) {
      if (method === 'POST') {
        const key = { ...body, api_key: 'sb_publishable_nivo' };
        keys.push(key);
        return key;
      }
      return keys;
    }
    throw new Error(`Unexpected test request ${path}`);
  });
  return { api, history, auth: () => auth };
}
it('plans without mutation and refuses projects belonging to other applications', async () => {
  const b = backend();
  const plan = await setupSupabase(ref, b.api);
  expect(plan.pending).toContain('202610130001_nivo_cloud.sql');
  expect(plan.applied).toBe(false);
  expect(b.api.mock.calls.every(([, method]) => !method || method === 'GET')).toBe(true);
  const other = backend('Nero');
  await expect(setupSupabase(ref, other.api, true)).rejects.toThrow('ei ole Nivon');
  expect(other.api).toHaveBeenCalledTimes(1);
});
it('applies migrations once, keeps SMTP and redirect settings and returns only a public key', async () => {
  const b = backend();
  const first = await setupSupabase(ref, b.api, true);
  expect(first.configuration).toEqual({
    kind: 'ready',
    url: `https://${ref}.supabase.co`,
    key: 'sb_publishable_nivo',
  });
  expect(b.auth()).toMatchObject({
    site_url: siteUrl,
    smtp_host: 'smtp.example.test',
    mailer_autoconfirm: false,
  });
  expect(b.auth().uri_allow_list).toContain('http://localhost:5173/');
  expect(b.auth().mailer_templates_magic_link_content).toContain('{{ .Token }}');
  expect(b.auth().mailer_templates_confirmation_content).toContain('{{ .ConfirmationURL }}');
  await setupSupabase(ref, b.api, true);
  expect(
    b.api.mock.calls.filter(
      ([path, method]) => path.endsWith('/database/migrations') && method === 'POST',
    ),
  ).toHaveLength(1);
  expect(
    b.api.mock.calls.filter(([path, method]) => path.endsWith('/api-keys') && method === 'POST'),
  ).toHaveLength(1);
});
it('a failed migration prevents publishing auth or browser settings', async () => {
  const b = backend();
  const api = vi.fn(async (path: string, method = 'GET', body?: unknown) => {
    if (method === 'POST') throw new Error('Migration failed');
    return b.api(path, method, body);
  });
  await expect(setupSupabase(ref, api, true)).rejects.toThrow('Migration failed');
  expect(api.mock.calls.some(([, method]) => method === 'PATCH')).toBe(false);
});
it('does not expose secret response bodies in setup failures', async () => {
  const fetcher = vi.fn(async () => new Response('sb_secret_do_not_log', { status: 403 }));
  await expect(managementApi('private-token', fetcher)('/projects')).rejects.toThrow('HTTP 403');
  await expect(managementApi('private-token', fetcher)('/projects')).rejects.not.toThrow(
    'sb_secret',
  );
});
