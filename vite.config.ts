import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: process.env.NIVO_BASE_PATH ?? '/',
  plugins: [react()],
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['replicad-opencascadejs'] },
  test: { include: ['src/**/*.test.ts'] },
});
