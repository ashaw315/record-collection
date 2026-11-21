import 'server-only';
import { findArtistById, findArtistByMusicbrainzId, updateArtist } from '@/lib/db/queries/artists';
import { pickExactName, searchArtistsByName, stripDiscogsSuffix } from './search-artist';
import { walkLineup, type WalkResult } from './walk-lineup';

/**
 * **An artist with no MBID, resolved by name under the stated rule, for the ABOUT grounding (Q37's second half, the
 * coordinator's yes, 20 Nov).** One search; exactly one hit carrying the artist's own normalised name, the Discogs
 * suffix stripped (search-artist.ts), is accepted: its MBID is stored and the lineup walk runs, which writes the band's
 * formed year, origin and members where the catalogue has none. Anything else stores NOTHING: no MBID, no fact, no
 * placeholder. A wrong formed year in the grounding becomes a wrong sentence in an ABOUT, and there is no audit for
 * ABOUTs. An MBID another artist already holds is refused the same way, since §5.4's duplicate is the user's to merge.
 * The first caller is the drafting scripts; the add flow (Q72) is the second when it exists.
 */
export type ResolveByNameOutcome =
  | { outcome: 'already'; mbid: string }
  | { outcome: 'resolved'; mbid: string; walk: WalkResult }
  | { outcome: 'refused'; reason: 'no-hit' | 'shared-name'; sameName: number; hits: number }
  | { outcome: 'refused'; reason: 'held-by-other'; holderId: string; holderName: string };

export async function resolveArtistByName(artistId: string): Promise<ResolveByNameOutcome | null> {
  const artist = await findArtistById(artistId);
  if (artist === undefined) return null;
  if (artist.musicbrainzId !== null) return { outcome: 'already', mbid: artist.musicbrainzId };
  const name = stripDiscogsSuffix(artist.name);
  const hits = await searchArtistsByName(name);
  const chosen = pickExactName(hits, name);
  if (chosen === null) {
    const key = name.trim().toLowerCase();
    const sameName = hits.filter((hit) => hit.name.trim().toLowerCase() === key).length;
    return { outcome: 'refused', reason: sameName === 0 ? 'no-hit' : 'shared-name', sameName, hits: hits.length };
  }
  const holder = await findArtistByMusicbrainzId(chosen.mbid);
  if (holder !== undefined && holder.id !== artistId) return { outcome: 'refused', reason: 'held-by-other', holderId: holder.id, holderName: holder.name };
  await updateArtist(artistId, { musicbrainzId: chosen.mbid });
  const walk = await walkLineup(chosen.mbid);
  return { outcome: 'resolved', mbid: chosen.mbid, walk };
}
