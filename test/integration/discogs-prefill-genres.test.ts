import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from '../helpers/db';
import { genres } from '@/db/schema';
import { loadDiscogsPrefill } from '@/app/records/discogs-prefill';
import * as clientModule from '@/lib/discogs/client';

/**
 * §5.7's two-stage flow requires the user to VERIFY before committing — and
 * genres were invisible at stage one.
 *
 * QA on the Hot Tuna import: Discogs lists `genres: ["Rock","Blues"]` and
 * `styles: ["Blues Rock"]`, and the form's Genres row showed only the user's
 * one hand-created genre. The consolidation fixed the SAVE (the import
 * transaction derives genres from the release), so chips appeared afterwards —
 * but nothing was shown or selectable beforehand.
 *
 * That defeats the point of the two-stage flow: a record silently filed under
 * "Rock" and "Blues" when the user would have chosen differently is CLAUDE.md
 * §8's flattening concern arriving through omission rather than error.
 */

const db = getTestDb();

const HOT_TUNA = {
  id: 1458122,
  title: 'Hot Tuna',
  artists: [{ name: 'Hot Tuna' }],
  labels: [{ name: 'RCA Victor', catno: 'LSP-4353' }],
  country: 'US',
  year: 1970,
  genres: ['Rock', 'Blues'],
  styles: ['Blues Rock'],
  formats: [{ name: 'Vinyl', descriptions: ['LP', 'Album', 'Stereo'] }],
};

function mockDiscogs(payload: unknown = HOT_TUNA) {
  vi.spyOn(clientModule, 'getDiscogsClient').mockReturnValue({
    get: vi.fn(async () => payload) as unknown as clientModule.DiscogsClient['get'],
    fetchImage: vi.fn() as unknown as clientModule.DiscogsClient['fetchImage'],
  });
}

beforeEach(async () => {
  await truncateAll();
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await closeTestDb();
});

async function genreNames(): Promise<string[]> {
  const rows = await db.select({ name: genres.name }).from(genres).orderBy(genres.name);
  return rows.map((row) => row.name);
}

describe('loadDiscogsPrefill supplies genres the user can see and edit', () => {
  it('selects the genres that already exist, styles included', async () => {
    /**
     * The discriminating case for §6's mapping at the PREFILL layer: styles and
     * genres both, never flattened to the parent. "Blues Rock" is the specific
     * one and "Rock" the parent — a prefill offering only "Rock" files a blues
     * rock record under the broad genre, which is what CLAUDE.md §8 forbids.
     */
    const seeded = await db
      .insert(genres)
      .values([{ name: 'Rock' }, { name: 'Blues' }, { name: 'Blues Rock' }])
      .returning({ id: genres.id, name: genres.name });
    mockDiscogs();

    const prefill = await loadDiscogsPrefill(1458122);

    const byName = new Map(seeded.map((row) => [row.name, row.id]));
    expect([...(prefill?.values.genreIds ?? [])].sort()).toEqual(
      [byName.get('Rock'), byName.get('Blues'), byName.get('Blues Rock')].sort(),
    );
  });

  it('matches case-insensitively rather than creating a near-duplicate', async () => {
    // A collection already holding "rock" must not end up offering both.
    const [existing] = await db
      .insert(genres)
      .values({ name: 'rock' })
      .returning({ id: genres.id });
    mockDiscogs({ ...HOT_TUNA, genres: ['Rock'], styles: [] });

    const prefill = await loadDiscogsPrefill(1458122);

    expect(prefill?.values.genreIds).toEqual([existing.id]);
    expect(await genreNames(), 'no second row with a different case').toEqual(['rock']);
  });

  it('CREATES a genre the collection does not have yet, so it is selectable', async () => {
    /**
     * The judgement call, and the reason it differs from artists and labels.
     *
     * A prefill deliberately does not create artists or labels — abandoning the
     * form would leave debris nothing points at, and the inline-create box is
     * the answer there. Genres have no inline create: the form renders a
     * checkbox per EXISTING row, so an unmatched genre is not merely unselected,
     * it is unselectable. The user cannot verify what they cannot see.
     *
     * The debris is also far cheaper here: a genre is a name in a small
     * reference table, visible in /manage and deletable, versus an artist that
     * anchors a record's identity.
     */
    mockDiscogs();

    const prefill = await loadDiscogsPrefill(1458122);

    expect(await genreNames()).toEqual(['Blues', 'Blues Rock', 'Rock']);
    expect(prefill?.values.genreIds).toHaveLength(3);
  });

  it('does not duplicate genres when the same release is opened twice', async () => {
    // Opening a release, going back, and opening it again is ordinary. Each
    // visit must find what the last one created.
    mockDiscogs();

    await loadDiscogsPrefill(1458122);
    await loadDiscogsPrefill(1458122);

    expect(await genreNames()).toEqual(['Blues', 'Blues Rock', 'Rock']);
  });

  it('leaves genreIds empty for a release Discogs files under nothing', async () => {
    mockDiscogs({ ...HOT_TUNA, genres: [], styles: [] });

    const prefill = await loadDiscogsPrefill(1458122);

    expect(prefill?.values.genreIds).toEqual([]);
    expect(await genreNames(), 'and invents no rows').toEqual([]);
  });

  it('ignores absence-prose rather than creating a genre called "Unknown"', async () => {
    // Discogs encodes absence as prose in several fields; a genre row named
    // "Unknown" would be indistinguishable from one the user meant.
    mockDiscogs({ ...HOT_TUNA, genres: ['Unknown', 'Rock'], styles: [] });

    await loadDiscogsPrefill(1458122);

    expect(await genreNames()).toEqual(['Rock']);
  });
});

describe('the record page can offer them', () => {
  it('the created genres are visible to a plain reference query', async () => {
    // The form renders a checkbox per row in `genres`. If the prefill's
    // creations are not visible to that query, the ids it returns select
    // nothing — the seam between creating and offering.
    mockDiscogs();

    const prefill = await loadDiscogsPrefill(1458122);
    const all = await db.select({ id: genres.id }).from(genres);
    const offered = new Set(all.map((row) => row.id));

    for (const id of prefill?.values.genreIds ?? []) {
      expect(offered.has(id), `genre ${id} must be offered by the form`).toBe(true);
    }
  });

  it('a genre the user already had is not disturbed', async () => {
    // The QA report's "Black Metal": the one hand-created row must survive and
    // remain unselected.
    const [black] = await db
      .insert(genres)
      .values({ name: 'Black Metal' })
      .returning({ id: genres.id });
    mockDiscogs();

    const prefill = await loadDiscogsPrefill(1458122);

    expect(prefill?.values.genreIds).not.toContain(black.id);
    const still = await db.select().from(genres).where(eq(genres.id, black.id));
    expect(still).toHaveLength(1);
  });
});
