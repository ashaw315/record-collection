import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { artistInfluences, artists, genres, recordGenres, records } from '@/db/schema';
import { ARTICLES, nameSortKey } from '@/lib/db/name-sort';
import { listArtists } from '@/lib/db/queries/artists';
import { listInfluencesFor } from '@/lib/db/queries/influences';
import { listRecords, listRecordsForSheet } from '@/lib/db/queries/records';
import { shelfRecords } from '@/lib/db/queries/shelf';
import type { Offset } from '@/lib/api/query-params';
import { closeTestDb, getTestDb, truncateAll } from '../helpers/db';

/**
 * **§T.4, the name sort key (Table and Grid card; Adam, 10 Nov; Design 10 and 11 Nov):** "Wherever a record is put
 * in order by its artist or its title, it is ordered by a key that drops a leading “The” followed by a space, and
 * compares the rest without regard to case; the name drawn is never changed." Adam looks for A Tribe Called Quest
 * under A, so only "The" is dropped (refs/drops/2026-11-11-02); "Theatre Of Hate", with no space after the word,
 * keeps it; a name in another language keeps its first word.
 *
 * These are DATABASE assertions, not unit ones: the key is one Drizzle SQL fragment evaluated by Postgres in each
 * ORDER BY, so the only place its behaviour can be read is a seeded database. A JS re-implementation asserted in a unit
 * test would be a second key, and the thing that could drift from the first.
 *
 * Collation: the test database decides how a space sorts against a hyphen, so the three A names are asserted as the
 * set that opens the list, and the total order is asserted only where every adjacent pair differs by letter.
 */
const db = getTestDb();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeTestDb();
});

async function artist(name: string): Promise<string> {
  const [row] = await db.insert(artists).values({ name }).returning({ id: artists.id });
  return row.id;
}

async function record(title: string, artistId: string, genreId: string, releaseYear = 1980): Promise<string> {
  const [row] = await db.insert(records).values({ title, artistId, releaseYear }).returning({ id: records.id });
  await db.insert(recordGenres).values({ recordId: row.id, genreId });
  return row.id;
}

/** Ten artists, one record each, every record in one genre so the shelf has one run and only the key orders it. */
async function seed(): Promise<void> {
  const [punk] = await db.insert(genres).values({ name: 'Punk' }).returning({ id: genres.id });
  const pairs: Array<[string, string]> = [
    ['The Doors', 'Strange Days'],
    ['A Tribe Called Quest', 'Midnight Marauders'],
    ['The The', 'Soul Mining'],
    ['An Pierlé', 'Mud Stories'],
    ['A-ha', 'Hunting High And Low'],
    ['Theatre Of Hate', 'Westworld'],
    ['Die Ärzte', 'Debil'],
    ['Pink Floyd', 'The Dark Side Of The Moon'],
    ['the cramps', 'Songs The Lord Taught Us'],
    ['Buzzcocks', 'Another Music In A Different Kitchen'],
  ];
  for (const [name, title] of pairs) await record(title, await artist(name), punk.id);
}

const A_NAMES = ['A Tribe Called Quest', 'A-ha', 'An Pierlé'];
const AFTER_A = ['Buzzcocks', 'the cramps', 'Die Ärzte', 'The Doors', 'Pink Floyd', 'The The', 'Theatre Of Hate'];
const TITLES = [
  'Another Music In A Different Kitchen',
  'The Dark Side Of The Moon',
  'Debil',
  'Hunting High And Low',
  'Midnight Marauders',
  'Mud Stories',
  'Songs The Lord Taught Us',
  'Soul Mining',
  'Strange Days',
  'Westworld',
];

/** The three A names open the list in some order, and the rest follow in this one; every drawn name is itself. */
function expectArtistOrder(names: string[]): void {
  expect(new Set(names.slice(0, 3)), names.join(' | ')).toEqual(new Set(A_NAMES));
  expect(names.slice(3), names.join(' | ')).toEqual(AFTER_A);
}

const key = async (name: string): Promise<string> =>
  (await db.execute<{ key: string }>(sql`SELECT ${nameSortKey(sql`${name}::text`)} AS key`)).rows[0].key;

describe('nameSortKey, the one fragment (src/lib/db/name-sort.ts)', () => {
  it('holds "The" as the only article, in one list', () => {
    expect([...ARTICLES]).toEqual(['The']);
  });

  it('drops a leading "The" followed by a space, and lowers the rest', async () => {
    expect(await key('The Doors')).toBe('doors');
    expect(await key('The The')).toBe('the');
    expect(await key('The Dark Side Of The Moon')).toBe('dark side of the moon');
  });

  it('compares "the doors" and "The Doors" equal', async () => {
    expect(await key('the doors')).toBe(await key('The Doors'));
  });

  it('keeps "A" and "An", so A Tribe Called Quest and An Pierlé are under A', async () => {
    expect(await key('A Tribe Called Quest')).toBe('a tribe called quest');
    expect(await key('An Pierlé')).toBe('an pierlé');
  });

  it('keeps "Theatre Of Hate", with no space after the word, and a non-English article such as "Die"', async () => {
    expect(await key('Theatre Of Hate')).toBe('theatre of hate');
    expect(await key('Die Ärzte')).toBe('die ärzte');
    /* A-ha among A: dormant with "A" out of the list, since nothing strips an "A" either way; it guards the rule the
       step was written under, not the space requirement, which Theatre Of Hate guards (the coordinator, 11 Nov). */
    expect(await key('A-ha')).toBe('a-ha');
  });
});

describe('every artist and title order is keyed, and the drawn name is never changed', () => {
  it('listRecords by artist (records.ts, sortExpression "artist")', async () => {
    await seed();
    const { rows } = await listRecords({ limit: 50, offset: 0, sort: { field: 'artist', direction: 'asc' }, filters: {} });
    expectArtistOrder(rows.map((r) => r.artist.name));
  });

  it('listRecords by title, both directions (records.ts, sortExpression "title")', async () => {
    await seed();
    const asc = await listRecords({ limit: 50, offset: 0, sort: { field: 'title', direction: 'asc' }, filters: {} });
    expect(asc.rows.map((r) => r.title)).toEqual(TITLES);
    const desc = await listRecords({ limit: 50, offset: 0, sort: { field: 'title', direction: 'desc' }, filters: {} });
    expect(desc.rows.map((r) => r.title)).toEqual([...TITLES].reverse());
  });

  it('listRecords’ tie-break by artist under another order (records.ts, the orderBy after the key)', async () => {
    await seed();
    /* Every seeded record is 1980, so the year order is decided wholly by the artist tie-break. */
    const { rows } = await listRecords({ limit: 50, offset: 0, sort: { field: 'releaseYear', direction: 'asc' }, filters: {} });
    expectArtistOrder(rows.map((r) => r.artist.name));
  });

  it('the sheet’s titles (records.ts, listRecordsForSheet)', async () => {
    await seed();
    expect((await listRecordsForSheet()).map((r) => r.title)).toEqual(TITLES);
  });

  it('the shelf’s run by artist, and its title order (shelf.ts)', async () => {
    await seed();
    const byArtist = await shelfRecords();
    expectArtistOrder(byArtist.map((r) => r.artistName));
    expect((await shelfRecords({}, { field: 'title', direction: 'asc' })).map((r) => r.title)).toEqual(TITLES);
  });

  it('the Manage artists list by name (artists.ts, listArtists)', async () => {
    await seed();
    const { rows } = await listArtists({ limit: 50, offset: 0 as Offset });
    expectArtistOrder(rows.map((r) => r.name));
  });

  it('an artist’s influences by name (influences.ts, listInfluencesFor)', async () => {
    const stooges = await artist('The Stooges');
    /* Names whose order flips with the key: unkeyed, Buzzcocks stands before The Birthday Party. */
    const edges = [await artist('Zounds'), await artist('Buzzcocks'), await artist('The Birthday Party')];
    for (const source of edges) {
      await db.insert(artistInfluences).values({ sourceArtistId: source, targetArtistId: stooges, strength: 3 });
    }
    const { influencedBy } = await listInfluencesFor(stooges);
    expect(influencedBy.map((e) => e.name)).toEqual(['The Birthday Party', 'Buzzcocks', 'Zounds']);
  });
});
