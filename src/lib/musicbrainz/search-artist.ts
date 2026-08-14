import 'server-only';
import { z } from 'zod';

/**
 * Finding the MusicBrainz artist for a local row (SPEC.md §4.3).
 *
 * Hand-entered artists have no MBID — every artist in the real collection is one
 * — so a lineup walk must search by NAME, which is the one thing §4.3 says
 * cannot identify an artist. The judgement below is what keeps that from
 * becoming a silent wrong attachment.
 */

export type ArtistSearchHit = {
  mbid: string;
  name: string;
  /** MusicBrainz's own match quality, 0-100. */
  score: number;
  type: string | null;
  country: string | null;
  /** MusicBrainz's own note distinguishing same-named artists. */
  disambiguation: string | null;
};

/**
 * **A GUESS, and it must keep saying so.**
 *
 * Fitted to two observed cases — Hot Tuna 100 against 78, Carpenters 100 against
 * 66 — with no negative case where the right answer is known. §4.3 records it in
 * the same terms as `WIDE_RATIO`: unvalidated, **not to be tuned to fit**, and
 * revisited only when real use produces a case it gets wrong.
 *
 * The rule is a GAP rather than a high absolute. Two artists genuinely named
 * Discharge both score 100, so an "is the top hit confident?" test would accept
 * one of them at random — which is the failure this exists to prevent.
 */
const PERFECT_SCORE = 100;
const RUNNER_UP_CEILING = 90;

const rawHit = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  score: z.number().optional(),
  type: z.string().nullish(),
  country: z.string().nullish(),
  disambiguation: z.string().nullish(),
});

/** Permissive by design: this is someone else's payload and they add fields. */
export function normalizeSearchHits(payload: unknown): ArtistSearchHit[] {
  const artists = (payload as { artists?: unknown })?.artists;
  if (!Array.isArray(artists)) return [];

  const hits: ArtistSearchHit[] = [];

  for (const candidate of artists) {
    const parsed = rawHit.safeParse(candidate);
    if (!parsed.success) continue;

    hits.push({
      mbid: parsed.data.id,
      name: parsed.data.name ?? '',
      score: parsed.data.score ?? 0,
      type: parsed.data.type ?? null,
      country: parsed.data.country ?? null,
      disambiguation: parsed.data.disambiguation ?? null,
    });
  }

  return hits;
}

/**
 * The single artist a search unambiguously identifies, or `null` when it does
 * not identify one.
 *
 * `null` is not a failure — it is the answer "this needs a human", and the
 * caller returns the candidates rather than guessing. §4.3: "the distinction is
 * who decided, not how confident the code is."
 */
export function pickDisambiguated(hits: ArtistSearchHit[]): ArtistSearchHit | null {
  if (hits.length === 0) return null;

  /**
   * Sorted here rather than trusting the payload's order. MusicBrainz does
   * return results score-descending, but relying on that makes this rule depend
   * on someone else's ordering guarantee.
   */
  const ranked = [...hits].sort((a, b) => b.score - a.score);
  const [best, runnerUp] = ranked;

  if (best.score < PERFECT_SCORE) return null;

  // A lone perfect match has nothing to be confused with.
  if (runnerUp === undefined) return best;

  return runnerUp.score < RUNNER_UP_CEILING ? best : null;
}

/**
 * Searches MusicBrainz for an artist by name.
 *
 * One request against a one-per-second budget, so the caller should skip it
 * entirely when the artist already carries an id — the id identifies the artist
 * and searching again risks finding a different one.
 */
export async function searchArtistsByName(name: string): Promise<ArtistSearchHit[]> {
  const { getMusicBrainzClient } = await import('./client');

  const payload = await getMusicBrainzClient().get<unknown>(
    `/artist?query=${encodeURIComponent(name)}&limit=10`,
  );

  return normalizeSearchHits(payload);
}
