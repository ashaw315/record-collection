import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getTestDb, truncateAll, closeTestDb } from '../helpers/db';
import { artists } from '@/db/schema';
import { saveMemberships } from '@/lib/db/queries/artist-memberships';
import { artistGroundingFacts } from '@/lib/db/queries/artists';

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
