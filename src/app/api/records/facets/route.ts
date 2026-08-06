import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api/handler';
import { recordFacets } from '@/lib/db/queries/records';

/**
 * SPEC.md §5.2 `GET /api/records/facets` — the genre, label, store and tag
 * values worth filtering by, with counts.
 *
 * A static segment like `stats`, so the §5.2 routing note applies here too:
 * Next resolves static before dynamic, and `[id]` rejects a non-UUID with a
 * 400 rather than attempting a lookup. Covered over the wire in
 * e2e/records-routing.spec.ts, because route precedence is a property of the
 * router and cannot be tested by calling a handler directly.
 *
 * No query parameters: facets describe the whole collection and do not vary
 * with filters (§5.2), so there is nothing to validate.
 */
export const GET = withErrorHandling('api.records.facets.GET', async () => {
  return NextResponse.json(await recordFacets());
});
