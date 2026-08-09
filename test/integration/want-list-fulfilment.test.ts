import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from '../helpers/db';

/**
 * SPEC.md §4.2 and §7.3: **a record fulfils at most one want-list entry.**
 * Enforced by a partial unique index on
 * `want_list.acquired_record_id WHERE acquired_record_id IS NOT NULL`.
 *
 * §7.3 gives the reason: the want list doubles as acquisition history, so two
 * entries pointing at one record would give that record two contradictory
 * histories — it was acquired once.
 *
 * **Duplicate UNACQUIRED entries stay legal.** Wanting two copies, or the same
 * album in two pressings, is a real intention (§4: duplicate records are legal
 * and expected), and each is fulfilled by its own record.
 *
 * One correction to the obvious reasoning, established by mutation rather than
 * assumed: the PARTIAL predicate is not what permits those duplicates.
 * Postgres treats NULLs as distinct in a plain unique index too, so a blanket
 * index would also allow them — verified by building one and watching the
 * duplicate tests still pass. The predicate earns its place by stating the
 * intent in the schema and by keeping the index off rows that can never
 * collide, not by enabling a behaviour that would otherwise be forbidden.
 *
 * §5.7's import is what made this reachable: importing the same release to the
 * want list twice creates two rows, and acquiring both would have produced the
 * contradiction. Tested at the DATABASE, not the query layer — the constraint
 * is the guarantee, and an application check is advisory.
 */

const db = getTestDb();

/**
 * Asserts a statement fails on the fulfilment index specifically.
 *
 * Drizzle wraps every driver error as `Failed query: …`, so the constraint
 * name is not in `.message` — it is on `error.cause`, which is also where the
 * SQLSTATE lives. NOTES says exactly this about the other constraint tests in
 * this suite: "if they are ever tightened, the matcher is `error.cause.code`,
 * not the message". A bare `.rejects.toThrow()` here would accept ANY failure,
 * including a syntax error in the test's own SQL.
 */
async function expectFulfilmentViolation(run: Promise<unknown>): Promise<void> {
  const error = await run.then(
    () => undefined,
    (thrown: unknown) => thrown as { cause?: { code?: string; constraint?: string } },
  );

  expect(error, 'the statement must fail').toBeDefined();
  // 23505 is unique_violation — not a foreign key, not a check, not a typo.
  expect(error?.cause?.code, 'fails on a UNIQUE violation').toBe('23505');
  expect(error?.cause?.constraint).toBe('want_list_acquired_record_id_unique');
}

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeTestDb();
});

async function seed() {
  const artist = await db.execute<{ id: string }>(
    sql`INSERT INTO artists (name) VALUES ('Discharge') RETURNING id`,
  );
  const record = await db.execute<{ id: string }>(
    sql`INSERT INTO records (artist_id, title) VALUES (${artist.rows[0].id}, 'Hear Nothing')
        RETURNING id`,
  );

  return { artistId: artist.rows[0].id, recordId: record.rows[0].id };
}

describe('a record fulfils at most one want-list entry', () => {
  it('refuses a second entry claiming the same record', async () => {
    const { artistId, recordId } = await seed();

    await db.execute(
      sql`INSERT INTO want_list (artist_id, title, is_acquired, acquired_record_id)
          VALUES (${artistId}, 'First entry', true, ${recordId})`,
    );

    await expectFulfilmentViolation(
      db.execute(
        sql`INSERT INTO want_list (artist_id, title, is_acquired, acquired_record_id)
            VALUES (${artistId}, 'Second entry', true, ${recordId})`,
      ),
    );
  });

  it('allows two entries once they point at DIFFERENT records', async () => {
    // The legitimate case this must not block: two copies wanted, two records
    // acquired, one entry fulfilled by each.
    const { artistId, recordId } = await seed();
    const second = await db.execute<{ id: string }>(
      sql`INSERT INTO records (artist_id, title) VALUES (${artistId}, 'Hear Nothing (2nd copy)')
          RETURNING id`,
    );

    await db.execute(
      sql`INSERT INTO want_list (artist_id, title, is_acquired, acquired_record_id)
          VALUES (${artistId}, 'First copy', true, ${recordId})`,
    );
    await db.execute(
      sql`INSERT INTO want_list (artist_id, title, is_acquired, acquired_record_id)
          VALUES (${artistId}, 'Second copy', true, ${second.rows[0].id})`,
    );

    const rows = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM want_list WHERE is_acquired = true`,
    );
    expect(rows.rows[0].n).toBe(2);
  });
});

describe('duplicate unacquired entries stay legal', () => {
  /**
   * The half a blanket unique index would break. §4 says duplicate records are
   * legal and expected — a collector may want two copies, or the same album in
   * a UK and a US pressing — and until they are acquired every one of those
   * rows has a NULL `acquired_record_id`.
   *
   * §5.7's import creates exactly this shape when the same release is imported
   * to the want list twice, so it is not hypothetical.
   */
  it('allows many unacquired entries for the same album', async () => {
    const { artistId } = await seed();

    for (const title of ['UK first press', 'US press', 'Japanese press']) {
      await db.execute(
        sql`INSERT INTO want_list (artist_id, title) VALUES (${artistId}, ${title})`,
      );
    }

    const rows = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM want_list WHERE acquired_record_id IS NULL`,
    );
    expect(rows.rows[0].n, 'NULLs do not collide under a partial index').toBe(3);
  });

  it('allows an entry to be acquired after duplicates exist', async () => {
    // The realistic sequence: two entries wanted, one of them fulfilled.
    const { artistId, recordId } = await seed();

    await db.execute(sql`INSERT INTO want_list (artist_id, title) VALUES (${artistId}, 'Copy A')`);
    await db.execute(sql`INSERT INTO want_list (artist_id, title) VALUES (${artistId}, 'Copy B')`);

    await db.execute(
      sql`UPDATE want_list SET is_acquired = true, acquired_record_id = ${recordId}
          WHERE title = 'Copy A'`,
    );

    const rows = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM want_list WHERE acquired_record_id = ${recordId}`,
    );
    expect(rows.rows[0].n).toBe(1);
  });

  it('refuses to point a SECOND entry at an already-fulfilling record by update', async () => {
    // The same violation reached by UPDATE rather than INSERT — the path the
    // acquire flow would take, and the one an application-level check on
    // insert alone would miss.
    const { artistId, recordId } = await seed();

    await db.execute(
      sql`INSERT INTO want_list (artist_id, title, is_acquired, acquired_record_id)
          VALUES (${artistId}, 'Already fulfilled', true, ${recordId})`,
    );
    await db.execute(sql`INSERT INTO want_list (artist_id, title) VALUES (${artistId}, 'Other')`);

    await expectFulfilmentViolation(
      db.execute(
        sql`UPDATE want_list SET is_acquired = true, acquired_record_id = ${recordId}
            WHERE title = 'Other'`,
      ),
    );
  });
});

describe('the index itself', () => {
  it('is PARTIAL, not a blanket unique constraint', async () => {
    /**
     * Asserted against `pg_indexes` because BEHAVIOUR CANNOT DISTINGUISH the
     * two forms. Mutation-checked: replacing this with a blanket unique index
     * leaves all five behavioural tests passing, since Postgres treats NULLs
     * as distinct either way. This is the only test that fails — which makes
     * it the only thing pinning the schema to what §4.2 actually specifies.
     */
    const rows = await db.execute<{ indexdef: string }>(
      sql`SELECT indexdef FROM pg_indexes
          WHERE tablename = 'want_list' AND indexname LIKE '%acquired_record_id%unique%'`,
    );

    expect(rows.rows.length, 'the unique index exists').toBe(1);
    expect(rows.rows[0].indexdef).toMatch(/UNIQUE/i);
    expect(rows.rows[0].indexdef, 'partial: NULLs are exempt').toMatch(
      /WHERE \(acquired_record_id IS NOT NULL\)/i,
    );
  });
});
