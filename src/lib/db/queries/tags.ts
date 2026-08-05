import 'server-only';
import { and, asc, count, desc, eq, ne } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { recordTags, tags } from '@/db/schema';
import type { SortDirection } from '@/lib/api/query-params';

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

export async function listTags(options: {
  limit: number;
  offset: number;
  sort?: { field: TagSortField; direction: SortDirection };
}): Promise<{ rows: Tag[]; total: number }> {
  const db = getDb();

  // Ordering is always fully determined: without the id tiebreaker, two tags
  // sharing a createdAt could swap between pages and be shown twice or not at
  // all. Name is unique, but createdAt is not.
  const sortColumn = options.sort === undefined ? tags.name : sortColumns[options.sort.field];
  const direction = options.sort?.direction === 'desc' ? desc : asc;

  const rows = await db
    .select(columns)
    .from(tags)
    .orderBy(direction(sortColumn), asc(tags.id))
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
 * SPEC.md §7.4: how many rows reference this tag. `record_tags` is the only
 * referencing table for tags (§4.3).
 *
 * This count is the sole thing standing between a delete and silent data loss:
 * `record_tags.tag_id` is ON DELETE CASCADE, so Postgres would accept the
 * delete and quietly un-tag every record. The refusal cannot be delegated to a
 * foreign-key error the way it can for artists or labels.
 */
export async function countTagReferences(id: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ value: count() })
    .from(recordTags)
    .where(eq(recordTags.tagId, id));
  return row?.value ?? 0;
}

export async function deleteTag(id: string): Promise<boolean> {
  const db = getDb();
  const deleted = await db.delete(tags).where(eq(tags.id, id)).returning({ id: tags.id });
  return deleted.length > 0;
}

