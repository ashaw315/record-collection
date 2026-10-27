import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from '../helpers/db';
import { artists, records } from '@/db/schema';
import { carriedMoods, moodSetsFor, untaggedCount } from '@/lib/db/queries/record-moods';

/**
 * Step 157 (§P.2, §P.6): what the pick reads. The pool's records carry their
 * stored sets; the untagged line counts records with no row over the WHOLE
 * collection ("Inertness is counted over the whole collection, not over what
 * a filter leaves"); an inert mood is one no tagged record carries.
 */
const db = getTestDb();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeTestDb();
});

async function seed(titles: string[]): Promise<string[]> {
  const [artist] = await db.insert(artists).values({ name: 'Alice Coltrane' }).returning();
  const rows = await db.insert(records).values(titles.map((title) => ({ title, artistId: artist.id }))).returning();
  return rows.map((r) => r.id);
}

const moodArray = (moods: string[]) => sql`ARRAY[${sql.join(moods.map((m) => sql`${m}`), sql`, `)}]::text[]`;

async function tag(recordId: string, moods: string[]) {
  await db.execute(sql`INSERT INTO record_moods (record_id, moods, tagged_at, tagged_by_model) VALUES (${recordId}, ${moodArray(moods)}, now(), 'claude-opus-5-5')`);
}

describe('moodSetsFor', () => {
  it('returns each listed record’s stored set, and omits a record with no row', async () => {
    const [a, b, c] = await seed(['Journey in Satchidananda', 'Ptah, the El Daoud', 'Universal Consciousness']);
    await tag(a, ['zone out', 'smooth']);
    await tag(b, ['sunny']);
    const sets = await moodSetsFor([a, b, c]);
    expect(sets.get(a)).toEqual(['zone out', 'smooth']);
    expect(sets.get(b)).toEqual(['sunny']);
    expect(sets.has(c), 'untagged: no entry, not an empty one').toBe(false);
  });

  it('reads only the records asked for', async () => {
    const [a, b] = await seed(['A', 'B']);
    await tag(a, ['sleepy']);
    await tag(b, ['dancing']);
    expect([...(await moodSetsFor([b])).keys()]).toEqual([b]);
  });

  it('answers an empty list with an empty map and no query that Postgres would refuse', async () => {
    expect((await moodSetsFor([])).size).toBe(0);
  });
});

describe('untaggedCount', () => {
  it('counts the records with no row, over the whole collection', async () => {
    const [a] = await seed(['A', 'B', 'C']);
    await tag(a, ['sleepy']);
    expect(await untaggedCount()).toBe(2);
  });

  it('is zero with every record tagged, and zero with no records at all', async () => {
    expect(await untaggedCount()).toBe(0);
    const [a] = await seed(['A']);
    await tag(a, ['sunny']);
    expect(await untaggedCount()).toBe(0);
  });
});

describe('carriedMoods', () => {
  it('is the set of moods any tagged record carries, each once', async () => {
    const [a, b] = await seed(['A', 'B', 'C']);
    await tag(a, ['sleepy', 'smooth']);
    await tag(b, ['smooth', 'sunny']);
    expect([...(await carriedMoods())].sort()).toEqual(['sleepy', 'smooth', 'sunny']);
  });

  it('is empty when nothing is tagged', async () => {
    await seed(['A']);
    expect((await carriedMoods()).size).toBe(0);
  });
});
