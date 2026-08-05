import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';
import { assertLocalHost } from '../../src/lib/db/connection-string';

/**
 * Refuses any connection string that is not unmistakably the local Docker test
 * database.
 *
 * `truncateAll` runs automatically between tests and deletes every row in every
 * table. Configuration alone is not a sufficient safeguard for that: one stray
 * env var and it wipes real data. Asserting the host here makes reaching a
 * remote database structurally impossible rather than merely unlikely, which is
 * the same failure class as the NODE_ENV-based driver selection bug.
 *
 * The host check lives in src/lib/db/connection-string.ts so that this guard
 * and resolveDriver share one implementation, and so that validation uses the
 * same parser `pg` connects with. Reading `new URL().hostname` here — as this
 * function used to — approved any string whose `?host=` parameter redirected
 * the connection elsewhere.
 */
export function assertLocalTestDatabase(connectionString: string | undefined): string {
  return assertLocalHost(connectionString);
}

let pool: Pool | undefined;
let db: ReturnType<typeof drizzle> | undefined;

export function getTestDb() {
  if (db === undefined) {
    const connectionString = assertLocalTestDatabase(process.env.TEST_DATABASE_URL);
    pool = new Pool({ connectionString });
    db = drizzle(pool);
  }
  return db;
}

/**
 * Truncates every table in the public schema. CLAUDE.md §2 requires tests to
 * truncate rather than re-migrate, so this must not drop the schema itself.
 * `formats` is excluded because it is closed reference data seeded by the
 * migration (SPEC.md §4.1), not test state.
 */
export async function truncateAll(): Promise<void> {
  assertLocalTestDatabase(process.env.TEST_DATABASE_URL);
  const database = getTestDb();

  const result = await database.execute<{ tablename: string }>(
    sql`SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename NOT IN ('formats', '__drizzle_migrations')`,
  );

  if (result.rows.length === 0) return;

  const tables = result.rows.map((r) => `"${r.tablename}"`).join(', ');
  await database.execute(sql.raw(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`));
}

export async function closeTestDb(): Promise<void> {
  if (pool !== undefined) {
    await pool.end();
    pool = undefined;
    db = undefined;
  }
}
