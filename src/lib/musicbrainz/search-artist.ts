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

/**
 * When the artist existed — the fact that most cheaply separates two bands
 * sharing a name.
 *
 * `1977–` against `1978–1980` identifies the two Discharges at a glance, which
 * is exactly what the candidate picker is for: it only appears when the NAME has
 * failed to identify the artist, so it must show something the name did not.
 */
export type ArtistLifeSpan = {
  begin: string | null;
  end: string | null;
  ended: boolean;
};

export type ArtistSearchHit = {
  mbid: string;
  name: string;
  /** MusicBrainz's own match quality, 0-100. */
  score: number;
  type: string | null;
  country: string | null;
  /** MusicBrainz's own note distinguishing same-named artists. */
  disambiguation: string | null;
  /**
   * **Was declared by the picker and produced by nobody.** `LineupAction.tsx`
   * rendered `lifeSpan` through `lifeSpanText` and this normalizer never
   * extracted it, so the helper returned `''` for every candidate and the fact
   * silently never appeared on the one screen that exists to disambiguate.
   *
   * Invisible to the compiler, because the field was optional on the client's
   * own type — `undefined` typechecked perfectly.
   */
  lifeSpan: ArtistLifeSpan | null;
};

/**
 * The name each hit is compared by.
 *
 * Case- and whitespace-insensitive: "discharge" and "Discharge " are the same
 * name to a reader, and MusicBrainz names are user-submitted. A comparison that
 * missed those would auto-accept precisely the collision this rule exists to
 * catch.
 */
function nameKey(name: string): string {
  return name.trim().toLowerCase();
}

const rawHit = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  score: z.number().optional(),
  type: z.string().nullish(),
  country: z.string().nullish(),
  disambiguation: z.string().nullish(),
  /**
   * **Hyphenated — MusicBrainz sends `life-span`, not `lifeSpan`.** That is the
   * spelling a plausible-looking camelCase lookup would miss forever while
   * typechecking perfectly.
   *
   * `catch` rather than a bare optional: this is someone else's payload, and a
   * malformed life-span should cost the DATE, not the whole hit — dropping the
   * artist would remove a candidate from the very list the user is choosing
   * from.
   */
  'life-span': z
    .object({
      begin: z.string().nullish(),
      end: z.string().nullish(),
      ended: z.boolean().nullish(),
    })
    .nullish()
    .catch(undefined),
});

/** Permissive by design: this is someone else's payload and they add fields. */
export function normalizeSearchHits(payload: unknown): ArtistSearchHit[] {
  const artists = (payload as { artists?: unknown })?.artists;
  if (!Array.isArray(artists)) return [];

  const hits: ArtistSearchHit[] = [];

  for (const candidate of artists) {
    const parsed = rawHit.safeParse(candidate);
    if (!parsed.success) continue;

    const span = parsed.data['life-span'];

    hits.push({
      mbid: parsed.data.id,
      name: parsed.data.name ?? '',
      score: parsed.data.score ?? 0,
      type: parsed.data.type ?? null,
      country: parsed.data.country ?? null,
      disambiguation: parsed.data.disambiguation ?? null,
      /**
       * `null` when absent rather than an object of nulls: the picker treats a
       * null span as "no dates to show", where `{begin: null}` would render a
       * stray separator claiming a date exists.
       */
      lifeSpan:
        span === undefined || span === null
          ? null
          : { begin: span.begin ?? null, end: span.end ?? null, ended: span.ended ?? false },
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
  const [best] = ranked;

  /**
   * **The rule keys on the NAME, because the name is what failed** (§4.3).
   *
   * An earlier version used a score gap — top hit 100, runner-up below 90 — and
   * it was wrong in a way worth recording, because it looks more sophisticated
   * and someone will propose it again. MusicBrainz ranks by how well documented
   * an artist is, so among four groups called Discharge the famous d-beat band
   * scores 100 and the others 83, 82, 82 (measured 2026-08-14). A gap rule
   * therefore auto-accepts exactly the case it was written to catch, and stays
   * silent precisely where names are ambiguous.
   *
   * Score is not consulted at all here. It orders the results; it does not
   * decide them.
   */
  const bestKey = nameKey(best.name);
  const sameName = ranked.filter((hit) => nameKey(hit.name) === bestKey);

  return sameName.length === 1 ? best : null;
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
