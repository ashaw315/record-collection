import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api/handler';
import { recordStats } from '@/lib/db/queries/records';

/**
 * SPEC.md §5.2 `GET /api/records/stats`.
 *
 * A STATIC segment sitting alongside `[id]`. Next resolves static before
 * dynamic, so `/api/records/stats` reaches this file rather than being read as
 * an id — but `[id]` still rejects a non-UUID with 400 rather than attempting a
 * lookup, so a routing regression surfaces as a clean error instead of a
 * Postgres cast failure. Both halves are asserted in the tests.
 */
export const GET = withErrorHandling('api.records.stats.GET', async () => {
  return NextResponse.json(await recordStats());
});
