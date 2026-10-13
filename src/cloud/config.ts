export type CloudConfiguration =
  | { kind: 'disabled' }
  | { kind: 'invalid'; error: string }
  | { kind: 'ready'; url: string; key: string };

/** Browser configuration must never accept a privileged Supabase key. */
export function cloudConfiguration(url = '', key = ''): CloudConfiguration {
  url = url.trim();
  key = key.trim();
  if (!url && !key) return { kind: 'disabled' };
  if (!url || !key)
    return {
      kind: 'invalid',
      error: 'Pilviasetuksista puuttuu Supabase-osoite tai julkinen avain.',
    };
  try {
    const parsed = new URL(url);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    if (
      (parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:')) ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      parsed.pathname !== '/'
    )
      throw new Error('url');
    url = parsed.origin;
  } catch {
    return { kind: 'invalid', error: 'Supabase-osoitteen pitää olla palvelun HTTPS-osoite.' };
  }
  let publicKey = /^sb_publishable_[a-zA-Z0-9_-]+$/.test(key);
  if (!publicKey && key.split('.').length === 3) {
    try {
      const payload = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      publicKey = payload.role === 'anon';
    } catch {
      /* Invalid or privileged keys never become browser configuration. */
    }
  }
  if (!publicKey)
    return {
      kind: 'invalid',
      error:
        'Nivon selainasetuksiin sallitaan vain publishable- tai anon-avain. Ylläpitoavainta ei saa julkaista.',
    };
  return { kind: 'ready', url, key };
}
