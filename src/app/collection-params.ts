import { isValidFormedYear } from '@/lib/api/year';
import { RECORD_SORT_FIELDS, type RecordFilters, type RecordSortField } from '@/lib/records/fields';

/**
 * URL state for the collection screen (SPEC.md §10).
 *
 * Filters live in the URL, not React state: a filtered view is then linkable
 * and survives a refresh, and the SERVER component re-runs with new params
 * rather than the client refetching and holding a second copy of the data.
 *
 * **This parser is deliberately not the API's.** `/api/records` REJECTS a
 * malformed filter with a 400 (§5), because a caller sending nonsense needs to
 * be told. A page cannot 400 — a stale bookmark or a hand-edited URL still has
 * to render something — so this one drops what it cannot read and falls back.
 * The two behaviours are different on purpose, and each is tested.
 *
 * No `server-only`: the controls are a client component and build their hrefs
 * with `toQueryString`.
 */

/**
 * §10's table/grid toggle, plus §10b's shelf.
 *
 * `shelf` is FIRST because it is the default (§10b: "the default view of `/` on
 * desktop") — a wall of spines browsed by eye, where table and grid are ways of
 * reading the data. It is a third mode, not a replacement: §10's toggle still
 * reaches both others.
 */
export const VIEW_MODES = ['shelf', 'table', 'grid'] as const;
export type ViewMode = (typeof VIEW_MODES)[number];

export type CollectionParams = {
  filters: RecordFilters;
  sort?: { field: RecordSortField; direction: 'asc' | 'desc' };
  view: ViewMode;
  page: number;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readUuid(value: string | null): string | undefined {
  return value !== null && UUID_PATTERN.test(value) ? value : undefined;
}

/**
 * Plain digits only, then a range check.
 *
 * `Number('')` is 0 — the coercion trap recorded in NOTES, which in unit 3
 * silently applied `release_year >= 0` and dropped every undated record. This
 * parser does not go through the Zod schema that was fixed there, so it repeats
 * the guard rather than inheriting it.
 */
function readYear(value: string | null): number | undefined {
  if (value === null || !/^-?\d+$/.test(value)) return undefined;
  const year = Number(value);
  return isValidFormedYear(year) ? year : undefined;
}

function readPage(value: string | null): number {
  if (value === null || !/^\d+$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) && page >= 1 ? page : 1;
}

export function parseCollectionParams(search: URLSearchParams): CollectionParams {
  const filters: RecordFilters = {};

  const q = search.get('q')?.trim();
  if (q !== undefined && q !== '') filters.q = q;

  for (const key of ['artistId', 'genreId', 'labelId', 'storeId', 'tagId', 'formatId'] as const) {
    const value = readUuid(search.get(key));
    if (value !== undefined) filters[key] = value;
  }

  const yearFrom = readYear(search.get('yearFrom'));
  const yearTo = readYear(search.get('yearTo'));
  if (yearFrom !== undefined) filters.yearFrom = yearFrom;
  if (yearTo !== undefined) filters.yearTo = yearTo;

  /**
   * Only meaningful alongside a year filter (§5.2), so it is only set when one
   * is present — otherwise a plain view would carry a filter key that does
   * nothing, and `toQueryString` would have to special-case it back out.
   */
  if (yearFrom !== undefined || yearTo !== undefined) {
    filters.includeUndated = search.get('includeUndated') !== 'false';
  }

  return {
    filters,
    sort: readSort(search.get('sort')),
    view: readView(search.get('view')),
    page: readPage(search.get('page')),
  };
}

/**
 * The allowlist reaching the URL layer. `notes` is a real column that would
 * sort fine and is refused because it is not enumerated — the same rule as the
 * API, restated because this parser feeds the query layer directly.
 */
function readSort(value: string | null): CollectionParams['sort'] {
  if (value === null) return undefined;

  const [field, direction] = value.split(':');
  if (direction !== 'asc' && direction !== 'desc') return undefined;
  if (!RECORD_SORT_FIELDS.includes(field as RecordSortField)) return undefined;

  return { field: field as RecordSortField, direction };
}

/**
 * §10b moved the default from `table` to `shelf`. An unrecognised value falls
 * back to the default rather than 400ing — a view mode is a presentation
 * preference, and a stale bookmark should show the collection rather than an
 * error.
 */
export const DEFAULT_VIEW: ViewMode = 'shelf';

function readView(value: string | null): ViewMode {
  return VIEW_MODES.includes(value as ViewMode) ? (value as ViewMode) : DEFAULT_VIEW;
}

/**
 * Serialises back to a query string, omitting every default.
 *
 * `?view=table&page=1&includeUndated=true` is noise on the common case, and a
 * URL that grows keys nobody set makes the interesting ones hard to see.
 */
export function toQueryString(params: CollectionParams): string {
  const search = new URLSearchParams();

  if (params.filters.q !== undefined) search.set('q', params.filters.q);

  for (const key of ['artistId', 'genreId', 'labelId', 'storeId', 'tagId', 'formatId'] as const) {
    const value = params.filters[key];
    if (value !== undefined) search.set(key, value);
  }

  if (params.filters.yearFrom !== undefined) search.set('yearFrom', String(params.filters.yearFrom));
  if (params.filters.yearTo !== undefined) search.set('yearTo', String(params.filters.yearTo));
  if (params.filters.includeUndated === false) search.set('includeUndated', 'false');

  if (params.sort !== undefined) {
    search.set('sort', `${params.sort.field}:${params.sort.direction}`);
  }
  // Omits the DEFAULT, which §10b moved — otherwise `/` would emit
  // `?view=shelf` on every link while `?view=table` vanished.
  if (params.view !== DEFAULT_VIEW) search.set('view', params.view);
  if (params.page > 1) search.set('page', String(params.page));

  return search.toString();
}

/**
 * Changes one facet and returns to page 1.
 *
 * Every control builds its href from the CURRENT state rather than from
 * scratch, or clicking "sort by year" silently clears the search. The page
 * reset lives here rather than at each call site: staying on page 4 while
 * narrowing the results is how a filter appears to return nothing, and it is
 * the kind of rule that gets applied at three of four controls.
 *
 * A filter key set to `undefined` REMOVES it — that is how a chip is cleared.
 * The spread does not do this on its own: `{ ...a, ...b }` leaves a
 * present-but-undefined key behind.
 *
 * That distinction is invisible to `toQueryString`, which skips undefined
 * either way — verified, along with the fact that `toEqual` does NOT catch it
 * and `toStrictEqual` does. The test uses the strict matcher for exactly this
 * reason. The key is deleted rather than left undefined because a state object
 * carrying keys nobody set is one that reads wrong in a debugger and compares
 * wrong anywhere someone reaches for `Object.keys`.
 */
export function withFacet(
  params: CollectionParams,
  change: {
    filters?: Partial<Record<keyof RecordFilters, string | number | boolean | undefined>>;
    sort?: CollectionParams['sort'];
    view?: ViewMode;
  },
): CollectionParams {
  const filters = { ...params.filters };

  if (change.filters !== undefined) {
    for (const [key, value] of Object.entries(change.filters)) {
      if (value === undefined) delete filters[key as keyof RecordFilters];
      else Object.assign(filters, { [key]: value });
    }
  }

  return {
    filters,
    sort: 'sort' in change ? change.sort : params.sort,
    view: change.view ?? params.view,
    page: 1,
  };
}
