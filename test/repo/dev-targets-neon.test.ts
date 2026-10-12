import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { config } from 'dotenv';
import { resolveDriver, type DriverEnv } from '@/lib/db/connection-string';

/**
 * `npm run dev`, with no flags, must reach NEON — not the local test database.
 *
 * This is the one that silently reverts. `TEST_DATABASE_URL` lived in
 * `.env.local` for most of the project, because the test tooling needed it
 * somewhere; the consequence was that the DEV SERVER selected it too, since
 * `resolveDriver` chooses on that variable alone. Real records typed into the
 * running app landed in the database `truncateAll` wipes, and nothing warned.
 *
 * Nobody would notice the regression until an evening of data entry vanished,
 * so the invariant is asserted rather than documented.
 */

/**
 * The env Next would see for `npm run dev`: `.env.local`, no NODE_ENV=test.
 *
 * Loaded into an isolated object rather than `process.env`, so the assertions
 * describe the FILE rather than whatever the test runner happens to have set —
 * vitest.config.mts loads `.env.test`, which would otherwise mask the very
 * thing under test.
 */
function loadEnvFile(path: string): DriverEnv {
  const loaded: Record<string, string> = {};
  config({ path, processEnv: loaded, quiet: true });

  return {
    DATABASE_URL: loaded.DATABASE_URL ?? '',
    TEST_DATABASE_URL: loaded.TEST_DATABASE_URL,
    NODE_ENV: loaded.NODE_ENV,
  };
}

/**
 * A gate runs in a worktree of its own (`scripts/gate.sh`), and `.env.local`
 * is not copied there: the production credential does not travel. So the three
 * tests that read the file have nothing to read, and they SKIP — on the marker
 * `gate.sh` sets, and on nothing else.
 *
 * Not on the file being absent. Skipping then would stop guarding the day
 * `.env.local` vanishes from the working tree, which is a guard that passes
 * because the real thing is not there. Without the marker a missing file is
 * still a failure, here and anywhere.
 */
const GATE_WORKTREE = process.env.GATE_WORKTREE === '1';
const readsEnvLocal = it.skipIf(GATE_WORKTREE);

describe('the default dev server targets Neon, not the test database', () => {
  readsEnvLocal('.env.local does not define TEST_DATABASE_URL', () => {
    /**
     * Asserted against the FILE, not just the resolved outcome, because that is
     * where the regression would be reintroduced — someone adding the variable
     * back to make an ad-hoc script work.
     */
    const file = readFileSync('.env.local', 'utf8');
    const assignment = file
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('#'))
      // NEON_TEST_DATABASE_URL is a different variable and belongs here.
      .find((line) => /^\s*TEST_DATABASE_URL\s*=/.test(line));

    expect(assignment, 'TEST_DATABASE_URL must live in .env.test only').toBeUndefined();
  });

  readsEnvLocal('resolves to the neon driver with the dev environment', () => {
    const selected = resolveDriver(loadEnvFile('.env.local'));

    expect(selected.driver).toBe('neon');
  });

  readsEnvLocal('resolves to a host that is not localhost', () => {
    // The property that actually matters: whatever the driver is called, the
    // dev server must not be writing to the disposable container.
    const { connectionString } = resolveDriver(loadEnvFile('.env.local'));

    expect(new URL(connectionString).hostname).not.toBe('localhost');
    expect(new URL(connectionString).hostname).not.toBe('127.0.0.1');
  });

  it('still resolves to the local test database under .env.test', () => {
    /**
     * The other half. Isolating dev from the test database is only safe if the
     * TEST tooling still reaches it — a change that fixed one by breaking the
     * other would pass the assertions above and destroy the suite.
     */
    const selected = resolveDriver(loadEnvFile('.env.test'));

    expect(selected.driver).toBe('pg');
    expect(new URL(selected.connectionString).hostname).toBe('localhost');
  });
});
