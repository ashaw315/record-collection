import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
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
      await db.execute(
        sql`DELETE FROM want_list WHERE artist_id IN
              (SELECT id FROM artists WHERE name LIKE ${`${probe}%`})`,
      );
      await db.execute(
        sql`DELETE FROM records WHERE artist_id IN
              (SELECT id FROM artists WHERE name LIKE ${`${probe}%`})`,
      );
      await db.execute(sql`DELETE FROM genres WHERE name LIKE ${`${probe}%`}`);
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
    // NODE_ENV too, or resolveDriver refuses outright and the primitive never
    // reaches Neon — a bare .rejects.toThrow() would accept that refusal as if
    // it were the rollback under test.
    vi.stubEnv('NODE_ENV', 'production');

    try {
      const { closeDb } = await import('@/db/client');
      await closeDb();

      await expect(
        writeRecordWithNested({
          values: { artistId: artist.rows[0].id, title },
          genreIds: [missingGenre],
          tagIds: [],
        }),
      ).rejects.toThrow(/record_genres/i);

      await closeDb();
    } finally {
      process.env.TEST_DATABASE_URL = previous ?? '';
      process.env.DATABASE_URL = previousDatabase ?? '';
      vi.unstubAllEnvs();
    }

    const found = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM records WHERE title = ${title}`,
    );
    expect(found.rows[0].n).toBe(0);
  });

  /**
   * The PATCH counterpart, for the same reason as the create primitive above.
   *
   * updateRecordWithNested spans a scalar UPDATE and two junction replacements
   * in one transaction. It was added after the post-unit-6 review found PATCH
   * running three INDEPENDENT transactions, so a failure in the third committed
   * the first two behind a 500. That fix is only real if the rollback holds on
   * the driver production actually uses.
   */
  it('rolls back the PATCH primitive across the scalar update and the junctions', async () => {
    const { writeRecordWithNested, updateRecordWithNested } = await import(
      '@/lib/db/queries/nested'
    );
    const artistName = `${probe}-patch-artist`;
    const title = `${probe}-patch-record`;
    const genreName = `${probe}-patch-genre`;
    const missingTag = '00000000-0000-4000-8000-000000000000';

    await db.execute(sql`INSERT INTO artists (name) VALUES (${artistName})`);
    const artist = await db.execute<{ id: string }>(
      sql`SELECT id FROM artists WHERE name = ${artistName}`,
    );
    await db.execute(sql`INSERT INTO genres (name) VALUES (${genreName})`);
    const genre = await db.execute<{ id: string }>(
      sql`SELECT id FROM genres WHERE name = ${genreName}`,
    );

    const previous = process.env.TEST_DATABASE_URL;
    const previousDatabase = process.env.DATABASE_URL;
    process.env.TEST_DATABASE_URL = '';
    process.env.DATABASE_URL = branchUrl;
    vi.stubEnv('NODE_ENV', 'production');

    let recordId = '';
    try {
      const { closeDb } = await import('@/db/client');
      await closeDb();

      const created = await writeRecordWithNested({
        values: { artistId: artist.rows[0].id, title },
        genreIds: [genre.rows[0].id],
        tagIds: [],
      });
      recordId = created.id;

      // The tag write fails on a foreign key AFTER the title and the genre
      // replacement have been issued inside the same transaction.
      await expect(
        updateRecordWithNested({
          id: recordId,
          values: { title: `${title}-CHANGED` },
          genreIds: [],
          tagIds: [missingTag],
        }),
      ).rejects.toThrow(/record_tags/i);

      await closeDb();
    } finally {
      process.env.TEST_DATABASE_URL = previous ?? '';
      process.env.DATABASE_URL = previousDatabase ?? '';
      vi.unstubAllEnvs();
    }

    // The title must be the ORIGINAL, and the genre link must still be there.
    const after = await db.execute<{ title: string }>(
      sql`SELECT title FROM records WHERE id = ${recordId}`,
    );
    expect(after.rows[0].title).toBe(title);

    const genresAfter = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM record_genres WHERE record_id = ${recordId}`,
    );
    expect(genresAfter.rows[0].n).toBe(1);
  });

  /**
   * NOTES ITEM 14'S HARD GATE: the acquire flow, on the real driver.
   *
   * §5.3's acquire writes a record, its genre links, and the mark on the
   * want-list row. §11 requires a forced mid-transaction failure test, and
   * CLAUDE.md §2 requires it against Neon rather than local pg alone — this is
   * the operation the caveat was originally written for.
   *
   * A partial application here is §7.3's corruption: either the want list still
   * shows something owned and the acquisition is missing from history, or
   * `acquired_record_id` points at nothing. Neither errors.
   */
  it('rolls back the acquire primitive across the record and the mark', async () => {
    const { acquireWantListItem } = await import('@/lib/db/queries/want-list');
    const artistName = `${probe}-acquire-artist`;
    const title = `${probe}-acquire-record`;
    const wantTitle = `${probe}-acquire-want`;
    const missingGenre = '00000000-0000-4000-8000-000000000000';

    await db.execute(sql`INSERT INTO artists (name) VALUES (${artistName})`);
    const artist = await db.execute<{ id: string }>(
      sql`SELECT id FROM artists WHERE name = ${artistName}`,
    );
    await db.execute(
      sql`INSERT INTO want_list (artist_id, title) VALUES (${artist.rows[0].id}, ${wantTitle})`,
    );
    const item = await db.execute<{ id: string }>(
      sql`SELECT id FROM want_list WHERE title = ${wantTitle}`,
    );

    const previous = process.env.TEST_DATABASE_URL;
    const previousDatabase = process.env.DATABASE_URL;
    process.env.TEST_DATABASE_URL = '';
    process.env.DATABASE_URL = branchUrl;
    vi.stubEnv('NODE_ENV', 'production');

    try {
      const { closeDb } = await import('@/db/client');
      await closeDb();

      // The genre link fails on a foreign key AFTER the record has been
      // inserted and BEFORE the want-list row is marked.
      await expect(
        acquireWantListItem({
          wantListId: item.rows[0].id,
          values: { artistId: artist.rows[0].id, title },
          genreIds: [missingGenre],
        tagIds: [],
        }),
      ).rejects.toThrow(/record_genres/i);

      await closeDb();
    } finally {
      process.env.TEST_DATABASE_URL = previous ?? '';
      process.env.DATABASE_URL = previousDatabase ?? '';
      vi.unstubAllEnvs();
    }

    // NEITHER half survived.
    const orphanRecord = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM records WHERE title = ${title}`,
    );
    expect(orphanRecord.rows[0].n, 'the record must not survive a failed mark').toBe(0);

    const marked = await db.execute<{ is_acquired: boolean; acquired_record_id: string | null }>(
      sql`SELECT is_acquired, acquired_record_id FROM want_list WHERE id = ${item.rows[0].id}`,
    );
    expect(marked.rows[0].is_acquired, 'the item must not be marked').toBe(false);
    expect(marked.rows[0].acquired_record_id).toBeNull();
  });

  /**
   * TWO SIMULTANEOUS ACQUIRES, on the real driver.
   *
   * This is what local pg cannot answer: Neon's WebSocket pool multiplexes
   * transactions differently, and the `is_acquired = false` guard on the UPDATE
   * is the only thing standing between two concurrent acquires and an orphaned
   * record. Unit 3 established it is load-bearing; this establishes the driver
   * honours it.
   *
   * Genuinely concurrent — both promises are started before either is awaited —
   * rather than sequential, because a sequential pair proves only what the
   * endpoint pre-check already covers.
   */
  it('lets only one of two simultaneous acquires win', async () => {
    const { acquireWantListItem } = await import('@/lib/db/queries/want-list');
    const artistName = `${probe}-race-artist`;
    const wantTitle = `${probe}-race-want`;

    await db.execute(sql`INSERT INTO artists (name) VALUES (${artistName})`);
    const artist = await db.execute<{ id: string }>(
      sql`SELECT id FROM artists WHERE name = ${artistName}`,
    );
    await db.execute(
      sql`INSERT INTO want_list (artist_id, title) VALUES (${artist.rows[0].id}, ${wantTitle})`,
    );
    const item = await db.execute<{ id: string }>(
      sql`SELECT id FROM want_list WHERE title = ${wantTitle}`,
    );

    const previous = process.env.TEST_DATABASE_URL;
    const previousDatabase = process.env.DATABASE_URL;
    process.env.TEST_DATABASE_URL = '';
    process.env.DATABASE_URL = branchUrl;
    vi.stubEnv('NODE_ENV', 'production');

    let outcomes: PromiseSettledResult<{ id: string }>[] = [];
    try {
      const { closeDb } = await import('@/db/client');
      await closeDb();

      outcomes = await Promise.allSettled([
        acquireWantListItem({
          wantListId: item.rows[0].id,
          values: { artistId: artist.rows[0].id, title: `${probe}-race-a` },
          genreIds: [],
          tagIds: [],
        }),
        acquireWantListItem({
          wantListId: item.rows[0].id,
          values: { artistId: artist.rows[0].id, title: `${probe}-race-b` },
          genreIds: [],
          tagIds: [],
        }),
      ]);

      await closeDb();
    } finally {
      process.env.TEST_DATABASE_URL = previous ?? '';
      process.env.DATABASE_URL = previousDatabase ?? '';
      vi.unstubAllEnvs();
    }

    const won = outcomes.filter((outcome) => outcome.status === 'fulfilled');
    expect(won, 'exactly one acquire may succeed').toHaveLength(1);

    /**
     * §5.3: the loser's failure must be a DEFINED conflict, over the real Neon
     * driver too — that is what lets the handler answer 409 instead of 500.
     * Asserted here because the driver, not just the query, decides how a
     * rolled-back transaction surfaces its error.
     */
    const lost = outcomes.find((outcome) => outcome.status === 'rejected');
    expect(lost).toBeDefined();
    expect((lost as PromiseRejectedResult).reason).toMatchObject({
      code: 'ALREADY_ACQUIRED',
    });

    /**
     * The invariant that matters: exactly ONE record exists for this race, and
     * the want-list row points at it. Two records would mean an orphan — an
     * acquisition with nothing referencing it, which §7.3 says must not happen.
     */
    const created = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM records WHERE title LIKE ${`${probe}-race-%`}`,
    );
    expect(created.rows[0].n, 'the loser must have rolled back').toBe(1);

    const linked = await db.execute<{ acquired_record_id: string; is_acquired: boolean }>(
      sql`SELECT acquired_record_id, is_acquired FROM want_list WHERE id = ${item.rows[0].id}`,
    );
    expect(linked.rows[0].is_acquired).toBe(true);
    expect(
      linked.rows[0].acquired_record_id,
      'the surviving record is the one linked',
    ).toBe((won[0] as PromiseFulfilledResult<{ id: string }>).value.id);
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
