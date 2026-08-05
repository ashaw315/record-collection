import 'server-only';
import { and, count, eq, ne } from 'drizzle-orm';
import { isForeignKeyViolation } from '@/lib/api/errors';
import { countReferences } from './referrers';
import { orderFor } from '@/lib/db/order';
import { getDb } from '@/db/client';
import { tags } from '@/db/schema';
import type { Offset, SortDirection } from '@/lib/api/query-params';

/**
 * The query layer for `tags` (CLAUDE.md §6: no inline database access in route
 * handlers). Handlers translate these results into the SPEC.md §5 wire shapes;
 * everything that touches the database lives here.
 */

export const TAG_SORT_FIELDS = ['name', 'createdAt'] as const;
export type TagSortField = (typeof TAG_SORT_FIELDS)[number];

export type Tag = {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
};

const columns = {
  id: tags.id,
  name: tags.name,
  createdAt: tags.createdAt,
  updatedAt: tags.updatedAt,
};

// Maps the allowlisted sort field to a column object. Indexing a record of
// known keys keeps the untrusted string out of the query builder entirely.
const sortColumns = { name: tags.name, createdAt: tags.createdAt } as const;

/**
 * `offset` is an Offset, not a number: the brand can only be minted by
 * parseListParams, so an unvalidated value cannot reach the query by
 * construction. This is what previously let `5e+21` through to Postgres.
 */
export async function listTags(options: {
  limit: number;
  offset: Offset;
  sort?: { field: TagSortField; direction: SortDirection };
}): Promise<{ rows: Tag[]; total: number }> {
  const db = getDb();

  // orderFor supplies the id tiebreaker and an explicit NULLS LAST. Neither is
  // decoration: without the tiebreaker, tags sharing a createdAt are shown
  // twice or dropped while paging (verified with 60 tied rows), and Postgres
  // flips its null placement between ASC and DESC. tags has no nullable column
  // today, so the NULLS LAST half is exercised by test/integration/order.test.ts
  // against artists.formed_year rather than here.
  const sortColumn = options.sort === undefined ? tags.name : sortColumns[options.sort.field];
  const direction = options.sort?.direction ?? 'asc';

  const rows = await db
    .select(columns)
    .from(tags)
    .orderBy(...orderFor(sortColumn, direction, tags.id))
    .limit(options.limit)
    .offset(options.offset);

  const [totals] = await db.select({ value: count() }).from(tags);

  return { rows, total: totals?.value ?? 0 };
}

export async function findTagById(id: string): Promise<Tag | undefined> {
  const db = getDb();
  const [row] = await db.select(columns).from(tags).where(eq(tags.id, id)).limit(1);
  return row;
}

export async function findTagByName(name: string): Promise<Tag | undefined> {
  const db = getDb();
  const [row] = await db.select(columns).from(tags).where(eq(tags.name, name)).limit(1);
  return row;
}

export async function createTag(name: string): Promise<Tag> {
  const db = getDb();
  const [row] = await db.insert(tags).values({ name }).returning(columns);
  return row;
}

export async function updateTag(id: string, name: string): Promise<Tag | undefined> {
  const db = getDb();
  const [row] = await db.update(tags).set({ name }).where(eq(tags.id, id)).returning(columns);
  return row;
}

/** Whether another tag already holds this name — the rename collision case. */
export async function nameTakenByOther(id: string, name: string): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ value: count() })
    .from(tags)
    .where(and(eq(tags.name, name), ne(tags.id, id)));
  return (row?.value ?? 0) > 0;
}

/**
 * SPEC.md §7.4: how many rows reference this tag.
 *
 * Delegates to the shared referrer table so the set of blocking foreign keys is
 * declared in one place and diffed against pg_constraint by a test. Tags have
 * exactly one today; artists will have five, and the count must enumerate all
 * of them or the 409 reports a number that is simply wrong.
 *
 * This count is advisory, not the guarantee. `record_tags.tag_id` is NO ACTION
 * (§4.3, verified against pg_constraint), so the database refuses the delete
 * regardless — the count exists to produce a helpful 409 before attempting it,
 * and deleteTag translates the foreign-key violation for the case where a
 * reference appears after this runs.
 */
export async function countTagReferences(id: string): Promise<number> {
  return countReferences('tags', id);
}

export type DeleteOutcome =
  | { status: 'deleted' }
  | { status: 'not-found' }
  | { status: 'in-use'; referenceCount: number };

/**
 * Deletes a tag, reporting the in-use case rather than throwing it.
 *
 * The counting done by the caller is not atomic with this delete: a concurrent
 * insert into record_tags between the two lands here as a 23503 foreign-key
 * violation. Translating it — rather than letting it escape — is what makes the
 * 409 correct rather than racy, since that violation IS SPEC.md §7.4's in-use
 * condition, just observed from the database instead of from a pre-check.
 *
 * The count is re-read after the violation so the 409 reports what is actually
 * referencing the row now, not the stale zero the pre-check saw.
 */
export async function deleteTag(id: string): Promise<DeleteOutcome> {
  const db = getDb();

  try {
    const deleted = await db.delete(tags).where(eq(tags.id, id)).returning({ id: tags.id });
    return deleted.length > 0 ? { status: 'deleted' } : { status: 'not-found' };
  } catch (error) {
    if (!isForeignKeyViolation(error)) throw error;
    return { status: 'in-use', referenceCount: await countReferences('tags', id) };
  }
}

