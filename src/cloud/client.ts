import type { SupabaseClient } from '@supabase/supabase-js';
import { cloudConfiguration } from './config';
const configuration = cloudConfiguration(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
);
export const cloudConfigured = configuration.kind === 'ready';
export const cloudServer = configuration.kind === 'ready' ? configuration.url : '';
let client: Promise<SupabaseClient> | undefined;
export function cloudClient() {
  if (configuration.kind !== 'ready')
    throw new Error(
      configuration.kind === 'invalid'
        ? configuration.error
        : 'Nivon pilvipalvelua ei ole vielä yhdistetty.',
    );
  return (client ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(configuration.url, configuration.key, {
      auth: {
        storageKey: 'nivo-cloud-auth',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    }),
  ));
}
