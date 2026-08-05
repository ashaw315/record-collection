import 'server-only';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-serverless';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { Pool as NeonPool } from '@neondatabase/serverless';
import { Pool as PgPool } from 'pg';
import { getEnv } from '@/env';
import { resolveDriver } from '@/lib/db/connection-string';

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

/**
 * resolveDriver and its types live in @/lib/db/connection-string so that
 * drizzle.config.ts can import them: this module is `server-only`, which throws
 * when drizzle-kit loads its config as a plain CLI module. Re-exported here so
 * existing call sites and tests keep importing from @/db/client.
 */
export { resolveDriver } from '@/lib/db/connection-string';
export type { DriverSelection, DriverEnv } from '@/lib/db/connection-string';

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
