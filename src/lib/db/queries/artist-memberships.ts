import 'server-only';
import { eq, or, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { artistMemberships } from '@/db/schema';

/**
 * `artist_memberships` (SPEC.md §4.3) — reads and writes.
 *
 * **Shaped around re-import, not around the first write.** §12 step 11 makes
 * the MusicBrainz import on-demand and cached, so the same artist is imported
 * again whenever the cache expires or the user asks twice. Writing a row once
 * is the easy case; not writing it twice is the one that matters.
 */

export type MembershipInput = {
  personArtistId: string;
  groupArtistId: string;
  instrument: string | null;
  beganYear: number | null;
  endedYear: number | null;
  musicbrainzId: string | null;
};

export type MembershipRow = MembershipInput & { id: string };

/**
 * Writes memberships, leaving what is already there alone.
 *
 * **An upsert on (person, group, instrument), which only works because the
 * constraint is `NULLS NOT DISTINCT`.** Under Postgres' default semantics two
 * null-instrument rows for the same pair do not conflict, so `onConflictDoUpdate`
 * would never fire and each re-import would add a copy — silently, since
 * nothing errors and the import reports success.
 *
 * Updating rather than doing nothing: MusicBrainz data is edited, so an end
 * date that was missing last week may be known now. A row that is never
 * refreshed is a cache that can only go stale.
 */
export async function saveMemberships(memberships: MembershipInput[]): Promise<void> {
  // An artist whose MusicBrainz page has no member relations is a normal
  // result. An empty INSERT is a syntax error, so this is a real branch.
  if (memberships.length === 0) return;

  const db = getDb();

  await db
    .insert(artistMemberships)
    .values(memberships)
    .onConflictDoUpdate({
      target: [
        artistMemberships.personArtistId,
        artistMemberships.groupArtistId,
        artistMemberships.instrument,
      ],
      /**
       * `excluded` — the row this statement TRIED to insert.
       *
       * A batch upsert writes many rows in one statement, so each conflict has
       * to take its own incoming values; naming the variables directly (as the
       * single-row caches do) would write one row's values over every
       * conflicting row. That is the kind of bug that only appears once an
       * artist has more than one membership.
       */
      set: {
        beganYear: sql`excluded.began_year`,
        endedYear: sql`excluded.ended_year`,
        musicbrainzId: sql`excluded.musicbrainz_id`,
      },
    });
}

/**
 * Every membership an artist takes part in, from either side.
 *
 * §8.1's graph asks both questions — "who was in this band" and "what bands was
 * this person in" — and they are the same rows read from opposite ends. A
 * reader matching only one column would answer half of them with silence.
 */
export async function membershipsForArtist(artistId: string): Promise<MembershipRow[]> {
  const db = getDb();

  const rows = await db
    .select({
      id: artistMemberships.id,
      personArtistId: artistMemberships.personArtistId,
      groupArtistId: artistMemberships.groupArtistId,
      instrument: artistMemberships.instrument,
      beganYear: artistMemberships.beganYear,
      endedYear: artistMemberships.endedYear,
      musicbrainzId: artistMemberships.musicbrainzId,
    })
    .from(artistMemberships)
    .where(
      or(
        eq(artistMemberships.personArtistId, artistId),
        eq(artistMemberships.groupArtistId, artistId),
      ),
    );

  return rows;
}
