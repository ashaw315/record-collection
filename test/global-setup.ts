import { execFileSync } from 'node:child_process';
import { assertLocalTestDatabase } from './helpers/db';

/**
 * Applies migrations once per test run (CLAUDE.md §2: each run migrates a clean
 * database, each test truncates rather than re-migrating).
 */
export default function setup() {
  const connectionString = assertLocalTestDatabase(process.env.TEST_DATABASE_URL);

  execFileSync('npx', ['drizzle-kit', 'migrate'], {
    stdio: 'inherit',
    env: { ...process.env, TEST_DATABASE_URL: connectionString },
  });
}
