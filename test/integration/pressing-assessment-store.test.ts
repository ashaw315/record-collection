import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { eq } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from '../helpers/db';
import { artists, llmRequests, pressingAssessments, wantList } from '@/db/schema';
import {
  latestAssessment,
  storeAssessment,
  clearAssessment,
  assessmentForRecord,
  assessmentWithPrevious,
} from '@/lib/db/queries/pressing-assessment';
import { acquireWantListItem } from '@/lib/db/queries/want-list';
import { POST } from '@/app/api/want-list/[id]/pressing-assessment/route';

/*
 * `.env.test` deliberately omits ANTHROPIC_API_KEY so other specs can assert the
 * unconfigured state, and the route checks configuration before anything else —
 * so without this the A56 gate is never reached and the test measures the 503.
 */
vi.mock('@/lib/llm/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/llm/client')>();
  return { ...actual, isAnthropicConfigured: () => true };
});


/**
 * SPEC.md §12b (A43) — the stored assessment.
 *
 * **Stored because it does not go stale.** A gap analysis is a claim about a
 * collection that changes; a pressing assessment is a claim about an album's
 * pressing history, which does not — so there is no reason to ask twice, and
 * each album costs one of ten hourly requests exactly once.
 */

const db = getTestDb();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeTestDb();
});

const ASSESSMENT = {
  verdict: 'matters' as const,
  pressings: [{ description: 'First US press', identifier: 'ABC AB-1006, AB-1006-A in the runout' }],
  dropped: 1,
  orderedBy: null,
};

async function seedWanted(title = 'Aja') {
  const [artist] = await db.insert(artists).values({ name: `A-${Date.now()}` }).returning();
  const [item] = await db
    .insert(wantList)
    .values({ title, artistId: artist.id, priority: 3 })
    .returning();
  return { artistId: artist.id, itemId: item.id };
}

describe('storing and reading back', () => {
  it('round-trips the verdict, pressings and dropped count', async () => {
    const { itemId } = await seedWanted();

    await storeAssessment(itemId, ASSESSMENT);
    const stored = await latestAssessment(itemId);

    expect(stored?.verdict).toBe('matters');
    expect(stored?.pressings[0]?.identifier).toContain('AB-1006');
    expect(stored?.dropped).toBe(1);
    expect(stored?.askedAt).toBeInstanceOf(Date);
  });

  it('returns null when nothing has been asked for that row', async () => {
    const { itemId } = await seedWanted();

    expect(await latestAssessment(itemId)).toBeNull();
  });

  /**
   * **REVERSED BY A58 (2026-09-08), deliberately** — this encoded the old
   * contract correctly and the contract changed.
   *
   * It asserted one row per want-list item, on A43's argument that nothing reads
   * a superseded assessment. Accurate, and the wrong question: Adam asked twice
   * about one record and got CAD 3016 then CAD 3020 for a release numbered
   * CAD 3X38, and **the disagreement between runs is the strongest evidence
   * available that neither answer is knowledge**. Replacing destroyed it.
   *
   * The bound stays — two, not unbounded — so the "table growing for a use case
   * nobody has named" concern is answered rather than dismissed.
   */
  it('keeps the superseded answer, and does not accumulate beyond two', async () => {
    const { itemId } = await seedWanted();

    await storeAssessment(itemId, ASSESSMENT);
    await storeAssessment(itemId, { verdict: 'any-copy', pressings: [], dropped: 0, orderedBy: null });

    const stored = await latestAssessment(itemId);
    expect(stored?.verdict, 'the newest is still what latestAssessment reads').toBe('any-copy');

    const rows = await db.select().from(pressingAssessments);
    expect(rows, 'current plus one').toHaveLength(2);
  });

  /** Deleting is not editing: it removes the assessment and writes nothing. */
  it('clears an assessment without leaving a trace', async () => {
    const { itemId } = await seedWanted();
    await storeAssessment(itemId, ASSESSMENT);

    await clearAssessment(itemId);

    expect(await latestAssessment(itemId)).toBeNull();
  });

  /**
   * An `any-copy` verdict names no pressings, and that is a RESULT rather than
   * an empty row — it must read back as `any-copy`, not as nothing stored.
   */
  it('stores an any-copy verdict as a verdict, not as an absence', async () => {
    const { itemId } = await seedWanted();

    await storeAssessment(itemId, { verdict: 'any-copy', pressings: [], dropped: 0, orderedBy: null });
    const stored = await latestAssessment(itemId);

    expect(stored, 'an answered "any copy" is not the same as never asked').not.toBeNull();
    expect(stored?.verdict).toBe('any-copy');
  });
});

describe('the assessment survives acquisition', () => {
  /**
   * **Adam's requirement, and it gets a TEST rather than a comment.**
   *
   * The claim is that an assessment attached to a want-list row survives the
   * move from want list to collection, because `acquireWantListItem` sets
   * `is_acquired` and `acquired_record_id` rather than deleting (§7.3).
   *
   * **That was true in the SCHEMA and unproven in the APP** — the same shape as
   * `/want-list/:id/edit`, which was specified, absent, and unnoticed for ten
   * steps. So this exercises a REAL acquisition rather than asserting the
   * foreign key.
   *
   * Fails against an acquire path that deletes the row, and against a cascade
   * that takes the assessment with it.
   */
  it('is still readable after the want-list item is acquired', async () => {
    const { artistId, itemId } = await seedWanted('Aja');
    await storeAssessment(itemId, ASSESSMENT);

    await acquireWantListItem({
      wantListId: itemId,
      values: { title: 'Aja', artistId },
      genreIds: [],
      tagIds: [],
    });

    const [row] = await db.select().from(wantList).where(eq(wantList.id, itemId));
    expect(row?.isAcquired, 'the row is marked rather than deleted').toBe(true);
    expect(row?.acquiredRecordId, 'and links to the record it became').not.toBeNull();

    const stored = await latestAssessment(itemId);
    expect(stored?.verdict, 'the assessment outlives the hunt').toBe('matters');
  });

  /**
   * And it is reachable FROM the record, which is the direction that makes it
   * useful after acquiring — "is mine the good one" is asked on the record, not
   * on a want-list row the user has stopped looking at.
   */
  it('is reachable from the record the row became', async () => {
    const { artistId, itemId } = await seedWanted('Aja');
    await storeAssessment(itemId, ASSESSMENT);

    const record = await acquireWantListItem({
      wantListId: itemId,
      values: { title: 'Aja', artistId },
      genreIds: [],
      tagIds: [],
    });

    const found = await assessmentForRecord(record.id);
    expect(found?.verdict, 'the record can find what was said about the album').toBe('matters');
  });
});

/**
 * SPEC.md §12b (A56) — the ROUTE refuses an unanchored ask.
 *
 * **The UI gate is not the guard.** Hiding the button stops the ordinary path
 * and leaves `POST /api/want-list/:id/pressing-assessment` reachable, which
 * would spend one of ten hourly requests producing exactly the fabrication A56
 * exists to prevent. The server decides.
 */
describe('POST refuses a row with no anchor (A56)', () => {
  it('refuses when the row has no target pressing', async () => {
    const [artist] = await db.insert(artists).values({ name: 'Deerhunter' }).returning();
    const [item] = await db
      .insert(wantList)
      .values({ title: 'Halcyon Digest', artistId: artist.id, priority: 1 })
      .returning();

    const response = await POST(
      new Request(`http://localhost/api/want-list/${item.id}/pressing-assessment`, {
        method: 'POST',
      }),
      { params: Promise.resolve({ id: item.id }) },
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.message).toMatch(/target pressing/i);
  });

  /** Fails against a gate that spends a rate-limit slot before refusing. */
  it('does not spend a request slot on a refusal', async () => {
    const [artist] = await db.insert(artists).values({ name: 'Deerhunter' }).returning();
    const [item] = await db
      .insert(wantList)
      .values({ title: 'Halcyon Digest', artistId: artist.id, priority: 1 })
      .returning();

    await POST(
      new Request(`http://localhost/api/want-list/${item.id}/pressing-assessment`, {
        method: 'POST',
      }),
      { params: Promise.resolve({ id: item.id }) },
    );

    const rows = await db.select().from(llmRequests);
    expect(rows, 'a refusal is not an ask').toHaveLength(0);
  });
});

/**
 * SPEC.md §12b (A58, 2026-09-08) — current plus one, so disagreement is visible.
 *
 * **The finding this exists for, and it generalises past this feature.** Adam
 * asked twice about the same record and got CAD 3016, then CAD 3020, for a
 * release numbered CAD 3X38. **The disagreement between runs is the strongest
 * evidence available that neither answer is knowledge** — and the one-per-row
 * design destroyed it. He only caught it because he happened to ask twice and
 * remember.
 *
 * A39 made this argument for gap analyses and the same reasoning applies: a
 * design that keeps only the latest answer cannot show that the answers disagree.
 */
describe('assessment retention keeps current plus one (A58)', () => {
  async function row() {
    const [artist] = await db.insert(artists).values({ name: 'Deerhunter' }).returning();
    const [item] = await db
      .insert(wantList)
      .values({ title: 'Halcyon Digest', artistId: artist.id, priority: 1 })
      .returning();
    return item.id;
  }

  const answer = (identifier: string) => ({
    verdict: 'matters' as const,
    orderedBy: null,
    pressings: [{ description: 'd', identifier }],
    dropped: 0,
  });

  /**
   * Fails against the unique constraint on `want_list_id` — the shipped schema,
   * which makes a second row impossible.
   */
  it('keeps the previous answer alongside the current one', async () => {
    const id = await row();

    await storeAssessment(id, answer('CAD 3016'));
    await storeAssessment(id, answer('CAD 3020'));

    const { current, previous } = await assessmentWithPrevious(id);

    expect(current?.pressings[0]?.identifier).toBe('CAD 3020');
    expect(previous?.pressings[0]?.identifier, 'the disagreement must survive').toBe('CAD 3016');
  });

  /** Fails against unbounded growth: a third ask drops the oldest. */
  it('keeps at most two', async () => {
    const id = await row();

    await storeAssessment(id, answer('one'));
    await storeAssessment(id, answer('two'));
    await storeAssessment(id, answer('three'));

    const rows = await db.select().from(pressingAssessments).where(eq(pressingAssessments.wantListId, id));
    expect(rows).toHaveLength(2);

    const { current, previous } = await assessmentWithPrevious(id);
    expect(current?.pressings[0]?.identifier).toBe('three');
    expect(previous?.pressings[0]?.identifier).toBe('two');
  });

  /**
   * `previous` is null after ONE ask, which is not the same as a previous answer
   * that was empty — A39's absent-versus-empty distinction, one row down.
   */
  it('has no previous after a single ask', async () => {
    const id = await row();

    await storeAssessment(id, answer('only'));

    const { current, previous } = await assessmentWithPrevious(id);
    expect(current).not.toBeNull();
    expect(previous).toBeNull();
  });

  /** `latestAssessment` must still return the newest, unchanged for callers. */
  it('leaves latestAssessment reading the newest', async () => {
    const id = await row();

    await storeAssessment(id, answer('older'));
    await storeAssessment(id, answer('newer'));

    expect((await latestAssessment(id))?.pressings[0]?.identifier).toBe('newer');
  });
});
