import 'server-only';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-serverless';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { Pool as NeonPool } from '@neondatabase/serverless';
import { Pool as PgPool } from 'pg';
import { getEnv } from '@/env';

/**
 * The single driver-selection point required by CLAUDE.md §2 and SPEC.md §2.
 *
 * Production and development against Neon use the WebSocket `Pool` adapter
 * (`drizzle-orm/neon-serverless`). The HTTP adapter is deliberately not used
 * anywhere: it cannot do interactive transactions, which §5.3's acquire flow
 * and §5.7's import both require, and mixing HTTP reads with WebSocket writes
 * would mean two production code paths differing exactly where correctness is
 * hardest to test.
 *
 * The local Docker test database is plain Postgres, which no Neon driver can
 * speak to, so tests use `pg`. Both paths sit behind this module and expose
 * identical Drizzle query APIs, so no query code elsewhere needs to know which
 * is in play. Selection is by `TEST_DATABASE_URL` presence — see resolveDriver
 * for why `NODE_ENV` is not safe to select on.
 *
 * Both adapters now support `db.transaction()`, but that equivalence is still
 * worth confirming against Neon before deploy rather than inferring it from a
 * green local run (CLAUDE.md §2).
 */

export type DriverSelection =
  | { driver: 'pg'; connectionString: string }
  | { driver: 'neon'; connectionString: string };

interface DriverEnv {
  DATABASE_URL: string;
  // Optional properties, matching what Zod's `.optional()` produces, so the
  // parsed Env is assignable here without restating its shape.
  TEST_DATABASE_URL?: string | undefined;
  NODE_ENV?: string | undefined;
}

/**
 * Chooses the driver from `TEST_DATABASE_URL` alone, never from `NODE_ENV`.
 *
 * This is a data-safety boundary. Playwright does not set `NODE_ENV=test`, so
 * selecting on it would have E2E runs connect to the real Neon database — and
 * the reset-between-tests rule (CLAUDE.md §2) truncates whatever it connects
 * to. Presence of a test database URL is the only signal that cannot silently
 * point at production.
 *
 * Exported for direct unit testing: the guarantee that a test-shaped
 * environment never resolves to Neon is worth asserting explicitly.
 */
export function resolveDriver(env: DriverEnv): DriverSelection {
  // `TEST_DATABASE_URL=` in a .env file means absent, not "the empty string".
  const testUrl =
    env.TEST_DATABASE_URL !== undefined && env.TEST_DATABASE_URL !== ''
      ? env.TEST_DATABASE_URL
      : undefined;

  if (testUrl !== undefined) {
    return { driver: 'pg', connectionString: testUrl };
  }

  if (env.NODE_ENV === 'test') {
    throw new Error(
      'Refusing to select a database driver: NODE_ENV is "test" but TEST_DATABASE_URL is not set. ' +
        'Falling back to DATABASE_URL here would point tests at the real database, which the ' +
        'reset-between-tests rule would then truncate. Start the local test database with ' +
        '`npm run db:test:up` and set TEST_DATABASE_URL.',
    );
  }

  return { driver: 'neon', connectionString: env.DATABASE_URL };
}

// Held at module scope so the pool is closed on teardown rather than leaked.
let activePool: NeonPool | PgPool | undefined;

function createClient() {
  const env = getEnv();
  const selected = resolveDriver(env);

  if (selected.driver === 'pg') {
    const pool = new PgPool({ connectionString: selected.connectionString });
    activePool = pool;
    return drizzlePg(pool);
  }

  // Node 18+ exposes a global WebSocket, which @neondatabase/serverless v1 uses
  // automatically, so no `ws` polyfill is required.
  const pool = new NeonPool({ connectionString: selected.connectionString });
  activePool = pool;
  return drizzleNeon(pool);
}

export type Database = ReturnType<typeof createClient>;

let cached: Database | undefined;

export function getDb(): Database {
  cached ??= createClient();
  return cached;
}

/**
 * Closes the active pool. Unlike the HTTP driver, the WebSocket pool holds a
 * real connection, so this matters on both paths — test teardown and any
 * graceful shutdown — or the process hangs on open handles.
 */
export async function closeDb(): Promise<void> {
  if (activePool !== undefined) {
    await activePool.end();
    activePool = undefined;
  }
  cached = undefined;
}
