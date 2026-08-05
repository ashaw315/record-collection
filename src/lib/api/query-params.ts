/**
 * SPEC.md §5 list-endpoint conventions: ?page=1&pageSize=50&sort=field:asc|desc.
 *
 * pageSize is clamped at 200 rather than rejected — the spec is explicit that a
 * larger value is not a client error. `sort` is validated against a per-endpoint
 * allowlist and REJECTED with 400 when unrecognised, never interpolated.
 */

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

export type SortDirection = 'asc' | 'desc';

export type ListParams<TField extends string> = {
  page: number;
  pageSize: number;
  offset: number;
  sort?: { field: TField; direction: SortDirection };
};

export type ParseResult<TField extends string> =
  | { ok: true; value: ListParams<TField> }
  | { ok: false; fieldErrors: Record<string, string> };

/** Rejects `1.5`, `1e3`, `0x10`, ` 1 ` and '' — only plain non-negative digits. */
function parseIntegerParam(raw: string | null): number | undefined {
  if (raw === null || !/^\d+$/.test(raw)) return undefined;
  return Number(raw);
}

export function parseListParams<const TField extends string>(
  searchParams: URLSearchParams,
  sortableFields: readonly TField[],
): ParseResult<TField> {
  const fieldErrors: Record<string, string> = {};

  const rawPage = searchParams.get('page');
  const page = rawPage === null ? 1 : parseIntegerParam(rawPage);
  if (page === undefined || page < 1) {
    fieldErrors.page = 'page must be a positive integer';
  }

  const rawPageSize = searchParams.get('pageSize');
  const parsedPageSize = rawPageSize === null ? DEFAULT_PAGE_SIZE : parseIntegerParam(rawPageSize);
  if (parsedPageSize === undefined || parsedPageSize < 1) {
    fieldErrors.pageSize = 'pageSize must be a positive integer';
  }

  const rawSort = searchParams.get('sort');
  let sort: { field: TField; direction: SortDirection } | undefined;
  if (rawSort !== null) {
    const parts = rawSort.split(':');
    const [fieldPart, directionPart] = parts;

    // Identity match against the allowlist — not a regex, not a normalized
    // comparison. The value returned is the caller's own literal, so nothing
    // derived from user input can reach the query builder even if this parser
    // is wrong.
    const field = sortableFields.find((candidate) => candidate === fieldPart);

    if (parts.length > 2) {
      fieldErrors.sort = 'sort must be of the form field or field:asc|desc';
    } else if (field === undefined) {
      fieldErrors.sort = `sort field must be one of: ${sortableFields.join(', ')}`;
    } else if (directionPart === undefined) {
      sort = { field, direction: 'asc' };
    } else if (directionPart === 'asc' || directionPart === 'desc') {
      sort = { field, direction: directionPart };
    } else {
      fieldErrors.sort = 'sort direction must be asc or desc';
    }
  }

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };

  // Both are defined here: any undefined value produced a field error above.
  const safePage = page ?? 1;
  const safePageSize = Math.min(parsedPageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

  return {
    ok: true,
    value: {
      page: safePage,
      pageSize: safePageSize,
      offset: (safePage - 1) * safePageSize,
      sort,
    },
  };
}
