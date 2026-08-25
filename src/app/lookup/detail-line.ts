/**
 * The identifying line under a `/lookup` result card: year, country, label,
 * catalog number, joined with a separator.
 *
 * **The year slot is always occupied, even when Discogs has no year.**
 *
 * FOUND IN REAL USE, 2026-08-25. A card rendered "Canada · Elektra ·
 * EKS-75005 Q" while its neighbours began with a year, so country sat where
 * the year sat one row up and the eye lost the column. Measured against the
 * live payload: that release has no `year` key at all, and **26% of rows
 * across six albums are the same** — a quarter of a results page, not an edge
 * case. Reissues are the most likely to lack a year, and telling a reissue
 * from an original is the whole job of this screen.
 *
 * Only the year is placeheld. It is the LEADING column, so its absence shifts
 * every field after it; a missing label in the middle shifts nothing. Padding
 * every slot would make a sparse row read as four unknown facts instead of the
 * two known ones.
 */

/** An em dash: absence, and not mistakable for something a contributor typed. */
export const ABSENT_YEAR = '—';

type DetailFields = {
  year: number | null;
  country: string | null;
  label: string | null;
  catalogNumber: string | null;
};

export function detailParts(fields: DetailFields): string[] {
  const rest = [fields.country, fields.label, fields.catalogNumber].filter(
    (part): part is string => part !== null && part.trim() !== '',
  );

  return [fields.year === null ? ABSENT_YEAR : String(fields.year), ...rest];
}
