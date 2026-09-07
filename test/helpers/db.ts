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
 * The advisory-lock key this test database is held with.
 *
 * Arbitrary but FIXED: every runner must choose the same number or the lock
 * protects nothing. Session-scoped (`pg_advisory_lock`, not `_xact_`), so it is
 * held for the life of the connection rather than one statement.
 */
export const TRUNCATE_LOCK_KEY = 8_472_119_364_055;

let exclusivityChecked = false;

/**
 * **Refuses to run while another suite holds this database** (A47, 2026-09-07).
 *
 * **The apparatus generating the signal, made structural.** A Playwright run and
 * `npm test` shared one local database on port 5433, and `truncateAll` deleted
 * the E2E seed data mid-flight: 52 bogus E2E failures across specs the diff
 * never touched, plus phantom unit failures in three unrelated files. Both
 * suites re-ran clean serially. Nothing was wrong with the code — the instrument
 * was measuring itself, and the failures looked exactly like real ones.
 *
 * **"Check what else is running" is a habit, and this project has already
 * learned that habits fail at the moment they matter.** `run-result.ts` exists
 * because the exit-code rule was written down and then walked into three more
 * times. So the second runner is REFUSED rather than trusted to notice.
 *
 * **It fails loudly rather than waiting or skipping.** A blocking lock would
 * hang a CI run with no explanation; a skip would report a green suite that
 * never ran. Two suites on one database is a broken environment, not an absent
 * one — the three-states rule (CLAUDE.md §2) applied to the test harness itself.
 *
 * Checked once per process: the lock is held for the life of the connection, so
 * re-taking it every `truncateAll` would cost a round trip per test.
 */
/**
 * A hold that OUTLIVES the connection that took it (A47).
 *
 * **The advisory lock alone was not enough, and measuring it is what showed
 * that.** A session lock dies with its pool, and `e2e/global-setup.ts` calls
 * `truncateAll()` then `closeTestDb()` — so E2E held the database for its setup
 * and released it before the first test ran, which is exactly the window the
 * 52-failure incident happened in. The guard would have passed the scenario it
 * was written for.
 *
 * A row is used rather than a lock because it must survive the pool: the E2E
 * run holds it from `globalSetup` to teardown, across every connection those
 * two make. `pid` is recorded so a crashed run can be identified rather than
 * merely blocking forever with no clue who is responsible.
 */
async function holdTable(): Promise<void> {
  const database = getTestDb();
  /*
   * **A separate schema, because this is HARNESS state and not app data.** In
   * `public` it was enumerated by `schema-conformance.test.ts` as a table of the
   * application — correctly, by that test's lights — and failed §4's rule that
   * every table carries both timestamps. Adding timestamps to satisfy a rule
   * about the app's schema would have been answering the wrong question; the
   * table does not belong to that schema at all.
   */
  await database.execute(sql`CREATE SCHEMA IF NOT EXISTS test_harness`);
  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS test_harness.run_hold (
      id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      owner text NOT NULL,
      pid integer NOT NULL,
      taken_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

/** Who holds the database now, or null. */
async function currentHolder(): Promise<{ owner: string; pid: number } | null> {
  const database = getTestDb();
  await holdTable();

  const result = await database.execute<{ owner: string; pid: number }>(
    sql`SELECT owner, pid FROM test_harness.run_hold WHERE id = 1`,
  );

  const row = result.rows[0];
  if (row === undefined) return null;

  /*
   * **A dead holder is not a holder.** A run killed with SIGKILL leaves its row
   * behind, and a hold nothing can clear would block every later run — turning a
   * guard against false failures into a source of them. `process.kill(pid, 0)`
   * throws when no such process exists.
   */
  try {
    process.kill(row.pid, 0);
  } catch {
    await database.execute(sql`DELETE FROM test_harness.run_hold WHERE id = 1`);
    return null;
  }

  return { owner: row.owner, pid: Number(row.pid) };
}

/**
 * Claims the database for a run that spans several connections (E2E).
 *
 * Throws if someone else holds it, with the same message shape as the in-process
 * guard: the point is a sentence naming the cause, not a bare failure.
 */
export async function holdTestDatabase(owner: string): Promise<void> {
  const held = await currentHolder();

  if (held !== null && held.pid !== process.pid) {
    throw new Error(
      `Refusing to run: another test run already holds this database — ${held.owner} (pid ${held.pid}). ` +
        'Two suites sharing one database truncate each other mid-flight, which ' +
        'produces failures in code that is fine. Wait for it to finish, or point ' +
        'this run at a different database.',
    );
  }

  const database = getTestDb();
  await database.execute(sql`
    INSERT INTO test_harness.run_hold (id, owner, pid) VALUES (1, ${owner}, ${process.pid})
    ON CONFLICT (id) DO UPDATE SET owner = ${owner}, pid = ${process.pid}, taken_at = now()
  `);
}

/** Releases the hold. Safe to call when nothing is held. */
export async function releaseTestDatabase(): Promise<void> {
  const database = getTestDb();
  await holdTable();
  await database.execute(sql`DELETE FROM test_harness.run_hold WHERE id = 1`);
}

export async function assertExclusiveTestDatabase(): Promise<void> {
  /*
   * **The advisory lock is taken once; the HOLD is re-read every time.**
   *
   * An earlier version memoised the whole check, which was wrong in the case
   * that matters: a second runner can start at any point during a long suite,
   * and a guard that stops looking after the first test cannot see it. Taking
   * the session lock repeatedly is what is pointless — it is already held by
   * this connection — not asking whether someone else has since claimed the
   * database.
   */

  /*
   * **Two mechanisms, because they cover different failures.** The row catches a
   * run that spans connections (E2E, which closes its setup pool); the advisory
   * lock catches a concurrent run that never writes one, and is released
   * automatically if that process dies. Neither subsumes the other.
   */
  const held = await currentHolder();

  if (held !== null && held.pid !== process.pid) {
    throw new Error(
      `Refusing to run: another test run already holds this database — ${held.owner} (pid ${held.pid}). ` +
        'Two suites sharing one database truncate each other mid-flight, which ' +
        'produces failures in code that is fine. Wait for it to finish, or point ' +
        'this run at a different database.',
    );
  }

  if (exclusivityChecked) return;

  const database = getTestDb();
  const result = await database.execute<{ locked: boolean }>(
    sql`SELECT pg_try_advisory_lock(${TRUNCATE_LOCK_KEY}::bigint) AS locked`,
  );

  if (result.rows[0]?.locked !== true) {
    throw new Error(
      'Refusing to run: another test run already holds this database ' +
        `(${process.env.TEST_DATABASE_URL}). ` +
        'Two suites sharing one database truncate each other mid-flight, which ' +
        'produces failures in code that is fine. Wait for the other run to ' +
        'finish, or point this one at a different database.',
    );
  }

  exclusivityChecked = true;
}

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

  /*
   * A47: before deleting every row, prove nothing else is using them. This is
   * the guard, and it sits HERE rather than in a setup file because
   * `truncateAll` is the destructive act — a check somewhere else could be
   * bypassed by a suite that forgot to import it.
   */
  await assertExclusiveTestDatabase();

  const database = getTestDb();

  /*
   * **The hold row is out of reach here, and that is load-bearing.** It lives in
   * `test_harness`, not `public`, so this scan cannot see it. When it briefly
   * lived in `public` the guard truncated its own evidence — wiping the hold on
   * the first reset, then reading an empty table and reporting all clear while
   * doing exactly the damage the row exists to prevent.
   */
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
