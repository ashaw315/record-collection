import 'server-only';
import { MusicBrainzError, getMusicBrainzClient } from './client';
import { normalizeRelations, type MembershipRelation } from './normalize-relations';
import { readCachedArtist, writeCachedArtist } from './artist-cache';
import { resolveArtist } from './resolve-artist';
import { recordMatchCandidates } from '@/lib/db/queries/artist-match-candidates';
import { saveMemberships } from '@/lib/db/queries/artist-memberships';

/**
 * Walking a band's lineup (SPEC.md §12 step 11).
 *
 * **The cost is the design.** `member of band` links a person to a group, so one
 * band's lineup graph means band → each member → that member's other bands.
 * Discharge is 31 members: 32 sequential requests, 32 seconds at the permitted
 * one per second. On demand only, never as a background crawl.
 *
 * **Partial failure is the normal failure.** The client already retries a 503
 * three times with backoff, so an error reaching here means MusicBrainz refused
 * four times — it is down or hard-limiting, not blinking. The walk stops,
 * commits what it resolved, and SAYS the lineup is incomplete. A lineup that
 * stopped at 20 must never read as a band with 20 members.
 */

export type WalkResult = {
  artistId: string;
  /** Members whose own relations were fetched. */
  checked: number;
  /** Members the band claimed, known before any of them were fetched. */
  total: number;
  partial: boolean;
  text: string;
};

/** What one fetched artist contributes, before anything is written. */
type Fetched = {
  mbid: string;
  name: string;
  relations: MembershipRelation[];
  /** The payload as fetched, so a deferred cache write has something to store. */
  raw: unknown;
};

async function fetchArtist(
  mbid: string,
  name: string,
  options: { cache?: boolean } = {},
): Promise<Fetched> {
  const cached = await readCachedArtist(mbid);
  if (cached !== null) {
    return { mbid, name, relations: normalizeRelations(cached.relations), raw: cached.payload };
  }

  const client = getMusicBrainzClient();
  const payload = await client.get<{ name?: string; relations?: unknown[] }>(
    `/artist/${mbid}?inc=artist-rels`,
  );

  /**
   * The RAW payload is cached, never the normalized relations (§4.3):
   * normalization is our code and it changes, so caching its output would
   * freeze today's decisions into rows that outlive them by ninety days.
   *
   * The BAND defers its write until the walk completes — see below.
   */
  if (options.cache !== false) await writeCachedArtist(mbid, payload);

  return {
    mbid,
    name: payload.name ?? name,
    relations: normalizeRelations(payload.relations),
    raw: payload,
  };
}

export async function walkLineup(bandMbid: string): Promise<WalkResult> {
  /**
   * Two rules meet on this line.
   *
   * The band's own fetch is NOT partial-tolerant: without its relation list
   * there is no lineup at all, which is "we could not ask" rather than "we
   * asked about some of them" — the distinction the version spread draws.
   *
   * And the band is NOT cached here. Caching it before the members are walked
   * would serve an incomplete lineup for ninety days if the walk stops partway:
   * the next walk would read the cached band, find its members already
   * recorded, and never discover the ones the refusal cut off. Partial data is
   * worth keeping in the DATABASE and worth NOT keeping in the CACHE.
   */
  const band = await fetchArtist(bandMbid, bandMbid, { cache: false });
  const bandArtist = await resolveArtist({ mbid: band.mbid, name: band.name });
  await recordMatchCandidates(bandArtist.artistId, bandArtist.candidateIds);

  const members = band.relations.filter((relation) => relation.role === 'person');
  const total = members.length;

  let checked = 0;
  let stopped = false;

  for (const member of members) {
    const person = await resolveArtist({ mbid: member.artistMbid, name: member.artistName });
    await recordMatchCandidates(person.artistId, person.candidateIds);

    /**
     * **Saved HERE, not batched at the end.** Two reasons, and the second is
     * why it changed:
     *
     * 1. A walk is ~32 seconds, so `/manage` polls this count to show "checked
     *    12 of 31" rather than a spinner indistinguishable from a hang.
     * 2. A process killed mid-walk previously lost every row it had resolved.
     *    The partial-failure path handled a REFUSAL; it could not handle a
     *    crash.
     *
     * Idempotent per §4.3, so re-walking adds nothing.
     */
    await saveMemberships([
      {
        personArtistId: person.artistId,
        groupArtistId: bandArtist.artistId,
        instrument: member.instrument,
        beganYear: member.beganYear,
        endedYear: member.endedYear,
        musicbrainzId: member.artistMbid,
      },
    ]);

    /**
     * Following the member into their OTHER bands is what §12 step 11 is
     * actually for — "side-project relationships". A shared member is what
     * §8.1's `shared_member` edge is drawn from.
     */
    let personRelations: MembershipRelation[];
    try {
      const fetched = await fetchArtist(member.artistMbid, member.artistName);
      personRelations = fetched.relations;
    } catch (cause) {
      /**
       * **Stop, do not continue.** Four refusals have already happened inside
       * the client; asking again spends the remaining budget on failures while
       * the user waits. What was gathered is reported as partial.
       */
      if (cause instanceof MusicBrainzError) {
        stopped = true;
        break;
      }
      throw cause;
    }

    checked += 1;

    for (const otherBand of personRelations.filter((relation) => relation.role === 'group')) {
      if (otherBand.artistMbid === bandMbid) continue;

      const group = await resolveArtist({
        mbid: otherBand.artistMbid,
        name: otherBand.artistName,
      });
      await recordMatchCandidates(group.artistId, group.candidateIds);

      await saveMemberships([
        {
          personArtistId: person.artistId,
          groupArtistId: group.artistId,
          instrument: otherBand.instrument,
          beganYear: otherBand.beganYear,
          endedYear: otherBand.endedYear,
          musicbrainzId: otherBand.artistMbid,
        },
      ]);
    }
  }

  /**
   * Nothing to flush: rows were committed as they were resolved. What the walk
   * gathered before a refusal is already on disk, which is the behaviour the
   * partial-failure tests pin — nineteen members is real data, and discarding
   * it would throw away nineteen seconds of budget.
   */
  const partial = stopped;

  // Only a COMPLETE walk earns a cache entry, so a cut-short one is retried.
  if (!partial) await writeCachedArtist(bandMbid, band.raw);

  return {
    artistId: bandArtist.artistId,
    checked,
    total,
    partial,
    /**
     * **Absent-versus-unknown, in the layer where it does most damage.** A
     * lineup that stopped at 20 must not read as a band with 20 members — the
     * denominator is known from the band's own relation list before any member
     * is fetched, so the honest sentence is always available.
     */
    text: partial
      ? `Checked ${checked} of ${total} members before MusicBrainz stopped responding. There may be more.`
      : `${total} member${total === 1 ? '' : 's'}.`,
  };
}
