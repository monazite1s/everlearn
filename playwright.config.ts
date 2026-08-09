/**
 * @fileoverview Runs the foundation browser journey with deterministic local startup and failure artifacts.
 */

import { defineConfig, devices } from '@playwright/test';

const isContinuousIntegration = process.env.CI === 'true';

export default defineConfig({
  forbidOnly: isContinuousIntegration,
  outputDir: 'test-results',
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(isContinuousIntegration ? {} : { channel: 'chrome' }),
      },
    },
  ],
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  retries: isContinuousIntegration ? 2 : 0,
  testDir: 'tests/e2e',
  use: {
    baseURL: 'http://127.0.0.1:3100',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm --filter @everlearn/web start --hostname 127.0.0.1 --port 3100',
    reuseExistingServer: !isContinuousIntegration,
    timeout: 120_000,
    url: 'http://127.0.0.1:3100',
  },
});
