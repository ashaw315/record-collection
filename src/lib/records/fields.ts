/**
 * The §5.2 sort allowlist and filter shape, in a module BOTH sides can import.
 *
 * These constants used to live only in `@/lib/db/queries/records`, which is
 * marked `server-only` (CLAUDE.md §6). The collection screen's filter controls
 * are a client component and need the same allowlist to build their hrefs, and
 * importing the query module from the client would fail the build — correctly,
 * since it would pull the database driver into the browser bundle.
 *
 * Duplicating the list instead would be worse: two allowlists drift, and the
 * one that drifts is the one that stops rejecting something. So the definition
 * moves here and the query layer re-exports it, leaving exactly one source.
 */

export const RECORD_SORT_FIELDS = [
  'title',
  'artist',
  'purchaseDate',
  'purchasePrice',
  'releaseYear',
] as const;

export type RecordSortField = (typeof RECORD_SORT_FIELDS)[number];

export const CONDITION_GRADES = ['M', 'NM', 'VG+', 'VG', 'G+', 'G', 'F', 'P'] as const;
export type ConditionGrade = (typeof CONDITION_GRADES)[number];

export type RecordFilters = {
  artistId?: string;
  genreId?: string;
  labelId?: string;
  storeId?: string;
  tagId?: string;
  formatId?: string;
  condition?: ConditionGrade;
  yearFrom?: number;
  yearTo?: number;
  /** §5.2, default true. Only meaningful alongside a year filter. */
  includeUndated?: boolean;
  q?: string;
};
