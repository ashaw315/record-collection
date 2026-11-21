import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from '../helpers/db';
import { artists } from '@/db/schema';
import * as clientModule from '@/lib/musicbrainz/client';
import { resolveArtistByName } from '@/lib/musicbrainz/resolve-by-name';

/**
 * **Q37's second half, part two (the coordinator's yes, 20 Nov): an artist with no MBID is resolved by name under the
 * stated rule, and an ambiguous or absent match stores NOTHING.** Exactly one search hit carrying the artist's own
 * normalised name (a Discogs suffix stripped) is accepted: its MBID is stored, and the walk runs, which writes the
 * band's formed year, origin and members. Two hits with the name, none, or a hit whose MBID another artist already
 * holds store no MBID, no fact, no placeholder. Fails against a resolver that stores a guess, one that searches the
 * suffixed name, and one that re-searches an artist whose id is already known.
 */
const db = getTestDb();

type Hit = { id: string; name: string; score: number };
type Linked = Array<{ id: string; name: string }> | 'missing';
function mockMusicBrainz(hitsByQuery: Record<string, Hit[]>, payloadByMbid: Record<string, Record<string, unknown>> = {}, linkedByDiscogsId: Record<string, Linked> = {}) {
  const queries: string[] = [];
  const lookups: string[] = [];
  const get = vi.fn(async (path: string) => {
    const u = /\/url\?resource=([^&]+)/.exec(path);
    if (u !== null) {
      const resource = decodeURIComponent(u[1]);
      lookups.push(resource);
      const discogsId = /artist\/(\d+)$/.exec(resource)?.[1] ?? '';
      const linked = linkedByDiscogsId[discogsId];
      if (linked === undefined || linked === 'missing') throw new clientModule.MusicBrainzError('MusicBrainz has no record of that artist.', { status: 404 });
      return { resource, relations: linked.map((a) => ({ type: 'discogs', direction: 'backward', 'target-type': 'artist', artist: { id: a.id, name: a.name, type: 'Group' } })) };
    }
    const q = /\/artist\?query=([^&]+)/.exec(path);
    if (q !== null) {
      const name = decodeURIComponent(q[1]);
      queries.push(name);
      return { artists: hitsByQuery[name] ?? [] };
    }
    const mbid = /artist\/([^?]+)/.exec(path)?.[1] ?? '';
    return { id: mbid, name: mbid, relations: [], ...(payloadByMbid[mbid] ?? {}) };
  });
  vi.spyOn(clientModule, 'getMusicBrainzClient').mockReturnValue({ get: get as unknown as clientModule.MusicBrainzClient['get'] });
  return { get, queries, lookups };
}

const row = async (id: string) =>
  (await db.execute<{ musicbrainz_id: string | null; formed_year: number | null; origin_country: string | null }>(sql`SELECT musicbrainz_id, formed_year, origin_country FROM artists WHERE id = ${id}`)).rows[0];

beforeEach(async () => {
  await truncateAll();
});
afterEach(() => {
  vi.restoreAllMocks();
});
afterAll(async () => {
  await closeTestDb();
});

describe('resolveArtistByName', () => {
  it('accepts the one hit with the artist’s name: the MBID is stored and the walk fills the facts', async () => {
    const [hotTuna] = await db.insert(artists).values({ name: 'Hot Tuna' }).returning();
    mockMusicBrainz(
      { 'Hot Tuna': [{ id: 'mb-revival', name: 'Hot Tuna Revival', score: 100 }, { id: 'mb-hot-tuna', name: 'Hot Tuna', score: 71 }] },
      { 'mb-hot-tuna': { type: 'Group', 'life-span': { begin: '1969' }, 'begin-area': { name: 'San Francisco' }, area: { name: 'United States' } } },
    );
    const outcome = await resolveArtistByName(hotTuna.id);
    expect(outcome).toMatchObject({ outcome: 'resolved', mbid: 'mb-hot-tuna' });
    expect(await row(hotTuna.id)).toEqual({ musicbrainz_id: 'mb-hot-tuna', formed_year: 1969, origin_country: 'San Francisco, United States' });
  });

  it('refuses a shared name and stores nothing, naming how many carried it', async () => {
    const [smerz] = await db.insert(artists).values({ name: 'Smerz (2)' }).returning();
    const mb = mockMusicBrainz({ Smerz: [{ id: 'mb-smerz-1', name: 'Smerz', score: 100 }, { id: 'mb-smerz-2', name: 'Smerz', score: 90 }] });
    expect(await resolveArtistByName(smerz.id)).toEqual({ outcome: 'refused', reason: 'shared-name', sameName: 2, hits: 2 });
    expect(mb.queries, 'the suffix is stripped for the search').toEqual(['Smerz']);
    expect(await row(smerz.id)).toEqual({ musicbrainz_id: null, formed_year: null, origin_country: null });
  });

  it('refuses when no hit carries the name, and stores nothing', async () => {
    const [carpenters] = await db.insert(artists).values({ name: 'Carpenters' }).returning();
    mockMusicBrainz({ Carpenters: [{ id: 'mb-the-carpenters', name: 'The Carpenters', score: 100 }] });
    expect(await resolveArtistByName(carpenters.id)).toEqual({ outcome: 'refused', reason: 'no-hit', sameName: 0, hits: 1 });
    expect(await row(carpenters.id)).toMatchObject({ musicbrainz_id: null });
  });

  it('refuses a hit whose MBID another artist already holds, and stores nothing', async () => {
    const [holder] = await db.insert(artists).values({ name: 'Discharge', musicbrainzId: 'mb-discharge' }).returning();
    const [dupe] = await db.insert(artists).values({ name: 'Discharge' }).returning();
    mockMusicBrainz({ Discharge: [{ id: 'mb-discharge', name: 'Discharge', score: 100 }] });
    expect(await resolveArtistByName(dupe.id)).toEqual({ outcome: 'refused', reason: 'held-by-other', holderId: holder.id, holderName: 'Discharge' });
    expect(await row(dupe.id)).toMatchObject({ musicbrainz_id: null });
  });

  it('does not search for an artist whose MBID is already known', async () => {
    const [known] = await db.insert(artists).values({ name: 'Dire Straits', musicbrainzId: 'mb-dire' }).returning();
    const mb = mockMusicBrainz({});
    expect(await resolveArtistByName(known.id)).toEqual({ outcome: 'already', mbid: 'mb-dire' });
    expect(mb.get).not.toHaveBeenCalled();
  });

  it('answers null for an artist that does not exist', async () => {
    expect(await resolveArtistByName('00000000-0000-4000-8000-000000000000')).toBeNull();
  });
});

describe('the exact path first: the Discogs artist id, looked up as a MusicBrainz URL relationship (the coordinator, 21 Nov)', () => {
  /*
    Measured before building: 37 of 49 collection artists link through their Discogs page, and the link answers every
    case the name rule refused for ambiguity, correctly. So the link is tried first, keyed on the Discogs artist id the
    import holds, and the name rule is the fallback where no link exists, its refusal unchanged. Fails against a resolver
    that searches by name when a link exists, one that guesses among two artists linked to one page, one that lets a
    missing link end the attempt rather than fall back, and a dry run that writes.
  */
  const facts = { type: 'Group', 'life-span': { begin: '2011' }, 'begin-area': { name: 'New York' }, area: { name: 'United States' } };

  it('resolves through the link without a name search, even where the name is shared', async () => {
    const [darkside] = await db.insert(artists).values({ name: 'Darkside (22)', discogsArtistId: 2522005 }).returning();
    const mb = mockMusicBrainz(
      { Darkside: [{ id: 'mb-darkside-at', name: 'Darkside', score: 100 }, { id: 'mb-darkside-nyc', name: 'DARKSIDE', score: 99 }] },
      { 'mb-darkside-nyc': facts },
      { '2522005': [{ id: 'mb-darkside-nyc', name: 'DARKSIDE' }] },
    );
    expect(await resolveArtistByName(darkside.id)).toMatchObject({ outcome: 'resolved', path: 'link', mbid: 'mb-darkside-nyc' });
    expect(mb.lookups).toEqual(['https://www.discogs.com/artist/2522005']);
    expect(mb.queries, 'no name search when the link answers').toEqual([]);
    expect(await row(darkside.id)).toEqual({ musicbrainz_id: 'mb-darkside-nyc', formed_year: 2011, origin_country: 'New York, United States' });
  });

  it('falls back to the name rule where MusicBrainz has no page for that Discogs id', async () => {
    const [inkSpots] = await db.insert(artists).values({ name: 'The Ink Spots (3)', discogsArtistId: 15829856 }).returning();
    const mb = mockMusicBrainz({ 'The Ink Spots': [{ id: 'mb-ink-spots', name: 'The Ink Spots', score: 100 }] }, { 'mb-ink-spots': { type: 'Group', 'life-span': { begin: '1934' } } }, { '15829856': 'missing' });
    expect(await resolveArtistByName(inkSpots.id)).toMatchObject({ outcome: 'resolved', path: 'name', mbid: 'mb-ink-spots' });
    expect(mb.lookups).toHaveLength(1);
    expect(mb.queries).toEqual(['The Ink Spots']);
  });

  it('never guesses among two artists linked to one Discogs page: the name rule decides, and refuses a shared name', async () => {
    const [smerz] = await db.insert(artists).values({ name: 'Smerz (2)', discogsArtistId: 5391896 }).returning();
    mockMusicBrainz(
      { Smerz: [{ id: 'mb-smerz-1', name: 'Smerz', score: 100 }, { id: 'mb-smerz-2', name: 'Smerz', score: 90 }] },
      {},
      { '5391896': [{ id: 'mb-smerz-1', name: 'Smerz' }, { id: 'mb-smerz-2', name: 'Smerz' }] },
    );
    expect(await resolveArtistByName(smerz.id)).toEqual({ outcome: 'refused', reason: 'shared-name', sameName: 2, hits: 2 });
    expect(await row(smerz.id)).toMatchObject({ musicbrainz_id: null });
  });

  it('a dry run says what it would do, by which path, and writes nothing', async () => {
    const [darkside] = await db.insert(artists).values({ name: 'Darkside (22)', discogsArtistId: 2522005 }).returning();
    const mb = mockMusicBrainz({}, { 'mb-darkside-nyc': facts }, { '2522005': [{ id: 'mb-darkside-nyc', name: 'DARKSIDE' }] });
    expect(await resolveArtistByName(darkside.id, { dryRun: true })).toEqual({ outcome: 'would-resolve', path: 'link', mbid: 'mb-darkside-nyc', name: 'DARKSIDE' });
    expect(await row(darkside.id)).toEqual({ musicbrainz_id: null, formed_year: null, origin_country: null });
    expect(mb.get, 'the lookup alone, no walk').toHaveBeenCalledTimes(1);
  });
});
