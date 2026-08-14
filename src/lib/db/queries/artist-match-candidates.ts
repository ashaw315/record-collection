import 'server-only';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { getDb } from '@/db/client';
import { artistMatchCandidates, artists, records } from '@/db/schema';

/**
 * `artist_match_candidates` (SPEC.md §4.3) — possible duplicate artists,
 * recorded during an import and reviewed afterwards in `/manage`.
 *
 * **The asymmetry drives every decision here.** A wrong merge is invisible and
 * self-reinforcing — every later import matches the MBID attached in error, so
 * the mistake stops presenting as a name collision and starts presenting as
 * settled fact. A wrong "distinct" is visible and cheap: two artists sit in the
 * list until someone merges them.
 *
 * So "distinct" is exactly as easy and as DURABLE as "merge". If declining were
 * harder, or if a declined pair reappeared on the next import, the review would
 * degrade into a merge button with extra steps — arriving at the dangerous
 * failure through the UI rather than through the code.
 */

/** §4.3 names two, and only two. */
export type MatchResolution = 'merged' | 'distinct';

const RESOLUTIONS: readonly MatchResolution[] = ['merged', 'distinct'];

/** §4.3's example reason, and the only one this import produces. */
export const NAME_MATCH_NO_MBID = 'name_match_no_mbid';

export type CandidateArtist = {
  id: string;
  name: string;
  musicbrainzId: string | null;
  formedYear: number | null;
  originCountry: string | null;
  /** How many records point at this artist — the strongest available signal. */
  recordCount: number;
};

export type OpenMatchCandidate = {
  id: string;
  reason: string;
  /** The row the import created. */
  artist: CandidateArtist;
  /** The existing local row it might be the same as. */
  candidate: CandidateArtist;
};

/**
 * Records possible matches for a freshly imported artist.
 *
 * Idempotent: §4.3's `UNIQUE NULLS NOT DISTINCT` plus `DO NOTHING` means a
 * re-import raises nothing new — **including for pairs already resolved**. A
 * review that regrew its backlog on every walk would never empty, and the only
 * way to silence a pair would be to merge it.
 */
export async function recordMatchCandidates(
  artistId: string,
  candidateArtistIds: string[],
  reason: string = NAME_MATCH_NO_MBID,
): Promise<void> {
  // The common case once artists carry MBIDs, and an empty INSERT is a syntax
  // error — so this is a real branch, not defensiveness.
  if (candidateArtistIds.length === 0) return;

  const db = getDb();

  await db
    .insert(artistMatchCandidates)
    .values(
      candidateArtistIds.map((candidateArtistId) => ({
        artistId,
        candidateArtistId,
        reason,
      })),
    )
    .onConflictDoNothing();
}

/** Records attributable to an artist, as a scalar subquery per side. */
const recordCountFor = (artistColumn: AnyPgColumn) =>
  sql<number>`(SELECT COUNT(*)::int FROM ${records} WHERE ${records.artistId} = ${artistColumn})`;

/**
 * Every undecided pair, with enough context to actually decide.
 *
 * **Names are deliberately not enough.** A pair is a candidate BECAUSE the names
 * are identical, so a review showing two names shows nothing and the user is
 * choosing at random. Formed year, country, MBID and record count are what
 * separate them — and the record count most of all, since an artist with eleven
 * records is the one being collected and a freshly imported row with none is
 * new.
 */
export async function listOpenMatchCandidates(): Promise<OpenMatchCandidate[]> {
  const db = getDb();

  const imported = artists;
  const local = sql`local_artist`;

  const rows = await db
    .select({
      id: artistMatchCandidates.id,
      reason: artistMatchCandidates.reason,
      artistId: imported.id,
      artistName: imported.name,
      artistMbid: imported.musicbrainzId,
      artistFormedYear: imported.formedYear,
      artistOriginCountry: imported.originCountry,
      artistRecordCount: recordCountFor(artistMatchCandidates.artistId),
      candidateId: sql<string>`${local}.id`,
      candidateName: sql<string>`${local}.name`,
      candidateMbid: sql<string | null>`${local}.musicbrainz_id`,
      candidateFormedYear: sql<number | null>`${local}.formed_year`,
      candidateOriginCountry: sql<string | null>`${local}.origin_country`,
      candidateRecordCount: recordCountFor(artistMatchCandidates.candidateArtistId),
    })
    .from(artistMatchCandidates)
    .innerJoin(imported, eq(imported.id, artistMatchCandidates.artistId))
    .innerJoin(
      sql`${artists} AS local_artist`,
      sql`${local}.id = ${artistMatchCandidates.candidateArtistId}`,
    )
    // Unresolved only. `resolved_at` rather than `resolution`, so a pair
    // answered "distinct" is as durably closed as one answered "merged".
    .where(isNull(artistMatchCandidates.resolvedAt))
    .orderBy(asc(artistMatchCandidates.createdAt), asc(artistMatchCandidates.id));

  return rows.map((row) => ({
    id: row.id,
    reason: row.reason,
    artist: {
      id: row.artistId,
      name: row.artistName,
      musicbrainzId: row.artistMbid,
      formedYear: row.artistFormedYear,
      originCountry: row.artistOriginCountry,
      recordCount: Number(row.artistRecordCount),
    },
    candidate: {
      id: row.candidateId,
      name: row.candidateName,
      musicbrainzId: row.candidateMbid,
      formedYear: row.candidateFormedYear,
      originCountry: row.candidateOriginCountry,
      recordCount: Number(row.candidateRecordCount),
    },
  }));
}

/**
 * Answers a pair, permanently.
 *
 * Both answers are stored the same way and cost the same call. `resolved_at` is
 * what closes the pair, so "distinct" is not a weaker state than "merged" — it
 * is the same state with a different label, which is the property that keeps
 * the review from becoming a merge button.
 */
export async function resolveMatchCandidate(
  id: string,
  resolution: MatchResolution,
): Promise<void> {
  if (!RESOLUTIONS.includes(resolution)) {
    throw new Error(`Unknown match resolution: ${resolution}`);
  }

  const db = getDb();

  await db
    .update(artistMatchCandidates)
    .set({ resolution, resolvedAt: new Date() })
    .where(and(eq(artistMatchCandidates.id, id), isNull(artistMatchCandidates.resolvedAt)));
}
