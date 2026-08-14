import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from '../helpers/db';
import { artists, records } from '@/db/schema';
import {
  recordMatchCandidates,
  listOpenMatchCandidates,
  resolveMatchCandidate,
} from '@/lib/db/queries/artist-match-candidates';

/**
 * SPEC.md §4.3 — possible duplicate artists, recorded during an import and
 * reviewed afterwards in `/manage`.
 *
 * **The review is asymmetric by design.** A wrong merge is invisible and
 * self-reinforcing: every later import matches the MBID attached in error, so
 * the mistake stops presenting as a name collision. A wrong "distinct" is
 * visible and cheap — two artists sit in the list and the user merges them
 * later. So "distinct" must be as easy and as DURABLE as "merge", or the
 * review degrades into a merge button with extra steps.
 */

const db = getTestDb();

const DBEAT = '0c9bfbdc-4e64-497d-bf80-5c891e6766a3';

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeTestDb();
});

async function twoDischarges() {
  const [imported] = await db
    .insert(artists)
    .values({ name: 'Discharge', musicbrainzId: DBEAT })
    .returning();
  const [local] = await db
    .insert(artists)
    .values({ name: 'Discharge', musicbrainzId: null, formedYear: 1977 })
    .returning();

  return { imported, local };
}

const countCandidates = async () => {
  const result = await db.execute<{ n: number }>(
    sql`SELECT COUNT(*)::int AS n FROM artist_match_candidates`,
  );
  return result.rows[0].n;
};

describe('recording a possible match', () => {
  it('records one row per candidate', async () => {
    const { imported, local } = await twoDischarges();

    await recordMatchCandidates(imported.id, [local.id]);

    expect(await countCandidates()).toBe(1);
  });

  it('records EVERY candidate, not just the first', async () => {
    /**
     * A name can match two hand-entered rows. This is the reason §4.3 makes it
     * a table — a column would hold one and drop the other silently.
     */
    const { imported } = await twoDischarges();
    const [second] = await db.insert(artists).values({ name: 'Discharge' }).returning();
    const [third] = await db.insert(artists).values({ name: 'Discharge' }).returning();

    await recordMatchCandidates(imported.id, [second.id, third.id]);

    expect(await countCandidates()).toBe(2);
  });

  it('writes nothing when there are no candidates', async () => {
    // The common case once artists carry MBIDs. An empty INSERT is a syntax
    // error, so this is a real branch.
    const { imported } = await twoDischarges();

    await expect(recordMatchCandidates(imported.id, [])).resolves.not.toThrow();
    expect(await countCandidates()).toBe(0);
  });

  it('a re-import raises nothing new', async () => {
    /**
     * §4.3. The import is on-demand and cached, so the same walk runs again —
     * and a review that regrew its own backlog on every pass would never empty.
     */
    const { imported, local } = await twoDischarges();

    await recordMatchCandidates(imported.id, [local.id]);
    await recordMatchCandidates(imported.id, [local.id]);
    await recordMatchCandidates(imported.id, [local.id]);

    expect(await countCandidates()).toBe(1);
  });
});

describe('the decision persists — both ways', () => {
  /**
   * **The load-bearing property of this unit.** If "distinct" did not survive a
   * re-import, the same pair would reappear in the review for ever and the only
   * way to silence it would be to merge — which is precisely the asymmetric
   * failure §4.3 warns about, arrived at through the UI rather than the code.
   */

  it('a re-import does NOT reopen a pair marked distinct', async () => {
    const { imported, local } = await twoDischarges();
    await recordMatchCandidates(imported.id, [local.id]);

    const [open] = await listOpenMatchCandidates();
    await resolveMatchCandidate(open.id, 'distinct');

    await recordMatchCandidates(imported.id, [local.id]);

    expect(await listOpenMatchCandidates(), 'stays answered').toEqual([]);
    expect(await countCandidates(), 'and the answer is still on file').toBe(1);
  });

  it('a re-import does not reopen a pair marked merged either', async () => {
    const { imported, local } = await twoDischarges();
    await recordMatchCandidates(imported.id, [local.id]);

    const [open] = await listOpenMatchCandidates();
    await resolveMatchCandidate(open.id, 'merged');

    await recordMatchCandidates(imported.id, [local.id]);

    expect(await listOpenMatchCandidates()).toEqual([]);
  });

  it('stamps WHEN it was decided, not only what', async () => {
    // `resolved_at` is what distinguishes "answered distinct" from "never
    // asked" — both leave the pair absent from the review.
    const { imported, local } = await twoDischarges();
    await recordMatchCandidates(imported.id, [local.id]);

    const [open] = await listOpenMatchCandidates();
    await resolveMatchCandidate(open.id, 'distinct');

    const row = await db.execute<{ resolution: string; resolved_at: Date | null }>(
      sql`SELECT resolution, resolved_at FROM artist_match_candidates WHERE id = ${open.id}`,
    );
    expect(row.rows[0].resolution).toBe('distinct');
    expect(row.rows[0].resolved_at).not.toBeNull();
  });

  it('refuses a resolution outside the two the spec names', async () => {
    const { imported, local } = await twoDischarges();
    await recordMatchCandidates(imported.id, [local.id]);
    const [open] = await listOpenMatchCandidates();

    await expect(
      resolveMatchCandidate(open.id, 'maybe' as 'merged' | 'distinct'),
    ).rejects.toThrow();
  });
});

describe('the review has enough context to decide', () => {
  /**
   * **Two names are not enough, by construction.** The pair is a candidate
   * BECAUSE the names are identical, so a review showing only names shows
   * nothing — the user would be choosing at random. §4.3's whole argument for
   * deferring the question is that a later review has context a mid-walk
   * prompt does not.
   */

  it('returns both artists’ distinguishing fields, not just their names', async () => {
    const { imported, local } = await twoDischarges();
    await db.execute(
      sql`UPDATE artists SET origin_country = 'GB', formed_year = 1977 WHERE id = ${imported.id}`,
    );

    await recordMatchCandidates(imported.id, [local.id]);

    const [open] = await listOpenMatchCandidates();

    expect(open.artist.name).toBe('Discharge');
    expect(open.candidate.name, 'identical, which is the point').toBe('Discharge');

    expect(open.artist.musicbrainzId, 'the imported one has an id').toBe(DBEAT);
    expect(open.candidate.musicbrainzId, 'the local one does not').toBeNull();
    expect(open.artist.formedYear).toBe(1977);
    expect(open.artist.originCountry).toBe('GB');
  });

  it('counts the records attached to each side', async () => {
    /**
     * The strongest signal available: an artist with eleven records is the one
     * the user has been collecting, and an imported row with none is new. A
     * review that omitted this would send the user to another screen to find
     * out — and they would merge rather than go.
     */
    const { imported, local } = await twoDischarges();
    await db.insert(records).values([
      { title: 'Hear Nothing', artistId: local.id },
      { title: 'Why', artistId: local.id },
    ]);

    await recordMatchCandidates(imported.id, [local.id]);

    const [open] = await listOpenMatchCandidates();

    expect(open.candidate.recordCount).toBe(2);
    expect(open.artist.recordCount, 'the freshly imported row has none yet').toBe(0);
  });

  it('lists nothing once every pair is decided', async () => {
    const { imported, local } = await twoDischarges();
    await recordMatchCandidates(imported.id, [local.id]);

    const [open] = await listOpenMatchCandidates();
    await resolveMatchCandidate(open.id, 'distinct');

    expect(await listOpenMatchCandidates()).toEqual([]);
  });
});

describe('candidates follow their artists', () => {
  it('disappears when either artist is deleted', async () => {
    /**
     * §4.3's cascade reasoning: a candidate pointing at a deleted artist is
     * meaningless, and without the cascade deleting an artist would fail on an
     * FK violation.
     */
    const { imported, local } = await twoDischarges();
    await recordMatchCandidates(imported.id, [local.id]);

    await db.execute(sql`DELETE FROM artists WHERE id = ${local.id}`);

    expect(await countCandidates()).toBe(0);
  });
});
