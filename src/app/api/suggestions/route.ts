import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api/handler';
import { parseIntegerParam } from '@/lib/api/query-params';
import { suggestions } from '@/lib/db/queries/suggestions';

/**
 * SPEC.md §5.8 `GET /api/suggestions` — §9.1's relationship-based suggestions.
 * "Query: `limit` (default 10)."
 *
 * Not the §5 list envelope's `page`/`pageSize`/`sort`: §5.8 specifies one
 * parameter and the result is a ranked head, not a paged set. Paging a ranking
 * would invite page 2 of a top-10, which §9.1 does not define an ordering
 * stable enough to serve — and `parseListParams` would reject `limit` as
 * unrecognised while silently accepting `page`.
 */

const DEFAULT_LIMIT = 10;

/**
 * The largest accepted `limit`.
 *
 * Bounded for the reason `MAX_PAGE` exists: unbounded, `99999999999999999999`
 * passes a digit test, loses precision as a JS number, and reaches whatever
 * consumes it — today an in-memory `slice`, which shrugs, and tomorrow a SQL
 * LIMIT, which does not. 200 matches `MAX_PAGE_SIZE`, the established ceiling
 * for "how many rows may one request return".
 */
const MAX_LIMIT = 200;

export const GET = withErrorHandling('api.suggestions.GET', async (request: Request) => {
  const searchParams = new URL(request.url).searchParams;

  const raw = searchParams.get('limit');
  const limit = raw === null ? DEFAULT_LIMIT : parseIntegerParam(raw);

  /*
   * `parseIntegerParam` is imported rather than re-implemented. It rejects
   * '5e4', '0x50', ' 1 ' and anything that cannot round-trip as a safe integer
   * — all values a bare `Number()` accepts and silently transforms. A second
   * copy is how two parsers come to disagree about what a number is, which this
   * codebase has already recorded once.
   */
  if (limit === undefined || limit < 1 || limit > MAX_LIMIT) {
    return NextResponse.json(
      {
        error: {
          message: 'Invalid query parameters',
          code: 'VALIDATION_ERROR',
          fieldErrors: { limit: `limit must be an integer between 1 and ${MAX_LIMIT}` },
        },
      },
      { status: 400 },
    );
  }

  return NextResponse.json({ data: await suggestions({ limit }) });
});
