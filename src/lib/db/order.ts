import 'server-only';
import { asc, desc, sql, type Column, type SQL } from 'drizzle-orm';
import type { SortDirection } from '@/lib/api/query-params';

/**
 * Builds the ORDER BY for a list query: the requested column, then an
 * unconditional tiebreaker.
 *
 * Two properties every list endpoint needs, and neither is automatic.
 *
 * **The tiebreaker.** Postgres does not promise an order for rows that tie on
 * the sort key, and does not return a stable one in practice — the plan changes
 * with table size and with writes. Paging through tied rows can therefore show
 * one row twice and drop another. Verified: with 60 rows sharing a created_at,
 * removing the tiebreaker loses rows across six pages of ten.
 *
 * **NULLS LAST.** Postgres defaults to NULLS LAST for ASC but NULLS FIRST for
 * DESC, so reversing the direction moves every null row from the bottom to the
 * top. For a nullable column — `artists.formed_year`, `record_stores.city` —
 * that means "sort by year, descending" leads with every artist whose year is
 * unknown, which is never what the user meant. Made explicit in both directions
 * so the behavior does not depend on which one is asked for.
 */
export function orderFor(
  column: Column,
  direction: SortDirection,
  tiebreaker: Column,
): SQL[] {
  const ordered = direction === 'desc' ? desc(column) : asc(column);

  return [sql`${ordered} NULLS LAST`, asc(tiebreaker)];
}
