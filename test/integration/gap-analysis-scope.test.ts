import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getTestDb, truncateAll, closeTestDb } from '../helpers/db';
import { artists, genres, recordGenres, records } from '@/db/schema';
import { latestGapAnalysis, storeGapAnalysis } from '@/lib/db/queries/gap-analysis';

/**
 * SPEC.md §12d (A45) — the genre drill-down's scope and staleness.
 *
 * **One row per SCOPE.** "What am I missing in UK82" is a different question
 * from "what am I missing", and a UK82 answer overwriting the collection-wide
 * one would discard something the user still wants (the retention mistake
 * recorded against A43). They also could not share a row: staleness means
 * something different for each.
 */

const db = getTestDb();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeTestDb();
});

const SUGGESTIONS = [{ artist: 'Crass', title: 'Feeding', reason: 'r', genre: 'UK82' }];

async function seedHierarchy() {
  const [punk] = await db.insert(genres).values({ name: 'Punk' }).returning();
  const [uk82] = await db
    .insert(genres)
    .values({ name: 'UK82', parentGenreId: punk.id })
    .returning();
  const [jazz] = await db.insert(genres).values({ name: 'Jazz' }).returning();
  return { punk, uk82, jazz };
}

async function seedRecord(name: string, genreId: string, createdAt = new Date()) {
  const [artist] = await db.insert(artists).values({ name }).returning();
  const [record] = await db
    .insert(records)
    .values({ title: `${name} LP`, artistId: artist.id, createdAt })
    .returning();
  await db.insert(recordGenres).values({ recordId: record.id, genreId });
  return record;
}

describe('scopes are stored separately', () => {
  it('a genre answer does not overwrite the collection-wide one', async () => {
    const { uk82 } = await seedHierarchy();

    await storeGapAnalysis({ suggestions: SUGGESTIONS, dropped: 0 });
    await storeGapAnalysis({ suggestions: [], dropped: 2, genreId: uk82.id });

    const wide = await latestGapAnalysis();
    const scoped = await latestGapAnalysis(uk82.id);

    expect(wide?.suggestions, 'the collection-wide answer survives').toHaveLength(1);
    expect(scoped?.dropped, 'and the genre answer is its own row').toBe(2);
  });

  it('two genre answers do not overwrite each other', async () => {
    const { uk82, jazz } = await seedHierarchy();

    await storeGapAnalysis({ suggestions: SUGGESTIONS, dropped: 0, genreId: uk82.id });
    await storeGapAnalysis({ suggestions: [], dropped: 1, genreId: jazz.id });

    expect((await latestGapAnalysis(uk82.id))?.suggestions).toHaveLength(1);
    expect((await latestGapAnalysis(jazz.id))?.dropped).toBe(1);
  });

  /** Re-asking one scope still replaces THAT scope, as A39 decided. */
  it('re-asking a scope replaces only that scope', async () => {
    const { uk82 } = await seedHierarchy();

    await storeGapAnalysis({ suggestions: SUGGESTIONS, dropped: 0 });
    await storeGapAnalysis({ suggestions: SUGGESTIONS, dropped: 0, genreId: uk82.id });
    await storeGapAnalysis({ suggestions: [], dropped: 9, genreId: uk82.id });

    expect((await latestGapAnalysis(uk82.id))?.dropped).toBe(9);
    expect((await latestGapAnalysis())?.suggestions, 'untouched').toHaveLength(1);
  });
});

describe('staleness counts records in the SCOPE, not overall', () => {
  /**
   * **Adam's requirement.** Adding five jazz records does not make a UK82 answer
   * stale, and a shared counter would say it did — which is A37's rule: a limit
   * named where it does not bite spends the credibility of the one that does.
   */
  it('ignores records added outside the genre', async () => {
    const { uk82, jazz } = await seedHierarchy();

    await storeGapAnalysis({ suggestions: SUGGESTIONS, dropped: 0, genreId: uk82.id });
    await seedRecord('Miles', jazz.id);

    const scoped = await latestGapAnalysis(uk82.id);
    expect(scoped?.recordsAddedSince, 'a jazz record does not age a UK82 answer').toBe(0);
  });

  it('counts a record added in the genre itself', async () => {
    const { uk82 } = await seedHierarchy();

    await storeGapAnalysis({ suggestions: SUGGESTIONS, dropped: 0, genreId: uk82.id });
    await seedRecord('Discharge', uk82.id);

    expect((await latestGapAnalysis(uk82.id))?.recordsAddedSince).toBe(1);
  });

  /**
   * **The case Adam named, and it is the one a direct-only count gets wrong.**
   * `Punk` has zero records of its own and gains through `UK82`, so a Punk
   * answer's staleness must walk the SAME SUBTREE the question walks — or the
   * count reports zero while the answer's scope has changed.
   */
  it('counts a record added to a DESCENDANT of the scoped genre', async () => {
    const { punk, uk82 } = await seedHierarchy();

    await storeGapAnalysis({ suggestions: SUGGESTIONS, dropped: 0, genreId: punk.id });
    await seedRecord('Discharge', uk82.id);

    expect(
      (await latestGapAnalysis(punk.id))?.recordsAddedSince,
      'Punk gains through UK82, so its staleness must too',
    ).toBe(1);
  });

  /** The collection-wide answer keeps counting every record, as A39 built it. */
  it('counts every record for the collection-wide scope', async () => {
    const { jazz, uk82 } = await seedHierarchy();

    await storeGapAnalysis({ suggestions: SUGGESTIONS, dropped: 0 });
    await seedRecord('Miles', jazz.id);
    await seedRecord('Discharge', uk82.id);

    expect((await latestGapAnalysis())?.recordsAddedSince).toBe(2);
  });
});
