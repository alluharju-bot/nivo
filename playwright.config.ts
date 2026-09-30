import { defineConfig, devices } from '@playwright/test';

const preview = process.env.NIVO_PREVIEW === '1';
const url = preview ? 'http://127.0.0.1:4173' : 'http://127.0.0.1:5173';
export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  expect: { timeout: 15_000 },
  use: { baseURL: url, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 960 } },
    },
    { name: 'tablet', use: { ...devices['iPad Pro 11 landscape'], browserName: 'chromium' } },
  ],
  webServer: {
    command: preview ? 'npm run preview -- --port 4173' : 'npm run dev -- --port 5173',
    url,
    reuseExistingServer: !process.env.CI,
  },
});
