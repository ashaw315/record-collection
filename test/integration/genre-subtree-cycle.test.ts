import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from '../helpers/db';
import { genreSubtree } from '@/lib/db/queries/genre-hierarchy';
import { genres } from '@/db/schema';

/**
 * **`genreSubtree` terminates on a cyclic hierarchy, and that is a property of
 * `UNION` rather than of the data.**
 *
 * `parent_genre_id` has no cycle constraint — no CHECK can express one, since a
 * CHECK cannot traverse rows — so the only thing preventing a loop reaching the
 * table is `wouldCreateCycle` on `PATCH /api/genres/:id`. `genre-hierarchy.ts`
 * says so in as many words: *"the cycle guard is the only thing preventing a
 * loop in the data, and if it is ever defeated, duplicate elimination stops this
 * walking forever."*
 *
 * **That sentence was the whole defence and nothing tested it.** `genreSubtree`
 * backs collection filtering, want-list filtering and `matchedVia` — all in
 * REQUEST paths — so a walk that failed to terminate would be an outage rather
 * than a slow script. Changing its `UNION` to `UNION ALL` is a one-word edit
 * that no existing test would notice, because every other test runs on acyclic
 * data where the two forms return identical rows.
 *
 * **What this asserts is the CHANNEL, not the query text.** A test that grepped
 * the source for the word `UNION` would be the proxy-below-the-claim defect
 * recorded three times in NOTES — it would pass against a `UNION` sitting in a
 * comment and fail against a correct rewrite using `CYCLE ... SET` or a depth
 * bound. So this stages a real cycle in the real table and asks the real
 * function for rows: if it returns them, the walk terminated; if the guard is
 * defeated, this test hangs until the suite's timeout kills it, which is a
 * failure and is meant to be.
 *
 * **The cycle is written directly rather than through the API**, deliberately.
 * `PATCH /api/genres/:id` refuses it — that refusal is `api/genres.test.ts`'s
 * subject, and it is a different claim. This one is about what the walk does if
 * the refusal is ever bypassed: a direct SQL edit, a future unguarded write
 * path, or a restore from a backup taken mid-edit.
 */

const db = getTestDb();

/** Ids fixed rather than generated, so a failure names the same rows every run. */
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const OUTSIDE = '44444444-4444-4444-8444-444444444444';

/**
 * Three genres in a closed loop: A -> B -> C -> A.
 *
 * Inserted parentless first, then linked, because the FK is self-referential and
 * the closing edge points at a row that does not exist until the first insert
 * lands. That ordering is the reason this is a fixture function rather than one
 * `insert().values([...])`.
 */
async function stageCycle() {
  await db.insert(genres).values([
    { id: A, name: 'Cycle A' },
    { id: B, name: 'Cycle B' },
    { id: C, name: 'Cycle C' },
    { id: OUTSIDE, name: 'Outside the loop' },
  ]);

  await db.execute(sql`UPDATE ${genres} SET parent_genre_id = ${B} WHERE id = ${A}`);
  await db.execute(sql`UPDATE ${genres} SET parent_genre_id = ${C} WHERE id = ${B}`);
  await db.execute(sql`UPDATE ${genres} SET parent_genre_id = ${A} WHERE id = ${C}`);
}

/** The ids `genreSubtree` resolves for a genre, sorted so order is not asserted. */
async function subtreeIds(genreId: string): Promise<string[]> {
  const result = await db.execute<{ id: string }>(
    sql`SELECT id FROM ${genreSubtree(genreId)} AS s`,
  );

  return result.rows.map((row) => row.id).sort();
}

describe('genreSubtree on a cyclic hierarchy', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it('the precondition holds: the staged rows really do form a closed loop', async () => {
    await stageCycle();

    /*
      Asserted explicitly rather than assumed, because every assertion below is
      vacuous if the loop did not land — three UPDATEs against a self-referential
      FK is exactly the setup that can half-apply and leave an acyclic chain,
      and an acyclic chain passes every test in this file for the wrong reason.
    */
    const rows = await db.execute<{ id: string; parent_genre_id: string }>(
      sql`SELECT id, parent_genre_id FROM ${genres} WHERE id IN (${A}, ${B}, ${C})`,
    );
    const parentOf = new Map(rows.rows.map((r) => [r.id, r.parent_genre_id]));

    expect(parentOf.get(A)).toBe(B);
    expect(parentOf.get(B)).toBe(C);
    expect(parentOf.get(C)).toBe(A);

    // Walking up from A returns to A: the definition of the cycle, stated as a
    // walk rather than as three separate edges.
    let cur = A;
    const visited: string[] = [];
    for (let step = 0; step < 4 && !visited.includes(cur); step += 1) {
      visited.push(cur);
      cur = parentOf.get(cur) as string;
    }
    expect(cur, 'walking up from A must return to A').toBe(A);
    expect(visited).toHaveLength(3);
  });

  /**
   * **The load-bearing assertion.** It terminates AND returns each member once.
   *
   * The count is what makes `UNION ALL` fail rather than merely be slower: with
   * duplicate elimination the walk revisits nothing and yields three rows; with
   * `UNION ALL` every lap around the loop re-emits all three, so the query does
   * not stop at all and this never reaches its expectation.
   */
  it('resolves a genre inside the loop to exactly its three members, once each', async () => {
    await stageCycle();

    const ids = await subtreeIds(A);

    expect(ids).toEqual([A, B, C].sort());
  });

  it('gives the same three members from every entry point in the loop', async () => {
    await stageCycle();

    /*
      Every member of a cycle has every other member beneath it, so the answer
      cannot depend on where the walk started. A guard that terminated only for
      the row it was handed would pass the test above and fail here.
    */
    const fromA = await subtreeIds(A);
    const fromB = await subtreeIds(B);
    const fromC = await subtreeIds(C);

    expect(fromB).toEqual(fromA);
    expect(fromC).toEqual(fromA);
  });

  it('does not drag unrelated genres into a cyclic subtree', async () => {
    await stageCycle();

    /*
      Termination is not the only thing that could go wrong. A walk "fixed" by
      dropping the join predicate would also terminate — and would return the
      whole table, so every collection filter would match every record. The
      fourth genre exists to make that failure visible.
    */
    const ids = await subtreeIds(A);

    expect(ids).not.toContain(OUTSIDE);
  });

  it('still resolves an ACYCLIC subtree while a cycle exists elsewhere', async () => {
    await stageCycle();

    const parent = '55555555-5555-4555-8555-555555555555';
    const child = '66666666-6666-4666-8666-666666666666';
    await db.insert(genres).values([{ id: parent, name: 'Ordinary parent' }]);
    await db.insert(genres).values([
      { id: child, name: 'Ordinary child', parentGenreId: parent },
    ]);

    /*
      The realistic shape of the bad state: one broken branch, the rest of the
      tree fine. A guard that coped by refusing to walk anything would pass every
      assertion above and take the collection down.
    */
    expect(await subtreeIds(parent)).toEqual([parent, child].sort());
    expect(await subtreeIds(child)).toEqual([child]);
  });
});
