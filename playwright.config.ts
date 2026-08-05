import { defineConfig, devices } from '@playwright/test';

// 3100 rather than 3000, so an E2E run never collides with a dev server the
// developer already has open.
const PORT = process.env.E2E_PORT ?? '3100';
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // SPEC.md §11 flow 10 runs the collection and lookup flows at 390x844.
    { name: 'mobile', use: { ...devices['iPhone 13'] } },
  ],
  webServer: {
    // NODE_ENV=test makes Next load .env.test and skip .env.local, so an E2E run
    // never authenticates against the developer's own APP_PASSWORD_HASH.
    command: `NODE_ENV=test npm run dev -- --port ${PORT}`,
    url: baseURL,
    // A stale dev server would carry the developer's own env, not these values,
    // and the login tests would fail confusingly.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
