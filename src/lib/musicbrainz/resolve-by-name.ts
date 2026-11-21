import 'server-only';
import { findArtistById, findArtistByMusicbrainzId, updateArtist } from '@/lib/db/queries/artists';
import { MusicBrainzError, getMusicBrainzClient } from './client';
import { pickExactName, searchArtistsByName, stripDiscogsSuffix } from './search-artist';
import { walkLineup, type WalkResult } from './walk-lineup';

/**
 * **An artist with no MBID, resolved for the ABOUT grounding: the exact path first, the name rule as the fallback,
 * never a guess at either (Q37's second half; the coordinator, 20 and 21 Nov).**
 *
 * The exact path: the Discogs artist id the import holds, looked up as a MusicBrainz URL relationship
 * (`/url?resource=https://www.discogs.com/artist/{id}&inc=artist-rels`), which names one artist or none and never asks
 * which of three Smerzes. Measured before building (NOTES, 21 Nov): 37 of 49 collection artists link, and the link
 * answers every case the name rule refused for ambiguity, correctly; the five held MBIDs all agree with their links.
 * Two artists linked to one page is not an answer, and falls through like no page at all.
 *
 * The fallback: one search; exactly one hit carrying the artist's own normalised name, the Discogs suffix stripped
 * (search-artist.ts), score not consulted. Accepted either way: the MBID is stored and the lineup walk runs, which
 * writes the band's formed year, origin and members where the catalogue has none. Anything else stores NOTHING: no
 * MBID, no fact, no placeholder, since a wrong formed year in the grounding becomes a wrong sentence in an ABOUT and
 * there is no audit for ABOUTs. An MBID another artist already holds is refused the same way (§5.4's duplicate is the
 * user's to merge). A dry run says what would happen, by which path, and writes nothing, so the report and the apply
 * share one code path. The first caller is the drafting scripts; the add flow (Q72) is the second when it exists.
 */
export type ResolvePath = 'link' | 'name';
export type ResolveByNameOutcome =
  | { outcome: 'already'; mbid: string }
  | { outcome: 'resolved'; path: ResolvePath; mbid: string; walk: WalkResult }
  | { outcome: 'would-resolve'; path: ResolvePath; mbid: string; name: string }
  | { outcome: 'refused'; reason: 'no-hit' | 'shared-name'; sameName: number; hits: number }
  | { outcome: 'refused'; reason: 'held-by-other'; holderId: string; holderName: string };

type UrlLookup = { relations?: Array<{ 'target-type'?: string; artist?: { id?: string; name?: string } }> };

/** The one MusicBrainz artist linked to this Discogs artist page, or null: none, two, or no such page. */
export async function linkedArtistForDiscogsId(discogsArtistId: number): Promise<{ mbid: string; name: string } | null> {
  const resource = `https://www.discogs.com/artist/${discogsArtistId}`;
  let payload: UrlLookup;
  try {
    payload = await getMusicBrainzClient().get<UrlLookup>(`/url?resource=${encodeURIComponent(resource)}&inc=artist-rels`);
  } catch (error) {
    if (error instanceof MusicBrainzError && error.status === 404) return null;
    throw error;
  }
  const linked = (payload.relations ?? []).filter((rel) => rel['target-type'] === 'artist' && typeof rel.artist?.id === 'string');
  if (linked.length !== 1) return null;
  const artist = linked[0].artist;
  return artist?.id === undefined ? null : { mbid: artist.id, name: artist.name ?? '' };
}

export async function resolveArtistByName(artistId: string, options: { dryRun?: boolean } = {}): Promise<ResolveByNameOutcome | null> {
  const artist = await findArtistById(artistId);
  if (artist === undefined) return null;
  if (artist.musicbrainzId !== null) return { outcome: 'already', mbid: artist.musicbrainzId };

  let chosen: { path: ResolvePath; mbid: string; name: string } | null = null;
  if (artist.discogsArtistId !== null) {
    const linked = await linkedArtistForDiscogsId(artist.discogsArtistId);
    if (linked !== null) chosen = { path: 'link', ...linked };
  }
  if (chosen === null) {
    const name = stripDiscogsSuffix(artist.name);
    const hits = await searchArtistsByName(name);
    const hit = pickExactName(hits, name);
    if (hit === null) {
      const key = name.trim().toLowerCase();
      const sameName = hits.filter((h) => h.name.trim().toLowerCase() === key).length;
      return { outcome: 'refused', reason: sameName === 0 ? 'no-hit' : 'shared-name', sameName, hits: hits.length };
    }
    chosen = { path: 'name', mbid: hit.mbid, name: hit.name };
  }

  const holder = await findArtistByMusicbrainzId(chosen.mbid);
  if (holder !== undefined && holder.id !== artistId) return { outcome: 'refused', reason: 'held-by-other', holderId: holder.id, holderName: holder.name };
  if (options.dryRun === true) return { outcome: 'would-resolve', path: chosen.path, mbid: chosen.mbid, name: chosen.name };
  await updateArtist(artistId, { musicbrainzId: chosen.mbid });
  const walk = await walkLineup(chosen.mbid);
  return { outcome: 'resolved', path: chosen.path, mbid: chosen.mbid, walk };
}
