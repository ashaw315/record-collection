import { defineConfig, devices } from '@playwright/test';

/* The font probe alone, in the two browsers the suites use (e2e/font-probe.capture.ts). */
const PORT = 3100;
export default defineConfig({
  testDir: './e2e',
  testMatch: /font-probe\.capture\.ts$/,
  workers: 1,
  retries: 0,
  reporter: 'line',
  use: { baseURL: `http://localhost:${PORT}` },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'chromium-unhinted', use: { ...devices['Desktop Chrome'], launchOptions: { args: ['--font-render-hinting=none'] } } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], deviceScaleFactor: 1 } },
  ],
  webServer: { command: `NODE_ENV=test npm run dev -- --port ${PORT}`, url: `http://localhost:${PORT}/login`, timeout: 120_000, reuseExistingServer: false, stdout: 'ignore', stderr: 'pipe' },
});
