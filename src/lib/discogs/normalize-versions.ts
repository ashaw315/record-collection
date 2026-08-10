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
 * Master → version drill-down (SPEC.md §5.7).
 *
 * §5.7 calls this "the step where the user identifies THEIR pressing rather
 * than just the album", and master 50683 shows why in one pair of rows:
 *
 *   381756  UK  1982  Clay Records  CLAY LP 3  LP, Album
 *   6779382 UK  1989  Clay Records  CLAY LP 3  LP, Reissue
 *
 * Same country, same label, same catalog number. Only the year and the format
 * descriptors separate a record worth hunting from a reissue worth a fraction
 * of it — so §10's comparison table carries all five fields together, and this
 * normalizer's job is to make sure none of them is quietly lost.
 *
 * The payload is NOT shaped like a search result. `format` arrives as a
 * comma-joined string, the year is `released`, and community counts are nested
 * under `stats.community`. All three would have been guessed wrong from a
 * hand-written fixture.
 */

const rawVersion = z
  .object({
    id: z.number(),
    title: z.string().optional(),
    label: z.string().optional(),
    country: z.string().optional(),
    catno: z.string().optional(),
    // NOT `year`, and NOT an array. See the header.
    released: z.string().optional(),
    format: z.string().optional(),
    major_formats: z.array(z.string()).optional(),
    thumb: z.string().optional(),
    status: z.string().optional(),
    stats: z
      .object({
        community: z
          .object({
            in_collection: z.number().optional(),
            in_wantlist: z.number().optional(),
          })
          .optional(),
      })
      .optional(),
  })
  .passthrough();

const rawVersionsResponse = z
  .object({
    versions: z.array(z.unknown()).optional(),
    pagination: z
      .object({
        items: z.number().optional(),
        page: z.number().optional(),
        per_page: z.number().optional(),
        pages: z.number().optional(),
      })
      .optional(),
  })
  .passthrough();

export type NormalizedVersion = {
  discogsId: number;
  title: string | null;
  label: string | null;
  country: string | null;
  year: number | null;
  catalogNumber: string | null;
  formats: string[];
  isReissue: boolean;
  thumbUrl: string | null;
  communityHave: number | null;
  communityWant: number | null;
};

export type NormalizedVersionsResponse = {
  data: NormalizedVersion[];
  meta: { total: number; page: number; pageSize: number; pages: number };
};

export function normalizeVersion(input: unknown): NormalizedVersion {
  const raw = rawVersion.parse(input);

  /**
   * `major_formats` ("Vinyl") and `format` ("LP, Album, Reissue") describe
   * different things — the medium and the specifics — and the table needs
   * both. Combined here rather than at the call site so every consumer sees
   * the same list.
   */
  const descriptors = [...toDescriptors(raw.major_formats), ...toDescriptors(raw.format)];

  return {
    discogsId: raw.id,
    title: bounded(meaningful(raw.title), FIELD_LIMITS.title),
    label: bounded(meaningful(raw.label), FIELD_LIMITS.name),
    /**
     * "UK, Europe & US" and "Worldwide" are real values here. Left as written:
     * splitting would invent three pressings from one, and taking the first
     * would claim a UK pressing Discogs never asserted. It is prose, the user
     * reads it and decides.
     */
    country: meaningful(raw.country),
    year: toYear(raw.released),
    catalogNumber: meaningful(raw.catno),
    formats: descriptors,
    isReissue: inferReissue(descriptors),
    thumbUrl: safeImageUrl(raw.thumb),
    communityHave: raw.stats?.community?.in_collection ?? null,
    communityWant: raw.stats?.community?.in_wantlist ?? null,
  };
}

export function normalizeVersionsResponse(input: unknown): NormalizedVersionsResponse {
  const raw = rawVersionsResponse.parse(input);

  return {
    data: (raw.versions ?? []).map(normalizeVersion),
    meta: {
      total: raw.pagination?.items ?? 0,
      page: raw.pagination?.page ?? 1,
      pageSize: raw.pagination?.per_page ?? 0,
      // 57 versions over 3 pages: without this the user believes 25 is all
      // there is and stops looking before reaching theirs.
      pages: raw.pagination?.pages ?? 1,
    },
  };
}
