import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  testMatch: 'cloud-sync.spec.ts',
  timeout: 90000,
  workers: 1,
  expect: { timeout: 15000 },
  use: {
    baseURL: 'http://127.0.0.1:5183',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 960 } },
    },
  ],
  webServer: {
    command: 'npm run dev -- --port 5183 --strictPort',
    url: 'http://127.0.0.1:5183',
    reuseExistingServer: false,
    env: {
      VITE_SUPABASE_URL: 'https://nivo-cloud.test',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_fixture',
    },
  },
});
