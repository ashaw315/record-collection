import 'server-only';
import { and, asc, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { artistInfluences, artists } from '@/db/schema';

/**
 * The query layer for `artist_influences` (SPEC.md §5.5, §4.3).
 *
 * This is an EDGE table, not a reference table, and three template assumptions
 * do not carry over:
 *
 *   - the identity is a composite pair, so there is no single `id`;
 *   - nothing references an edge, so there is no REFERRERS entry, no reference
 *     count, and no 409 IN_USE — a delete either finds the edge or does not;
 *   - both FKs cascade from `artists`, so deleting an artist removes its edges
 *     rather than being refused by them.
 *
 * Edges are DIRECTED: (a→b) and (b→a) are distinct rows with independent
 * strength and notes.
 */

export const STRENGTH_MIN = 1;
export const STRENGTH_MAX = 5;

export type Influence = {
  sourceArtistId: string;
  targetArtistId: string;
  strength: number;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** One end of an edge, hydrated with the other artist's name. */
export type InfluenceEdge = {
  artistId: string;
  name: string;
  strength: number;
  notes: string | null;
};

const columns = {
  sourceArtistId: artistInfluences.sourceArtistId,
  targetArtistId: artistInfluences.targetArtistId,
  strength: artistInfluences.strength,
  notes: artistInfluences.notes,
  createdAt: artistInfluences.createdAt,
  updatedAt: artistInfluences.updatedAt,
};

/**
 * Both directions for one artist (§5.5).
 *
 * Two separate queries rather than one OR'd query: with a single query matching
 * either column, the caller must re-derive which side matched in order to know
 * which list a row belongs to, and getting that backwards silently reverses
 * every influence in the graph. Querying each direction explicitly makes the
 * direction structural.
 */
export async function listInfluencesFor(
  artistId: string,
): Promise<{ influencedBy: InfluenceEdge[]; influenced: InfluenceEdge[] }> {
  const db = getDb();

  // Edges pointing AT this artist: the other artist is the source.
  const influencedBy = await db
    .select({
      artistId: artists.id,
      name: artists.name,
      strength: artistInfluences.strength,
      notes: artistInfluences.notes,
    })
    .from(artistInfluences)
    .innerJoin(artists, eq(artists.id, artistInfluences.sourceArtistId))
    .where(eq(artistInfluences.targetArtistId, artistId))
    .orderBy(asc(artists.name), asc(artists.id));

  // Edges pointing AWAY: the other artist is the target.
  const influenced = await db
    .select({
      artistId: artists.id,
      name: artists.name,
      strength: artistInfluences.strength,
      notes: artistInfluences.notes,
    })
    .from(artistInfluences)
    .innerJoin(artists, eq(artists.id, artistInfluences.targetArtistId))
    .where(eq(artistInfluences.sourceArtistId, artistId))
    .orderBy(asc(artists.name), asc(artists.id));

  return { influencedBy, influenced };
}

const pair = (sourceId: string, targetId: string) =>
  and(
    eq(artistInfluences.sourceArtistId, sourceId),
    eq(artistInfluences.targetArtistId, targetId),
  );

export async function findInfluence(
  sourceId: string,
  targetId: string,
): Promise<Influence | undefined> {
  const db = getDb();
  const [row] = await db.select(columns).from(artistInfluences).where(pair(sourceId, targetId));
  return row;
}

export type InfluenceInput = {
  sourceArtistId: string;
  targetArtistId: string;
  strength?: number;
  notes?: string | null;
};

export async function createInfluence(input: InfluenceInput): Promise<Influence> {
  const db = getDb();
  const [row] = await db.insert(artistInfluences).values(input).returning(columns);
  return row;
}

export async function updateInfluence(
  sourceId: string,
  targetId: string,
  input: { strength?: number; notes?: string | null },
): Promise<Influence | undefined> {
  const db = getDb();
  const [row] = await db
    .update(artistInfluences)
    .set(input)
    .where(pair(sourceId, targetId))
    .returning(columns);
  return row;
}

/**
 * Deletes one directed edge. Returns whether it existed — there is no in-use
 * case to report, because nothing references an edge.
 */
export async function deleteInfluence(sourceId: string, targetId: string): Promise<boolean> {
  const db = getDb();
  const deleted = await db
    .delete(artistInfluences)
    .where(pair(sourceId, targetId))
    .returning({ sourceArtistId: artistInfluences.sourceArtistId });
  return deleted.length > 0;
}
