// playwright.config.js — ADR-0030 v0.18.0 visual tests.
// Uses system chromium-browser (no playwright-managed binary download).
// Set executablePath to your chromium location if different.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/server',
  testMatch: /(sidebar|subnav)\.spec\.js$/,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false, // shared DB — sequential
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:7342',
    headless: true,
    launchOptions: {
      // Use system chromium-browser (no ~120MB playwright binary download).
      executablePath: process.env.PLAYWRIGHT_CHROMIUM ||
        '/usr/bin/google-chrome',
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    },
    trace: 'off',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    // Spawn a fresh vcm-server on a separate port so visual tests
    // don't collide with the persistent systemd vcm-server (7340).
    command: 'VCM_SERVER_PORT=7342 VCM_SERVER_DB=/tmp/vcm-playwright.db ' +
             '.venv/bin/python3 server/app.py',
    cwd: '.',
    url: 'http://127.0.0.1:7342/api/health',
    timeout: 30_000,
    reuseExistingServer: false,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});