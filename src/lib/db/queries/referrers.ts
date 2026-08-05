import 'server-only';
import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';

/**
 * Which tables hold a blocking foreign key onto each reference table
 * (SPEC.md §7.4: a delete of an in-use reference row is refused with 409 and an
 * accurate referenceCount).
 *
 * Declared rather than derived at request time, because the count must be one
 * query, not a catalogue lookup per delete. The risk that creates — a referrer
 * added to the schema but not here, silently under-reporting — is closed by
 * test/integration/referrers.test.ts, which diffs this list against
 * pg_constraint and fails if they disagree. Adding a referrer is therefore a
 * VISIBLE edit: the schema change breaks that test until it is declared here.
 *
 * Only NO ACTION / RESTRICT keys belong here. A CASCADE referrer removes itself
 * when the parent is deleted, so counting it would refuse a delete the database
 * would happily perform — for tags, `record_tags.record_id` cascades toward the
 * owning record and is correctly absent, while `record_tags.tag_id` is NO
 * ACTION and is what blocks (SPEC.md §4.3, verified against pg_constraint).
 */

export type Referrer = {
  /** Child table holding the foreign key. */
  table: string;
  /** Column on that child table pointing at the reference row. */
  column: string;
};

export const REFERRERS = {
  tags: [{ table: 'record_tags', column: 'tag_id' }],
  // TWO, not five: artist_genres and BOTH artist_influences FKs cascade, and a
  // cascading referrer must not be declared — counting it would refuse a delete
  // the database would happily perform. Verified from pg_constraint.
  artists: [
    { table: 'records', column: 'artist_id' },
    { table: 'want_list', column: 'artist_id' },
  ],
  labels: [
    { table: 'records', column: 'label_id' },
    { table: 'want_list', column: 'label_id' },
  ],
  record_stores: [{ table: 'records', column: 'store_id' }],
  // Four, including the SELF-reference: deleting a parent that still has child
  // genres is refused like any other in-use row. Verified from pg_constraint.
  genres: [
    { table: 'record_genres', column: 'genre_id' },
    { table: 'want_list_genres', column: 'genre_id' },
    { table: 'artist_genres', column: 'genre_id' },
    { table: 'genres', column: 'parent_genre_id' },
  ],
  formats: [{ table: 'records', column: 'format_id' }],
} as const satisfies Record<string, readonly Referrer[]>;

export type ReferenceTable = keyof typeof REFERRERS;

/**
 * Total rows referencing `id` across every declared referrer.
 *
 * Table and column names come from REFERRERS, a module constant — never from
 * request input — so the identifier interpolation below cannot carry anything
 * user-supplied. They are still quoted via sql.identifier rather than
 * concatenated, so a future referrer whose name needs quoting does not silently
 * produce broken SQL.
 */
export async function countReferences(table: ReferenceTable, id: string): Promise<number> {
  const referrers = REFERRERS[table] as readonly Referrer[];
  if (referrers.length === 0) return 0;

  const db = getDb();

  const counts = referrers.map(
    (referrer) =>
      sql`SELECT count(*)::int AS n FROM ${sql.identifier(referrer.table)} WHERE ${sql.identifier(referrer.column)} = ${id}`,
  );

  // One round trip regardless of how many referrers a table gains. For artists
  // this will be five.
  const unioned = sql.join(counts, sql` UNION ALL `);
  const result = await db.execute<{ n: number }>(
    sql`SELECT COALESCE(sum(n), 0)::int AS n FROM (${unioned}) AS counts`,
  );

  return result.rows[0]?.n ?? 0;
}
