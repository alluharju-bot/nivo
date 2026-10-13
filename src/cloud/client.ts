import type { SupabaseClient } from '@supabase/supabase-js';
const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
export const cloudConfigured = !!url && !!key;
export const cloudServer = url ?? '';
let client: Promise<SupabaseClient> | undefined;
export function cloudClient() {
  if (!cloudConfigured) throw new Error('Nivon pilvipalvelua ei ole vielä yhdistetty.');
  return (client ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(url!, key!, {
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
