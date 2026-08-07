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
 * The seven formats seeded by migration 0000 (SPEC.md §4.1), and pinned by
 * migration 0002's partial index.
 *
 * Duplicated here rather than read from the database, deliberately: the point
 * is to restore a KNOWN set, and deriving it from whatever the table currently
 * holds would happily preserve debris. `schema.test.ts` asserts the same seven
 * against the migration, so a drift between them fails there.
 */
const SEEDED_FORMATS = ['LP', '2xLP', '7"', '10"', '12" Single', 'Box Set', 'Picture Disc'];

/**
 * Truncates every table in the public schema. CLAUDE.md §2 requires tests to
 * truncate rather than re-migrate, so this must not drop the schema itself.
 *
 * `formats` is RESTORED rather than truncated or skipped. It is closed
 * reference data, so it is not test state — but skipping it entirely let a
 * test-created eighth format survive every reset, permanently breaking
 * schema.test.ts's "seeds exactly the seven" assertion. That happened twice in
 * one session, and both times the symptom was a failure in a file that had not
 * changed, with the cause an hour earlier in an unrelated test.
 *
 * Restoring handles both directions: extras are removed and deleted seeds come
 * back. Ids are PRESERVED — the rows are not dropped and recreated — so a
 * fixture that captured a format id before the reset still resolves.
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

  // A VALUES list rather than an array parameter: Drizzle binds a JS array as
  // a record, which Postgres refuses to cast to text[].
  const seeded = sql.join(
    SEEDED_FORMATS.map((name) => sql`(${name})`),
    sql`, `,
  );

  // Anything a test added, gone.
  await database.execute(
    sql`DELETE FROM formats WHERE name NOT IN (SELECT * FROM (VALUES ${seeded}) AS s(name))`,
  );
  /**
   * Anything a test removed, back — without disturbing the ids of the rows
   * that are still there.
   *
   * `is_seeded` is set explicitly. Migration 0002 marks these seven, and the
   * API refuses to delete a seeded format (§5.4's SEEDED conflict), so a
   * restored row that came back unmarked would be deletable when the real one
   * is not — a difference invisible until a test asserts on that refusal.
   */
  await database.execute(
    sql`INSERT INTO formats (name, is_seeded)
        SELECT name, true FROM (VALUES ${seeded}) AS s(name)
        ON CONFLICT (name) DO UPDATE SET is_seeded = true`,
  );
}

export async function closeTestDb(): Promise<void> {
  if (pool !== undefined) {
    await pool.end();
    pool = undefined;
    db = undefined;
  }
}
