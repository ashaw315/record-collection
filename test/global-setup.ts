import { execFileSync } from 'node:child_process';
import { assertLocalTestDatabase, assertTestDatabaseReachable } from './helpers/db';

/**
 * Applies migrations once per test run (CLAUDE.md §2: each run migrates a clean
 * database, each test truncates rather than re-migrating). The database is
 * probed first, so a run with Docker down fails naming the port and the
 * command, not with drizzle's "Command failed" (the coordinator, 21 Nov).
 */
export default async function setup() {
  const connectionString = assertLocalTestDatabase(process.env.TEST_DATABASE_URL);
  await assertTestDatabaseReachable(connectionString);

  execFileSync('npx', ['drizzle-kit', 'migrate'], {
    stdio: 'inherit',
    env: { ...process.env, TEST_DATABASE_URL: connectionString },
  });
}
