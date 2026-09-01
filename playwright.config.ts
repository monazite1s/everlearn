/**
 * @fileoverview 以确定的本地启动流程运行浏览器验收并保留失败产物。
 */

import { defineConfig, devices } from '@playwright/test';

import { E2E_API_ORIGIN } from './tests/e2e/environment';

const isContinuousIntegration = process.env.CI === 'true';

export default defineConfig({
  expect: { timeout: 5_000 },
  forbidOnly: isContinuousIntegration,
  globalTimeout: 600_000,
  outputDir: 'test-results',
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  retries: isContinuousIntegration ? 2 : 0,
  testDir: 'tests/e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:3100',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command:
      'node apps/web/node_modules/next/dist/bin/next start apps/web --hostname 127.0.0.1 --port 3100',
    env: { ...process.env, API_INTERNAL_URL: E2E_API_ORIGIN },
    reuseExistingServer: !isContinuousIntegration,
    stderr: 'pipe',
    stdout: 'pipe',
    timeout: 120_000,
    url: 'http://127.0.0.1:3100',
  },
});
