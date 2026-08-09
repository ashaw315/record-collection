/**
 * Field rules shared by every Discogs normalizer (SPEC.md §5.7).
 *
 * Extracted rather than copied into each one. Search results, master versions
 * and release detail all encode absence the same way and all infer `isReissue`
 * from the same descriptors — and a second definition of these rules is how
 * they drift, with the drift silent: a reissue detected on the search screen
 * and missed in the version table would look like a data problem at Discogs
 * rather than a bug here.
 *
 * `create-schema.ts` is the precedent. Two definitions that agreed field for
 * field survived a whole step because nothing failed while they agreed.
 */

/**
 * Discogs encodes absence as PROSE, and every one of these is a real value
 * from the captured fixtures: `country: "Unknown"`, `catno: "none"`,
 * `label: ["Not On Label"]`.
 *
 * Passed through, they become a record pressed in a country called Unknown
 * with catalog number "none" — data that looks ENTERED rather than missing,
 * which is worse than a blank because it sorts, filters and displays as fact.
 *
 * No hand-written fixture would have contained these; they are the argument
 * for captured fixtures in one line.
 */
const ABSENT = new Set(['', 'unknown', 'none', 'not on label', 'n/a', 'various']);

export function meaningful(value: string | undefined | null): string | null {
  if (value === undefined || value === null) return null;

  const trimmed = value.trim();
  return trimmed === '' || ABSENT.has(trimmed.toLowerCase()) ? null : trimmed;
}

/**
 * A year as a number, or null.
 *
 * `Number('')` is 0 and `Number('n/a')` is NaN — both would reach a column that
 * expects a year, and the first is more dangerous because it looks like data.
 * The Zod coercion class from NOTES, met at an external boundary.
 *
 * Accepts a full date because Discogs sends `released: "1982-03-15"` on some
 * rows and `"1982"` on others; `parseInt` stops at the first non-digit, which
 * is the wanted behaviour here rather than an accident.
 */
export function toYear(value: string | number | undefined | null): number | null {
  if (value === undefined || value === null) return null;

  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value).trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * §5.7: "isReissue — inferred from format descriptors."
 *
 * Matched as WHOLE descriptors, never by substring. The real descriptor lists
 * contain "Mispress", "Misprint", "Remix", "Reprise" and "Record Store Day",
 * and a substring test finds a reissue inside several of them. This is the
 * original-versus-repress distinction CLAUDE.md §8 is about, so a false
 * positive mislabels the exact thing the app exists to get right.
 */
const REISSUE_DESCRIPTORS = new Set(['reissue', 'repress', 'remastered', 'reprint']);

export function inferReissue(descriptors: string[]): boolean {
  return descriptors.some((descriptor) => REISSUE_DESCRIPTORS.has(descriptor.trim().toLowerCase()));
}

/**
 * A Discogs id from a path segment, or null when it is not unambiguously one.
 *
 * **`z.coerce.number()` alone is not sufficient, and this was demonstrated
 * rather than assumed.** Probed against the real coercion:
 *
 *   '50683'  → 50683      ' 50683 ' → 50683
 *   '5e4'    → 50000      '0x50'    → 80        '50683\n' → 50683
 *
 * These ids are interpolated into a URL we then request, so an accepted-but-
 * transformed value fetches a DIFFERENT record and presents it as the answer —
 * not an error, but the wrong pressing shown as the right one, which is the
 * §7.7 confusion arriving from a new direction.
 *
 * The digit test IS the validation; the numeric conversion is only the
 * conversion. A mutation removing the check failed zero tests, because every
 * id in the test set was one coercion rejects anyway.
 */
export function toDiscogsId(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;

  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Format descriptors, whichever way this endpoint happened to send them.
 *
 * Search results send an ARRAY (`["Vinyl", "LP", "Reissue"]`); master versions
 * send a comma-joined STRING (`"LP, Album, Reissue"`). Treating the string as
 * an array yields one descriptor matching nothing, and every reissue in a
 * version table silently reads as an original.
 */
export function toDescriptors(value: string[] | string | undefined | null): string[] {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value;

  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');
}
