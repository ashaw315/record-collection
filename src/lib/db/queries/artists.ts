import 'server-only';
import { and, asc, count, eq, ne } from 'drizzle-orm';
import { isForeignKeyViolation } from '@/lib/api/errors';
import { countReferences } from './referrers';
import { orderFor } from '@/lib/db/order';
import { getDb } from '@/db/client';
import { artists } from '@/db/schema';
import type { Offset, SortDirection } from '@/lib/api/query-params';
import type { DeleteOutcome } from './tags';

/**
 * The query layer for `artists` (CLAUDE.md §6).
 *
 * Two blocking referrers — records.artist_id and want_list.artist_id — and
 * THREE cascading ones (artist_genres, and both artist_influences FKs) that are
 * deliberately absent from REFERRERS: counting a cascading referrer would
 * refuse a delete the database would happily perform. Verified from
 * pg_constraint, not assumed.
 */

export const ARTIST_SORT_FIELDS = ['name', 'formedYear', 'createdAt'] as const;
export type ArtistSortField = (typeof ARTIST_SORT_FIELDS)[number];

export type Artist = {
  id: string;
  name: string;
  formedYear: number | null;
  originCountry: string | null;
  notes: string | null;
  discogsArtistId: number | null;
  musicbrainzId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const columns = {
  id: artists.id,
  name: artists.name,
  formedYear: artists.formedYear,
  originCountry: artists.originCountry,
  notes: artists.notes,
  discogsArtistId: artists.discogsArtistId,
  musicbrainzId: artists.musicbrainzId,
  createdAt: artists.createdAt,
  updatedAt: artists.updatedAt,
};

const sortColumns = {
  name: artists.name,
  formedYear: artists.formedYear,
  createdAt: artists.createdAt,
} as const;

export async function listArtists(options: {
  limit: number;
  offset: Offset;
  sort?: { field: ArtistSortField; direction: SortDirection };
}): Promise<{ rows: Artist[]; total: number }> {
  const db = getDb();

  const sortColumn = options.sort === undefined ? artists.name : sortColumns[options.sort.field];
  const direction = options.sort?.direction ?? 'asc';

  const rows = await db
    .select(columns)
    .from(artists)
    .orderBy(...orderFor(sortColumn, direction, artists.id))
    .limit(options.limit)
    .offset(options.offset);

  const [totals] = await db.select({ value: count() }).from(artists);

  return { rows, total: totals?.value ?? 0 };
}

export async function findArtistById(id: string): Promise<Artist | undefined> {
  const db = getDb();
  const [row] = await db.select(columns).from(artists).where(eq(artists.id, id)).limit(1);
  return row;
}

/**
 * Every artist with this name — **an array, because a name identifies nothing.**
 *
 * This replaced `findArtistByName`, whose `.limit(1)` was exact while
 * `artists.name` was UNIQUE and became "an arbitrary row of N" the moment
 * §4.1 dropped the constraint. That function was deleted rather than adapted:
 * its contract ("the artist with this name") is no longer true of the schema,
 * and its five callers would have gone on trusting it.
 *
 * Ordered oldest-first so the same input gives the same answer. An unordered
 * `limit(1)` may return different rows across calls — the planner is free to —
 * and §5.4's `existingId` would then point somewhere new each time the same
 * duplicate was submitted.
 *
 * Exact match, not fuzzy: §7.7's ownership check and search use `similarity()`
 * deliberately, but a duplicate warning that fired on "Discharge Bomb" would
 * train the user to dismiss it.
 */
export async function findArtistsNamed(name: string): Promise<Artist[]> {
  const db = getDb();
  return db
    .select(columns)
    .from(artists)
    .where(eq(artists.name, name))
    .orderBy(asc(artists.createdAt), asc(artists.id));
}

/**
 * The artist carrying this MusicBrainz id — §4.1's identity key.
 *
 * Null is not a value to match on. Every hand-entered artist has a null MBID,
 * so a query that matched it would return an arbitrary stranger and claim it as
 * the imported artist — the silent merge this whole change exists to prevent.
 * `findArtistByDiscogsId` guards the same way for the same reason.
 */
export async function findArtistByMusicbrainzId(
  musicbrainzId: string | null,
): Promise<Artist | undefined> {
  if (musicbrainzId === null || musicbrainzId === '') return undefined;

  const db = getDb();
  const [row] = await db
    .select(columns)
    .from(artists)
    .where(eq(artists.musicbrainzId, musicbrainzId))
    .limit(1);
  return row;
}

/**
 * The row holding a given Discogs id, for §5.4's `existingId` on the
 * unique-violation recovery path. That catch covers two constraints and a
 * re-read by NAME finds nothing when the Discogs id is what collided.
 */
export async function findArtistByDiscogsId(
  discogsId: number | null,
): Promise<Artist | undefined> {
  if (discogsId === null) return undefined;
  const db = getDb();
  const [row] = await db
    .select(columns)
    .from(artists)
    .where(eq(artists.discogsArtistId, discogsId))
    .limit(1);
  return row;
}

export type ArtistInput = {
  name: string;
  formedYear?: number | null;
  originCountry?: string | null;
  notes?: string | null;
  discogsArtistId?: number | null;
};

export async function createArtist(input: ArtistInput): Promise<Artist> {
  const db = getDb();
  const [row] = await db.insert(artists).values(input).returning(columns);
  return row;
}

export async function updateArtist(
  id: string,
  input: Partial<ArtistInput>,
): Promise<Artist | undefined> {
  const db = getDb();
  const [row] = await db.update(artists).set(input).where(eq(artists.id, id)).returning(columns);
  return row;
}

export async function artistNameTakenByOther(id: string, name: string): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ value: count() })
    .from(artists)
    .where(and(eq(artists.name, name), ne(artists.id, id)));
  return (row?.value ?? 0) > 0;
}

/** SPEC.md §7.4. Two blocking referrers; the three cascading ones do not count. */
export async function countArtistReferences(id: string): Promise<number> {
  return countReferences('artists', id);
}

export async function deleteArtist(id: string): Promise<DeleteOutcome> {
  const db = getDb();

  try {
    const deleted = await db.delete(artists).where(eq(artists.id, id)).returning({ id: artists.id });
    return deleted.length > 0 ? { status: 'deleted' } : { status: 'not-found' };
  } catch (error) {
    if (!isForeignKeyViolation(error)) throw error;
    return { status: 'in-use', referenceCount: await countReferences('artists', id) };
  }
}
