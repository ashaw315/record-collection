import 'server-only';
import {
  createArtist,
  findArtistByMusicbrainzId,
  findArtistsNamed,
} from '@/lib/db/queries/artists';

/**
 * A MusicBrainz artist → a local `artists` row (SPEC.md §4.1 as amended).
 *
 * **The failure this is shaped around is silent and permanent.** Attaching an
 * MBID to the wrong local artist means every later import matches the id that
 * was attached in error — so the mistake stops presenting as a name collision
 * and starts presenting as settled fact. Nothing throws. Two bands' lineups
 * merge, and the graph draws them as one.
 *
 * The rule that follows from that asymmetry:
 *
 *   MBID matches            -> that row, certainly. The id identifies an artist.
 *   name matches, no MBID   -> AMBIGUOUS. Create a new row, report the possible
 *                              match, let a later review settle it.
 *   name matches, other MBID-> a KNOWN different artist. Not a candidate at all.
 *   nothing matches         -> create.
 *
 * **Never asks mid-walk.** §12 step 11 walks a band's whole lineup, and Adam's
 * collection is hand-entered — so an MBID-less name match is the common case on
 * a first import, not an edge. Thirty confirmations during one import is a worse
 * failure than a duplicate row that a review can merge later.
 */

export type MusicBrainzArtist = {
  mbid: string;
  name: string;
};

export type ResolvedArtist = {
  artistId: string;
  /** True when this import created the row, false when it found it. */
  created: boolean;
  /**
   * Local artists this MIGHT be the same as — same name, no MusicBrainz id.
   *
   * **Returned rather than persisted**, because unit 5 owns the candidates
   * table and its /manage review. An array rather than one id: a name can match
   * two hand-entered rows, and a single field would silently drop one.
   */
  candidateIds: string[];
};

export async function resolveArtist(artist: MusicBrainzArtist): Promise<ResolvedArtist> {
  const mbid = artist.mbid.trim();

  /**
   * A resolver that created rows with a null MBID would generate its own future
   * ambiguity: the row would be indistinguishable from a hand-entered one, and
   * the next import would find it by name and face this same question again.
   */
  if (mbid === '') {
    throw new Error('Cannot resolve a MusicBrainz artist with no MusicBrainz id.');
  }

  // The identity key. Matches regardless of name — MusicBrainz artists get
  // renamed and the user may have edited the local name.
  const byId = await findArtistByMusicbrainzId(mbid);
  if (byId !== undefined) {
    return { artistId: byId.id, created: false, candidateIds: [] };
  }

  /**
   * Name matches, split by what they already know about themselves.
   *
   * A row carrying a DIFFERENT MBID is not a candidate: MusicBrainz has already
   * said these are two artists, and offering it for merge would invite exactly
   * the mistake this module exists to prevent.
   */
  const sameName = await findArtistsNamed(artist.name);
  const candidateIds = sameName
    .filter((existing) => existing.musicbrainzId === null)
    .map((existing) => existing.id);

  const created = await createArtist({
    name: artist.name,
    formedYear: null,
    originCountry: null,
    notes: null,
    discogsArtistId: null,
    musicbrainzId: mbid,
  });

  return { artistId: created.id, created: true, candidateIds };
}
