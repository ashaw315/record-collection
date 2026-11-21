import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getTestDb, truncateAll, closeTestDb } from '../helpers/db';
import { artists } from '@/db/schema';
import { saveMemberships } from '@/lib/db/queries/artist-memberships';
import { artistGroundingFacts, fillArtistFactsWhereNull, findArtistById } from '@/lib/db/queries/artists';

/**
 * **Q37 (Adam's ruling of 11 Nov; built 20 Nov): the ABOUT grounding reads the artist's formed year, origin and
 * members from the database.** `artists.formed_year` and `artists.origin_country` are §4.1's columns; the members are
 * §4.3's `artist_memberships` rows, read from the group's side with each person's name. Fails against a query that
 * returns the person's own memberships as the group's, one that drops the instrument, one that orders members by
 * insertion rather than by when they joined, and one that answers a missing artist with a shape instead of null.
 */
const db = getTestDb();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeTestDb();
});

describe('artistGroundingFacts', () => {
  it('reads formed year, origin and the group’s members with instruments, earliest joiner first, then by name', async () => {
    const [group] = await db.insert(artists).values({ name: 'Discharge', formedYear: 1977, originCountry: 'Stoke-on-Trent, England' }).returning();
    const [cal] = await db.insert(artists).values({ name: 'Cal Morris' }).returning();
    const [bones] = await db.insert(artists).values({ name: 'Bones Roberts' }).returning();
    const [later] = await db.insert(artists).values({ name: 'Garry Maloney' }).returning();
    await saveMemberships([
      { personArtistId: later.id, groupArtistId: group.id, instrument: 'drums', beganYear: 1980, endedYear: null, musicbrainzId: null },
      { personArtistId: cal.id, groupArtistId: group.id, instrument: 'vocals', beganYear: 1977, endedYear: null, musicbrainzId: null },
      { personArtistId: bones.id, groupArtistId: group.id, instrument: null, beganYear: 1977, endedYear: 1982, musicbrainzId: null },
    ]);
    expect(await artistGroundingFacts(group.id)).toEqual({
      formedYear: 1977,
      origin: 'Stoke-on-Trent, England',
      members: [
        { name: 'Bones Roberts', instrument: null },
        { name: 'Cal Morris', instrument: 'vocals' },
        { name: 'Garry Maloney', instrument: 'drums' },
      ],
    });
  });

  it('gives a person no members, since their memberships are of groups, not of them', async () => {
    const [group] = await db.insert(artists).values({ name: 'Discharge' }).returning();
    const [cal] = await db.insert(artists).values({ name: 'Cal Morris', formedYear: null, originCountry: 'England' }).returning();
    await saveMemberships([{ personArtistId: cal.id, groupArtistId: group.id, instrument: 'vocals', beganYear: 1977, endedYear: null, musicbrainzId: null }]);
    expect(await artistGroundingFacts(cal.id)).toEqual({ formedYear: null, origin: 'England', members: [] });
  });

  it('answers null for an artist that does not exist', async () => {
    expect(await artistGroundingFacts('00000000-0000-4000-8000-000000000000')).toBeNull();
  });
});

describe('fillArtistFactsWhereNull (Q37’s second half, 20 Nov)', () => {
  /*
    The walk's facts complete what the catalogue lacks and never replace what Adam entered (CLAUDE.md §8: external data
    never overwrites user-entered data). Fails against a write that overwrites a held value, one that writes a null over
    a value, and one that skips a null column because the other was held.
  */
  it('fills the null columns and leaves a held value, column by column', async () => {
    const [blank] = await db.insert(artists).values({ name: 'Discharge' }).returning();
    const [held] = await db.insert(artists).values({ name: 'Black Flag', formedYear: 1976, originCountry: null }).returning();
    await fillArtistFactsWhereNull(blank.id, { formedYear: 1977, origin: 'Stoke-on-Trent, United Kingdom' });
    await fillArtistFactsWhereNull(held.id, { formedYear: 1979, origin: 'Hermosa Beach, United States' });
    expect(await findArtistById(blank.id)).toMatchObject({ formedYear: 1977, originCountry: 'Stoke-on-Trent, United Kingdom' });
    expect(await findArtistById(held.id)).toMatchObject({ formedYear: 1976, originCountry: 'Hermosa Beach, United States' });
  });

  it('writes nothing for null facts, and nothing for an artist that does not exist', async () => {
    const [kept] = await db.insert(artists).values({ name: 'Donovan', formedYear: null, originCountry: 'Scotland' }).returning();
    await fillArtistFactsWhereNull(kept.id, { formedYear: null, origin: null });
    expect(await findArtistById(kept.id)).toMatchObject({ formedYear: null, originCountry: 'Scotland' });
    await expect(fillArtistFactsWhereNull('00000000-0000-4000-8000-000000000000', { formedYear: 1977, origin: 'x' })).resolves.toBeUndefined();
  });
});
