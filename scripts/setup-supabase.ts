import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { cloudConfiguration } from '../src/cloud/config.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
export const siteUrl = 'https://alluharju-bot.github.io/nivo/';
export const redirectUrls = [siteUrl, 'http://127.0.0.1:5173/', 'http://localhost:5173/'];
type Request = (path: string, method?: string, body?: unknown) => Promise<any>;

export function managementApi(token: string, fetcher = fetch): Request {
  if (!token.trim())
    throw new Error(
      'SUPABASE_ACCESS_TOKEN puuttuu. Yhdistä Supabase tai aseta hallinta-API:n käyttöavain paikallisesti.',
    );
  return async (path, method = 'GET', body) => {
    const response = await fetcher(`https://api.supabase.com/v1${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(180_000),
    });
    // Never print server response bodies: auth configuration can contain secrets.
    if (!response.ok) throw new Error(`Supabase ${method} ${path}: HTTP ${response.status}.`);
    return response.status === 204 ? undefined : response.json();
  };
}

export async function setupSupabase(ref: string, api: Request, apply = false) {
  if (!/^[a-z0-9]{20}$/.test(ref))
    throw new Error('Anna Nivon Supabase-projektin 20-merkkinen tunniste.');
  const base = `/projects/${ref}`;
  const project = await api(base);
  if (!/^nivo(?:$|[\s_-])/i.test(project.name ?? ''))
    throw new Error(
      'Valittu projekti ei ole Nivon oma projekti. Muiden sovellusten asetuksia ei muutettu.',
    );
  if (project.status !== 'ACTIVE_HEALTHY')
    throw new Error('Supabase-projekti ei ole vielä käyttövalmis.');
  const [history, auth] = await Promise.all([
    api(`${base}/database/migrations`),
    api(`${base}/config/auth`),
  ]);
  if (!Array.isArray(history)) throw new Error('Migraatiohistorian vastaus ei ollut kelvollinen.');
  const files = (await readdir(resolve(root, 'supabase/migrations')))
    .filter((n) => /^\d+_.+\.sql$/.test(n))
    .sort();
  const pending = files.filter((file) => {
    const stem = file.replace(/\.sql$/, ''),
      split = stem.indexOf('_');
    return !history.some(
      (m) => m.version === stem.slice(0, split) || [stem, stem.slice(split + 1)].includes(m.name),
    );
  });
  const report = {
    project: project.name as string,
    ref,
    pending,
    smtpConfigured: !!auth.smtp_host,
    applied: false,
  };
  if (!apply) return { ...report, configuration: undefined };
  for (const file of pending) {
    await api(`${base}/database/migrations`, 'POST', {
      name: file.replace(/\.sql$/, ''),
      query: await readFile(resolve(root, 'supabase/migrations', file), 'utf8'),
    });
  }
  const template = await readFile(resolve(root, 'supabase/templates/sign-in.html'), 'utf8');
  const allow = [
    ...new Set([
      ...String(auth.uri_allow_list ?? '')
        .split(',')
        .filter(Boolean),
      ...redirectUrls,
    ]),
  ];
  await api(`${base}/config/auth`, 'PATCH', {
    site_url: siteUrl,
    uri_allow_list: allow.join(','),
    external_email_enabled: true,
    mailer_autoconfirm: false,
    disable_signup: false,
    mailer_subjects_magic_link: 'Kirjaudu Nivoon',
    mailer_subjects_confirmation: 'Tervetuloa Nivoon',
    mailer_templates_magic_link_content: template,
    mailer_templates_confirmation_content: template,
  });
  const keys = await api(`${base}/api-keys`);
  if (!Array.isArray(keys)) throw new Error('Julkisten avainten vastaus ei ollut kelvollinen.');
  let key = keys.find((k) => k.type === 'publishable' && k.api_key?.startsWith('sb_publishable_'));
  if (!key) {
    if (keys.some((k) => k.name === 'nivo_browser'))
      throw new Error('Nivon julkinen avain on olemassa, mutta sitä ei voitu lukea.');
    key = await api(`${base}/api-keys`, 'POST', { name: 'nivo_browser', type: 'publishable' });
  }
  const configuration = cloudConfiguration(`https://${ref}.supabase.co`, key?.api_key);
  if (configuration.kind !== 'ready')
    throw new Error('Supabase ei palauttanut kelvollista julkista selainavainta.');
  // Read back the applied settings before preparing any browser deployment.
  const verified = await api(`${base}/config/auth`);
  if (
    verified.site_url !== siteUrl ||
    !verified.external_email_enabled ||
    verified.mailer_autoconfirm ||
    !redirectUrls.every((url) => String(verified.uri_allow_list).split(',').includes(url)) ||
    !verified.mailer_templates_magic_link_content?.includes('{{ .Token }}') ||
    !verified.mailer_templates_confirmation_content?.includes('{{ .Token }}')
  )
    throw new Error('Kirjautumisasetusten tarkistus epäonnistui. Selainasetuksia ei julkaistu.');
  return { ...report, applied: true, configuration };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log(
      'SUPABASE_ACCESS_TOKEN=… NIVO_SUPABASE_PROJECT_REF=… npm run cloud:setup [-- --apply --github]\nOletus tarkistaa asetukset. --apply ajaa migraatiot ja kirjautumisasetukset Nivon omassa projektissa sekä kirjoittaa julkiset arvot .env.local-tiedostoon. --github asettaa samat arvot Nivon GitHub Actions Variables -asetuksiin. Ei luo maksullista projektia eikä muuta SMTP-tunnuksia.',
    );
    return;
  }
  if (
    args.some((a) => !['--apply', '--github'].includes(a)) ||
    (args.includes('--github') && !args.includes('--apply'))
  )
    throw new Error('Sallitut valinnat ovat --apply ja sen kanssa --github.');
  const report = await setupSupabase(
    process.env.NIVO_SUPABASE_PROJECT_REF ?? '',
    managementApi(process.env.SUPABASE_ACCESS_TOKEN ?? ''),
    args.includes('--apply'),
  );
  const { configuration, ...summary } = report;
  console.log(JSON.stringify(summary, null, 2));
  if (!report.smtpConfigured)
    console.log(
      'SMTP puuttuu: oletuspalvelu lähettää kirjautumisviestejä vain Supabase-tiimin osoitteisiin.',
    );
  if (!configuration) return;
  const variables = {
    VITE_SUPABASE_URL: configuration.url,
    VITE_SUPABASE_PUBLISHABLE_KEY: configuration.key,
  };
  const envPath = resolve(root, '.env.local');
  let existing = '';
  try {
    existing = await readFile(envPath, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
  const lines = existing
    .split(/\r?\n/)
    .filter((line) => !/^\s*(?:export\s+)?VITE_SUPABASE_(URL|PUBLISHABLE_KEY)\s*=/.test(line));
  await writeFile(
    envPath,
    lines.join('\n').trimEnd() +
      '\n' +
      Object.entries(variables)
        .map(([k, v]) => `${k}=${v}`)
        .join('\n') +
      '\n',
    { mode: 0o600 },
  );
  if (args.includes('--github'))
    for (const [name, value] of Object.entries(variables)) {
      const result = spawnSync('gh', ['variable', 'set', name, '--repo', 'alluharju-bot/nivo'], {
        input: value,
        encoding: 'utf8',
      });
      if (result.status !== 0) throw new Error(`GitHub-asetusta ${name} ei voitu tallentaa.`);
    }
  console.log(
    'Nivon julkiset selainasetukset tallennettu. Käynnistä paikallinen palvelin tai Pages-build uudelleen.',
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
