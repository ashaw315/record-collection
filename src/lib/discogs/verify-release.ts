import 'server-only';
import { readCachedRelease, writeCachedRelease } from '@/lib/discogs/cache';
import { DiscogsError, getDiscogsClient } from '@/lib/discogs/client';

/**
 * Confirms that a client-supplied `discogsReleaseId` names a real release.
 *
 * SPEC.md §7.7: "The server holds the release detail and the cache; a client
 * asserting a fact the server can establish is the pattern to eliminate
 * wherever it appears."
 *
 * Found by the security review and verified before fixing: `POST
 * /api/pressings` accepted `discogsReleaseId: 381756` on a pressing with
 * entirely unrelated details, stored it, and `matchOwnership` then answered
 * "you own this pressing" for a record by a different band.
 *
 * Tier 1's corroboration already defuses the badge. This closes the other half,
 * and it is the more durable one: an unverified claim in the database is
 * inherited by every future reader of that row, including features not yet
 * written.
 */

export type VerificationResult =
  | { ok: true }
  /** The id names nothing. The caller's input is wrong — a 400. */
  | { ok: false; reason: 'not-found' }
  /** Discogs is unreachable. Not the caller's fault — a 502. */
  | { ok: false; reason: 'unreachable' };

export async function verifyDiscogsRelease(
  discogsReleaseId: number,
): Promise<VerificationResult> {
  /**
   * The cache first, and it usually answers: the user has just viewed this
   * release in the form, so the server already holds it. §6's cache reused
   * rather than a second rate-limited call for a fact we have.
   */
  const cached = await readCachedRelease(discogsReleaseId);
  if (cached !== null) return { ok: true };

  try {
    const payload = await getDiscogsClient().get(`/releases/${discogsReleaseId}`);

    // Cached on the way past: verification and prefill want the same payload,
    // and fetching it twice would spend two of sixty calls a minute.
    await writeCachedRelease(discogsReleaseId, payload);

    return { ok: true };
  } catch (error) {
    if (error instanceof DiscogsError) {
      /**
       * 404 is a verdict; anything else is an outage. The distinction reaches
       * the user: a 400 says "your input is wrong", and telling someone that
       * when Discogs is down sends them looking for a mistake they did not
       * make.
       */
      return { ok: false, reason: error.status === 404 ? 'not-found' : 'unreachable' };
    }

    throw error;
  }
}
