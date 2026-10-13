import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { cloudConfiguration } from './src/cloud/config.ts';

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), 'VITE_SUPABASE_'), ...process.env };
  const cloud = cloudConfiguration(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY);
  if (cloud.kind === 'invalid') throw new Error(cloud.error);
  return {
    base: process.env.NIVO_BASE_PATH ?? '/',
    define: {
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(process.env.npm_package_version ?? 'dev'),
    },
    plugins: [react()],
    worker: { format: 'es' },
    optimizeDeps: { exclude: ['replicad-opencascadejs'] },
    test: { include: ['src/**/*.test.ts'] },
  };
});
