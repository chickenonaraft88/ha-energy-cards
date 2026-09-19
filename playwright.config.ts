import { defineConfig } from '@playwright/test';

// Uses an installed browser, so no `playwright install` is needed.
// Set PW_CHANNEL=msedge to use Edge instead of Chrome.
export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.ts',
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    channel: process.env.PW_CHANNEL ?? 'chrome',
  },
  webServer: {
    command: 'node scripts/serve.mjs 4173',
    url: 'http://127.0.0.1:4173/preview/index.html',
    reuseExistingServer: !process.env.CI,
  },
});
