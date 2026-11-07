import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from '../helpers/db';
import { writeCachedRelease } from '@/lib/discogs/cache';
import { backfillReleaseText, releaseTextFor } from '@/lib/discogs/release-text-store';

/**
 * The free-text unit's storage (the coordinator, 4 Nov): `discogs_release_text`,
 * the searchable text of every cached release, derived where the payload is
 * written so that every path that caches a release fills it, and a backfill
 * over the cache for the releases cached before the table existed.
 *
 * Against the real test database. Fails against a `writeCachedRelease` that
 * writes the payload alone, a rewrite that appends rather than replaces, a
 * backfill that skips rows or doubles them, and a migration without the
 * trigram index the search's `%` needs.
 */
const db = getTestDb();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeTestDb();
});

const RELEASE = {
  id: 11029111,
  title: 'Hear Nothing See Nothing Say Nothing',
  tracklist: [{ position: 'A1', title: 'The Blood Runs Red', duration: '2:52' }, { position: 'A2', title: 'The Price Of Silence', duration: '' }],
  extraartists: [{ name: 'Mike Stone (2)', role: 'Producer', tracks: '' }],
  companies: [{ name: 'Orlake Records Ltd.', entity_type_name: 'Pressed By' }],
  notes: 'Includes a lyric sheet.',
};

type Row = { kind: string; ordinal: number; text: string; detail: string | null };

async function rowsFor(releaseId: number): Promise<Row[]> {
  const result = await db.execute(
    sql`SELECT kind, ordinal, text, detail FROM discogs_release_text WHERE discogs_release_id = ${releaseId} ORDER BY kind, ordinal`,
  );
  return (result.rows as Row[]).map((r) => ({ kind: r.kind, ordinal: Number(r.ordinal), text: r.text, detail: r.detail }));
}

describe('discogs_release_text is written where the payload is', () => {
  it('writeCachedRelease derives the release’s text rows beside the payload', async () => {
    await writeCachedRelease(RELEASE.id, RELEASE);
    expect(await rowsFor(RELEASE.id)).toEqual([
      { kind: 'company', ordinal: 0, text: 'Orlake Records Ltd.', detail: 'Pressed By' },
      { kind: 'credit', ordinal: 0, text: 'Mike Stone (2)', detail: 'Producer' },
      { kind: 'track', ordinal: 0, text: 'The Blood Runs Red', detail: 'A1' },
      { kind: 'track', ordinal: 1, text: 'The Price Of Silence', detail: 'A2' },
    ]);
  });

  it('a refreshed payload replaces the rows rather than adding to them', async () => {
    await writeCachedRelease(RELEASE.id, RELEASE);
    await writeCachedRelease(RELEASE.id, { ...RELEASE, tracklist: [{ position: 'A1', title: 'Renamed', duration: '' }], extraartists: [], companies: [], notes: '' });
    expect(await rowsFor(RELEASE.id)).toEqual([{ kind: 'track', ordinal: 0, text: 'Renamed', detail: 'A1' }]);
  });
});

describe('the backfill over the cache', () => {
  async function seedCacheOnly(id: number, payload: unknown) {
    /* A row written before the table existed: the payload alone, as every cache row was until this unit. */
    await db.execute(sql`INSERT INTO discogs_cache (discogs_release_id, payload, fetched_at) VALUES (${id}, ${JSON.stringify(payload)}::jsonb, now())`);
  }

  it('fills the rows of every cached release that has none, counts them, and is idempotent', async () => {
    await seedCacheOnly(1, RELEASE);
    /* Notes only: nothing is derived from release notes (§W.24, 4 Nov), so this release stands with no rows and still counts as read. */
    await seedCacheOnly(2, { ...RELEASE, id: 2, tracklist: [], extraartists: [], companies: [], notes: 'Only notes.' });
    await seedCacheOnly(3, { id: 3, title: 'Nothing to say' });
    const first = await backfillReleaseText();
    expect(first).toEqual({ releases: 3, rows: 4 });
    expect((await rowsFor(1)).length).toBe(4);
    expect(await rowsFor(2)).toEqual([]);
    expect(await rowsFor(3)).toEqual([]);
    const second = await backfillReleaseText();
    expect(second).toEqual({ releases: 3, rows: 4 });
    expect((await rowsFor(1)).length).toBe(4);
  });
});

/*
  What the record page reads for its TRACKLIST section (§65, step 172): one release's rows in the order the section
  draws them, the tracks, then the credits, then the companies, each in the release's own order, which is the order
  `releaseText` gave them ordinals in. Fails against a read ordered as the table stores it (kind alphabetically puts
  the companies first), by text, or across releases; and against a read that returns anything for a release with no
  cached text, where §38's rule draws no section.
*/
describe('releaseTextFor: one release’s text, in the order the section draws it', () => {
  it('returns the tracks, then the credits, then the companies, each by ordinal, and nothing of another release', async () => {
    await writeCachedRelease(RELEASE.id, {
      ...RELEASE,
      tracklist: [
        { position: 'A1', title: 'The Blood Runs Red', duration: '', extraartists: [{ name: 'Cal', role: 'Vocals' }] },
        { position: 'A2', title: 'Anarchy', duration: '' },
      ],
      extraartists: [{ name: 'Mike Stone (2)', role: 'Producer' }, { name: 'BilBo (3)', role: 'Lacquer Cut By' }],
      companies: [{ name: 'Orlake Records Ltd.', entity_type_name: 'Pressed By' }, { name: 'Clay Records', entity_type_name: 'Phonographic Copyright (p)' }],
    });
    await writeCachedRelease(42, { id: 42, tracklist: [{ position: 'A1', title: 'Elsewhere' }] });
    expect(await releaseTextFor(RELEASE.id)).toEqual([
      { kind: 'track', text: 'The Blood Runs Red', detail: 'A1' },
      { kind: 'track', text: 'Anarchy', detail: 'A2' },
      { kind: 'credit', text: 'Mike Stone (2)', detail: 'Producer' },
      { kind: 'credit', text: 'BilBo (3)', detail: 'Lacquer Cut By' },
      { kind: 'credit', text: 'Cal', detail: 'Vocals, A1' },
      { kind: 'company', text: 'Orlake Records Ltd.', detail: 'Pressed By' },
      { kind: 'company', text: 'Clay Records', detail: 'Phonographic Copyright (p)' },
    ]);
  });

  it('returns nothing for a release with no cached text, beside one that has some', async () => {
    await writeCachedRelease(42, { id: 42, tracklist: [{ position: 'A1', title: 'Elsewhere' }] });
    expect(await releaseTextFor(999)).toEqual([]);
  });
});

describe('the migration', () => {
  it('gives the text a trigram index, which the search’s likeness operator needs', async () => {
    const result = await db.execute(sql`SELECT indexdef FROM pg_indexes WHERE tablename = 'discogs_release_text'`);
    const defs = (result.rows as { indexdef: string }[]).map((r) => r.indexdef);
    expect(defs.some((d) => /USING gin \(text gin_trgm_ops\)/.test(d)), defs.join('\n')).toBe(true);
  });
});
