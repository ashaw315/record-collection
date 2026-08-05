/**
 * SPEC.md §5 list-endpoint conventions: ?page=1&pageSize=50&sort=field:asc|desc.
 *
 * pageSize is clamped at 200 rather than rejected — the spec is explicit that a
 * larger value is not a client error. `sort` is validated against a per-endpoint
 * allowlist and REJECTED with 400 when unrecognised, never interpolated.
 */

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

/**
 * The largest accepted page number.
 *
 * 1,000,000 rather than Number.MAX_SAFE_INTEGER: the bound exists to keep the
 * request plausible, not merely representable. At the maximum page size that is
 * an offset of 200,000,000 — far past any real collection, while still leaving
 * page * pageSize exactly representable as a JS number with room to spare.
 *
 * Without a bound, `/^\d+$/` accepted `99999999999999999999`, `Number()` lost
 * precision to `5e+21`, and Postgres rejected it with 22P02 — a client error
 * diagnosed by the database rather than at the boundary.
 */
export const MAX_PAGE = 1_000_000;

export type SortDirection = 'asc' | 'desc';

/**
 * An offset that has passed bound-checking. The brand is unforgeable outside
 * this module, so a raw `number` cannot be passed where an offset is expected:
 * the rule is unrepresentable rather than merely tested, and a future caller
 * cannot reintroduce an unchecked offset by pattern-matching on a comment.
 */
declare const validatedOffset: unique symbol;
export type Offset = number & { readonly [validatedOffset]: true };

export type ListParams<TField extends string> = {
  page: number;
  pageSize: number;
  offset: Offset;
  sort?: { field: TField; direction: SortDirection };
};

export type ParseResult<TField extends string> =
  | { ok: true; value: ListParams<TField> }
  | { ok: false; fieldErrors: Record<string, string> };

/**
 * Rejects `1.5`, `1e3`, `0x10`, ` 1 ` and '' — only plain non-negative digits —
 * and, critically, anything that cannot round-trip as a JS number.
 *
 * The digit check alone is not sufficient: `99999999999999999999` matches it,
 * and `Number()` silently yields `5e+21`. Number.isSafeInteger is what makes
 * "looks numeric" mean "is exactly this integer".
 */
function parseIntegerParam(raw: string | null): number | undefined {
  if (raw === null || !/^\d+$/.test(raw)) return undefined;
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) return undefined;
  return value;
}

export function parseListParams<const TField extends string>(
  searchParams: URLSearchParams,
  sortableFields: readonly TField[],
): ParseResult<TField> {
  const fieldErrors: Record<string, string> = {};

  const rawPage = searchParams.get('page');
  const page = rawPage === null ? 1 : parseIntegerParam(rawPage);
  if (page === undefined || page < 1 || page > MAX_PAGE) {
    fieldErrors.page = `page must be an integer between 1 and ${MAX_PAGE}`;
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
  const offset = (safePage - 1) * safePageSize;

  // The one place an Offset is minted.
  //
  // NOT COVERED BY ANY TEST, and unreachable today: MAX_PAGE * MAX_PAGE_SIZE is
  // 2e8, far inside safe-integer range, so no input can trigger this branch. It
  // is a tripwire for a future careless bound change — if either constant is
  // raised past ~2^53, this fails loudly here instead of silently handing
  // Postgres a value it will reject. Kept deliberately; do not read it as a
  // verified guarantee.
  if (!Number.isSafeInteger(offset)) {
    return { ok: false, fieldErrors: { page: 'page and pageSize produce too large an offset' } };
  }

  return {
    ok: true,
    value: {
      page: safePage,
      pageSize: safePageSize,
      offset: offset as Offset,
      sort,
    },
  };
}
