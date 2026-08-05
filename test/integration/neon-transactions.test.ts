import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { Pool } from '@neondatabase/serverless';
import {
  assertNeonTestBranch,
  isNeonTestBranchConfigured,
} from '@/lib/db/neon-test-branch';

/**
 * CLAUDE.md §2: transactional code must be verified against the REAL Neon
 * driver, not local `pg` alone, "before deploy, not assumed".
 *
 * That gate now applies from step 5 rather than step 6. The acquire flow (§5.3)
 * was the original trigger, but §5.2's nested genreIds/tagIds writes are the
 * project's first transactional code and reach production sooner. An untested
 * production driver is the one item on the deferred list that fails SILENTLY
 * and corrupts data rather than erroring, which is why it is gated rather than
 * deferred again.
 *
 * Every other integration test runs on local Docker Postgres via
 * `drizzle-orm/node-postgres`. This file is the only place
 * `drizzle-orm/neon-serverless` is exercised at all.
 *
 * SKIPS when NEON_TEST_DATABASE_URL is absent — CI and a fresh clone have no
 * branch — but see `test/repo/neon-gate.test.ts`, which fails if the skip ever
 * becomes silent. A silently-absent check is the failure mode this whole build
 * has been eliminating.
 */

const branchUrl = process.env.NEON_TEST_DATABASE_URL;
const configured = isNeonTestBranchConfigured(branchUrl);

/**
 * The skip is surfaced as a FAILING-BY-NAME test rather than a console warning.
 *
 * A console.warn at module scope is swallowed by vitest when the whole file is
 * skipped — verified — which made the "loud skip" silent in practice, the exact
 * failure mode this gate exists to prevent. A named test in the summary cannot
 * be missed the same way.
 */
describe('Neon verification gate', () => {
  it.skipIf(configured)(
    'SKIPPED: transactional code is NOT verified against the real Neon driver — set NEON_TEST_DATABASE_URL to a throwaway branch',
    () => {
      // Intentionally passes. The point is the NAME, which appears in the
      // summary and states plainly what has not been checked. CLAUDE.md §2
      // requires this verification before deploy; local pg passing does not
      // imply Neon passes.
      expect(configured).toBe(false);
    },
  );
});

describe.skipIf(!configured)('transactions over the Neon serverless driver', () => {
  let pool: Pool;
  let db: ReturnType<typeof drizzle>;
  const probe = `neon-tx-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  beforeAll(() => {
    /**
     * Structural, not procedural. This harness WRITES and deliberately fails
     * transactions, so it may only ever address the throwaway branch. Both
     * branches expose a database called `neondb`, so the endpoint host is the
     * only thing distinguishing them — see assertNeonTestBranch.
     */
    const url = assertNeonTestBranch(branchUrl, branchUrl);

    pool = new Pool({ connectionString: url });
    db = drizzle(pool);
  });

  afterAll(async () => {
    if (pool !== undefined) {
      await db.execute(sql`DELETE FROM artists WHERE name LIKE ${`${probe}%`}`);
      await pool.end();
    }
  });

  it('refuses to run against anything but the configured test branch', () => {
    // The guard is exercised here as well as in its own unit test, so that a
    // harness pointed at main fails at setup rather than after writing.
    const main =
      'postgresql://user:pw@ep-royal-rain-auyyxko8-pooler.c-10.us-east-1.aws.neon.tech/neondb';

    expect(() => assertNeonTestBranch(main, branchUrl)).toThrow(/test branch/i);
  });

  it('commits a transaction that completes', async () => {
    const name = `${probe}-commit`;

    await db.transaction(async (tx) => {
      await tx.execute(sql`INSERT INTO artists (name) VALUES (${name})`);
    });

    const found = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM artists WHERE name = ${name}`,
    );
    expect(found.rows[0].n).toBe(1);
  });

  /**
   * The case CLAUDE.md §2 actually cares about, and the one that would corrupt
   * data silently if Neon behaved differently from pg: a forced mid-transaction
   * failure must roll back the earlier write.
   *
   * For §5.2 this is a record inserted with its genre links — if the parent
   * survives a failed junction insert, the record looks created but has lost
   * its genres, which reads as success.
   */
  it('rolls back an earlier write when the transaction fails partway', async () => {
    const name = `${probe}-rollback`;

    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql`INSERT INTO artists (name) VALUES (${name})`);
        throw new Error('forced mid-transaction failure');
      }),
    ).rejects.toThrow(/forced mid-transaction failure/);

    const found = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM artists WHERE name = ${name}`,
    );
    expect(found.rows[0].n).toBe(0);
  });

  /**
   * The multi-table shape §5.2 actually uses: a parent row plus junction rows.
   * A failure after the junction insert must take BOTH back, not just the last
   * statement.
   */
  it('rolls back a parent row and its junction rows together', async () => {
    const artistName = `${probe}-parent`;
    const genreName = `${probe}-genre`;

    // Fixtures created outside the transaction so only the rollback is measured.
    await db.execute(sql`INSERT INTO artists (name) VALUES (${artistName})`);
    await db.execute(sql`INSERT INTO genres (name) VALUES (${genreName})`);

    const artist = await db.execute<{ id: string }>(
      sql`SELECT id FROM artists WHERE name = ${artistName}`,
    );
    const genre = await db.execute<{ id: string }>(
      sql`SELECT id FROM genres WHERE name = ${genreName}`,
    );

    const recordTitle = `${probe}-record`;

    await expect(
      db.transaction(async (tx) => {
        const inserted = await tx.execute<{ id: string }>(
          sql`INSERT INTO records (artist_id, title) VALUES (${artist.rows[0].id}, ${recordTitle}) RETURNING id`,
        );
        await tx.execute(
          sql`INSERT INTO record_genres (record_id, genre_id)
              VALUES (${inserted.rows[0].id}, ${genre.rows[0].id})`,
        );
        throw new Error('forced failure after junction insert');
      }),
    ).rejects.toThrow();

    const records = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM records WHERE title = ${recordTitle}`,
    );
    const links = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM record_genres WHERE genre_id = ${genre.rows[0].id}`,
    );

    expect({ records: records.rows[0].n, links: links.rows[0].n }).toEqual({
      records: 0,
      links: 0,
    });

    await db.execute(sql`DELETE FROM genres WHERE name = ${genreName}`);
  });

  /**
   * The §5.2 primitive itself, not a hand-rolled equivalent.
   *
   * The tests in nested-write.test.ts prove writeRecordWithNested rolls back on
   * local pg. This proves the SAME FUNCTION rolls back on Neon — which is the
   * entire point of CLAUDE.md §2's caveat, and cannot be inferred from the pg
   * result. It runs against the throwaway branch via the same guard.
   */
  it('rolls back the real nested-write primitive, not just raw SQL', async () => {
    const { writeRecordWithNested } = await import('@/lib/db/queries/nested');
    const artistName = `${probe}-primitive-artist`;
    const title = `${probe}-primitive-record`;
    const missingGenre = '00000000-0000-4000-8000-000000000000';

    await db.execute(sql`INSERT INTO artists (name) VALUES (${artistName})`);
    const artist = await db.execute<{ id: string }>(
      sql`SELECT id FROM artists WHERE name = ${artistName}`,
    );

    // getDb() resolves by TEST_DATABASE_URL presence, so the primitive would
    // address local pg here. Point it at the branch for the duration.
    const previous = process.env.TEST_DATABASE_URL;
    const previousDatabase = process.env.DATABASE_URL;
    process.env.TEST_DATABASE_URL = '';
    process.env.DATABASE_URL = branchUrl;

    try {
      const { closeDb } = await import('@/db/client');
      await closeDb();

      await expect(
        writeRecordWithNested({
          values: { artistId: artist.rows[0].id, title },
          genreIds: [missingGenre],
          tagIds: [],
        }),
      ).rejects.toThrow();

      await closeDb();
    } finally {
      process.env.TEST_DATABASE_URL = previous ?? '';
      process.env.DATABASE_URL = previousDatabase ?? '';
    }

    const found = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM records WHERE title = ${title}`,
    );
    expect(found.rows[0].n).toBe(0);
  });

  /**
   * A constraint violation inside the transaction — not a thrown JS error —
   * because that is how a real nested write fails (a bad genre id hits the
   * foreign key). The driver must surface it AND roll back.
   */
  it('rolls back when the database itself rejects a statement', async () => {
    const name = `${probe}-constraint`;
    const missingGenre = '00000000-0000-4000-8000-000000000000';

    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql`INSERT INTO artists (name) VALUES (${name})`);
        // Foreign key violation: no such genre.
        await tx.execute(
          sql`INSERT INTO record_genres (record_id, genre_id)
              VALUES (${missingGenre}, ${missingGenre})`,
        );
      }),
    ).rejects.toThrow();

    const found = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM artists WHERE name = ${name}`,
    );
    expect(found.rows[0].n).toBe(0);
  });
});
