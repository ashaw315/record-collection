import { z } from 'zod';
import {
  FIELD_LIMITS,
  bounded,
  inferReissue,
  meaningful,
  safeImageUrl,
  toDescriptors,
  toYear,
} from './fields';

/**
 * Discogs search payloads → SPEC.md §5.7's normalized search result.
 *
 * §5.7: "Returns normalized results, not raw Discogs payloads." Raw payloads
 * reaching the client would put Discogs' field names and its encoding of
 * absence into our UI, and every consumer would have to learn both.
 *
 * **Genres and styles stay SEPARATE.** Discogs sends `genre: ["Rock"]` with
 * `style: ["Hardcore", "Punk"]` for a UK82 hardcore record. CLAUDE.md §8
 * forbids flattening those distinctions, and §6 says to prefer `styles` because
 * it is the more specific term — so both travel, and §7.1's hierarchy decides
 * how they relate. A normalizer that picked one would make that decision
 * silently and irreversibly.
 */

/**
 * Discogs' own field names, parsed at the boundary (CLAUDE.md §6: `any` is
 * forbidden except at the boundary of genuinely untyped external payloads, and
 * there it must be immediately narrowed with a Zod parse).
 *
 * Everything is optional. This is a user-submitted database and its search
 * results are sparse in ways that are not documented — `catno` and `country`
 * are missing entirely on some rows and prose on others.
 */
const rawSearchResult = z
  .object({
    id: z.number(),
    type: z.string().optional(),
    title: z.string().optional(),
    year: z.union([z.string(), z.number()]).optional(),
    country: z.string().optional(),
    catno: z.string().optional(),
    label: z.array(z.string()).optional(),
    // SINGULAR here. Release detail uses `genres`/`styles`; search uses
    // `genre`/`style`, and assuming otherwise silently yields empty arrays.
    genre: z.array(z.string()).optional(),
    style: z.array(z.string()).optional(),
    format: z.array(z.string()).optional(),
    /**
     * PLURAL, and a different shape from `format` above — this is not a
     * duplicate of it.
     *
     * Search rows carry BOTH: `format` is a flat array of strings, `formats`
     * is an array of objects whose `text` holds the free-text qualifier.
     * `text` exists ONLY here. Declaring `format` alone let `.passthrough()`
     * absorb this key, so the qualifier never reached the type boundary and
     * two pressings rendered identically on the search card.
     *
     * `descriptions` is deliberately NOT read: it omits the medium ("Vinyl")
     * that the flat array includes, and `isReissue` plus §10a's spread both
     * depend on the medium being the first descriptor.
     */
    formats: z
      .array(
        z
          .object({ text: z.string().optional() })
          .passthrough(),
      )
      .optional()
      .catch(undefined),
    thumb: z.string().optional(),
    cover_image: z.string().optional(),
    master_id: z.number().nullable().optional(),
    community: z.object({ have: z.number().optional(), want: z.number().optional() }).optional(),
  })
  .passthrough();

const rawSearchResponse = z
  .object({
    results: z.array(z.unknown()).optional(),
    pagination: z
      .object({
        items: z.number().optional(),
        page: z.number().optional(),
        per_page: z.number().optional(),
      })
      .optional(),
  })
  .passthrough();

export type NormalizedSearchResult = {
  discogsId: number;
  type: 'release' | 'master';
  masterId: number | null;
  title: string;
  artist: string | null;
  thumbUrl: string | null;
  coverUrl: string | null;
  year: number | null;
  country: string | null;
  label: string | null;
  catalogNumber: string | null;
  formats: string[];
  /**
   * The free-text qualifier from `formats[].text` — "Specialty Records
   * Corporation Pressing", "Allentown Pressing", "Gatefold", "180g".
   *
   * Separate from `formats` because it is a different KIND of thing: the
   * descriptors are a controlled vocabulary, this is prose a contributor
   * typed. It is the most discriminating field Discogs offers at list level
   * and it is also the least trustworthy, so it travels on its own and the UI
   * presents it as a hint rather than as a resolved plant identity (§7.8).
   */
  formatText: string | null;
  genres: string[];
  styles: string[];
  isReissue: boolean;
  communityHave: number | null;
  communityWant: number | null;
};

export type NormalizedSearchResponse = {
  data: NormalizedSearchResult[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
    /**
     * Rows Discogs sent that could not be parsed.
     *
     * Reported rather than merely logged: a search silently returning 47 of 50
     * is a quieter version of failing the whole page. On the lookup screen a
     * missing result reads as "Discogs does not have it" rather than "we could
     * not parse it", and the user stops looking for a record that exists.
     */
    dropped: number;
  };
};



/**
 * Discogs sends `"Discharge - Hear Nothing See Nothing Say Nothing"` as one
 * string. §5.7 wants them apart.
 *
 * Split on the FIRST " - " only: titles contain hyphens of their own, and
 * splitting on each one turns "Why - The Singles" into an artist and two
 * fragments.
 */
function splitTitle(combined: string | undefined): { artist: string | null; title: string } {
  if (combined === undefined) return { artist: null, title: '' };

  const separator = combined.indexOf(' - ');
  if (separator === -1) return { artist: null, title: combined.trim() };

  return {
    artist: combined.slice(0, separator).trim(),
    title: combined.slice(separator + 3).trim(),
  };
}


export function normalizeSearchResult(input: unknown): NormalizedSearchResult {
  const raw = rawSearchResult.parse(input);
  const { artist, title } = splitTitle(raw.title);
  const formats = toDescriptors(raw.format);

  return {
    discogsId: raw.id,
    // Default to release: §5.7 says the search endpoint's `type` defaults to
    // `release`, and a result that fails to say is one.
    type: raw.type === 'master' ? 'master' : 'release',
    masterId: raw.master_id ?? null,
    title: bounded(title, FIELD_LIMITS.title) ?? '',
    artist: bounded(artist, FIELD_LIMITS.name),
    // https only — see `safeImageUrl`. A contributor chooses these values.
    thumbUrl: safeImageUrl(raw.thumb),
    coverUrl: safeImageUrl(raw.cover_image),
    year: toYear(raw.year),
    country: meaningful(raw.country),
    // The first label is the releasing one; the rest are pressing plants and
    // distributors, which belong to the pressing rather than the record.
    label: meaningful(raw.label?.[0]),
    catalogNumber: meaningful(raw.catno),
    formats,
    /**
     * First non-empty qualifier. A multi-disc release has one entry per disc
     * and they repeat; taking the first is what the release page shows.
     * Through `meaningful`/`bounded` like every other Discogs string — live
     * values include a trailing space, and the column bounds apply to prose a
     * stranger typed.
     */
    formatText: bounded(
      meaningful(raw.formats?.map((entry) => meaningful(entry.text)).find((t) => t !== null)),
      FIELD_LIMITS.name,
    ),
    genres: raw.genre ?? [],
    styles: raw.style ?? [],
    isReissue: inferReissue(formats),
    communityHave: raw.community?.have ?? null,
    communityWant: raw.community?.want ?? null,
  };
}

export function normalizeSearchResponse(input: unknown): NormalizedSearchResponse {
  const raw = rawSearchResponse.parse(input);

  /**
   * A malformed ROW drops the row, never the page.
   *
   * One result with a non-numeric id threw a ZodError out of this function,
   * which `withErrorHandling` turned into a 500 — our bug reported for their
   * malformation, and one hostile row poisoning a page of good ones. §5.7 says
   * Discogs merges, splits and gets things wrong; a page that loses a row is
   * degraded, a page that fails entirely is broken.
   */
  const data: NormalizedSearchResult[] = [];
  let dropped = 0;

  for (const result of raw.results ?? []) {
    try {
      data.push(normalizeSearchResult(result));
    } catch {
      dropped += 1;
    }
  }

  return {
    data,
    meta: {
      total: raw.pagination?.items ?? 0,
      page: raw.pagination?.page ?? 1,
      pageSize: raw.pagination?.per_page ?? 0,
      dropped,
    },
  };
}
