import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getTestDb, truncateAll, closeTestDb } from '../helpers/db';
import { artists, artistDerivedActs } from '@/db/schema';
import { saveDerivedActs } from '@/lib/db/queries/artist-derived-acts';

/**
 * SPEC.md §9.1 (A48) — persisting the relations that state intent.
 *
 * **Idempotent, because every row is DERIVED from a MusicBrainz payload.** The
 * walk re-runs, the cache expires at 90 days and re-fetches, and neither may
 * multiply rows — the same hazard §4.3's `NULLS NOT DISTINCT` fixes for
 * memberships, where a missed conflict clause silently doubled the weight on
 * every pass.
 */

const db = getTestDb();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeTestDb();
});

async function artist(name: string) {
  const [row] = await db.insert(artists).values({ name }).returning();
  return row;
}

describe('saving derived acts (A48)', () => {
  it('writes a tribute relation', async () => {
    const origin = await artist('Dire Straits');
    const derived = await artist('The Dire Straits Experience');

    await saveDerivedActs([
      { originArtistId: origin.id, derivedArtistId: derived.id, kind: 'tribute' },
    ]);

    const rows = await db.select().from(artistDerivedActs);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('tribute');
  });

  /**
   * Fails against a save with no conflict clause — the failure that is silent
   * rather than loud: nothing errors, and the table grows on every walk.
   */
  it('is idempotent across repeated walks', async () => {
    const origin = await artist('Black Flag');
    const derived = await artist('FLAG');
    const row = {
      originArtistId: origin.id,
      derivedArtistId: derived.id,
      kind: 'subgroup' as const,
    };

    await saveDerivedActs([row]);
    await saveDerivedActs([row]);
    await saveDerivedActs([row]);

    expect(await db.select().from(artistDerivedActs)).toHaveLength(1);
  });

  /** An artist with no tribute or subgroup relations is the common case. */
  it('accepts an empty list without erroring', async () => {
    await expect(saveDerivedActs([])).resolves.toBeUndefined();
  });

  /**
   * Fails against a save that lets a payload naming the asked-about artist
   * write a self-reference. The CHECK constraint exists for this; the query
   * must not throw where the constraint would.
   */
  it('skips a self-reference rather than throwing', async () => {
    const same = await artist('Some Band');

    await expect(
      saveDerivedActs([
        { originArtistId: same.id, derivedArtistId: same.id, kind: 'tribute' },
      ]),
    ).resolves.toBeUndefined();

    expect(await db.select().from(artistDerivedActs)).toHaveLength(0);
  });
});
