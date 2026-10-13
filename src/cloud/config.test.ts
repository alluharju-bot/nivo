import { expect, it } from 'vitest';
import { cloudConfiguration } from './config';

const url = 'https://abcdefghijklmnopqrst.supabase.co';
const jwt = (role: string) => `header.${btoa(JSON.stringify({ role }))}.signature`;
it('allows an unconfigured local app and accepts only complete public browser configuration', () => {
  expect(cloudConfiguration()).toEqual({ kind: 'disabled' });
  expect(cloudConfiguration(url, '')).toMatchObject({ kind: 'invalid' });
  expect(cloudConfiguration('', 'sb_publishable_example')).toMatchObject({ kind: 'invalid' });
  expect(cloudConfiguration(` ${url}/ `, ' sb_publishable_example ')).toEqual({
    kind: 'ready',
    url,
    key: 'sb_publishable_example',
  });
  expect(cloudConfiguration(url, jwt('anon'))).toMatchObject({ kind: 'ready' });
});
it('refuses privileged, secret, malformed and database credentials without reflecting them in an error', () => {
  for (const key of [
    'sb_secret_private_value',
    'sbp_private_value',
    jwt('service_role'),
    'not-a-key',
    'postgres://private:password@db',
  ]) {
    const result = cloudConfiguration(url, key);
    expect(result.kind).toBe('invalid');
    expect(JSON.stringify(result)).not.toContain(key);
  }
});
it('requires HTTPS in production and rejects credentials, paths and query strings', () => {
  for (const address of [
    'http://example.com',
    `${url}/rest/v1`,
    `${url}?key=value`,
    `${url}#token`,
    'https://user:secret@example.com',
    'postgres://db',
  ])
    expect(cloudConfiguration(address, 'sb_publishable_example').kind).toBe('invalid');
  expect(cloudConfiguration('http://127.0.0.1:54321', 'sb_publishable_local').kind).toBe('ready');
});
