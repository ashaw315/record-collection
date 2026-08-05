import 'server-only';
import { and, count, eq, ne } from 'drizzle-orm';
import { isForeignKeyViolation } from '@/lib/api/errors';
import { countReferences } from './referrers';
import { orderFor } from '@/lib/db/order';
import { getDb } from '@/db/client';
import { labels } from '@/db/schema';
import type { Offset, SortDirection } from '@/lib/api/query-params';
import type { DeleteOutcome } from './tags';

/**
 * The query layer for `labels` (CLAUDE.md §6). Same shape as tags, with two
 * nullable fields and a second uniqueness constraint: §4.1 requires
 * `discogs_label_id` to be unique when present, matching artists and pressings,
 * because all three are §5.7 find-or-create keys.
 */

export const LABEL_SORT_FIELDS = ['name', 'createdAt'] as const;
export type LabelSortField = (typeof LABEL_SORT_FIELDS)[number];

export type Label = {
  id: string;
  name: string;
  notes: string | null;
  discogsLabelId: number | null;
  createdAt: Date;
  updatedAt: Date;
};

const columns = {
  id: labels.id,
  name: labels.name,
  notes: labels.notes,
  discogsLabelId: labels.discogsLabelId,
  createdAt: labels.createdAt,
  updatedAt: labels.updatedAt,
};

// Indexing a record of known keys keeps the untrusted sort string out of the
// query builder entirely.
const sortColumns = { name: labels.name, createdAt: labels.createdAt } as const;

export async function listLabels(options: {
  limit: number;
  offset: Offset;
  sort?: { field: LabelSortField; direction: SortDirection };
}): Promise<{ rows: Label[]; total: number }> {
  const db = getDb();

  const sortColumn = options.sort === undefined ? labels.name : sortColumns[options.sort.field];
  const direction = options.sort?.direction ?? 'asc';

  const rows = await db
    .select(columns)
    .from(labels)
    .orderBy(...orderFor(sortColumn, direction, labels.id))
    .limit(options.limit)
    .offset(options.offset);

  const [totals] = await db.select({ value: count() }).from(labels);

  return { rows, total: totals?.value ?? 0 };
}

export async function findLabelById(id: string): Promise<Label | undefined> {
  const db = getDb();
  const [row] = await db.select(columns).from(labels).where(eq(labels.id, id)).limit(1);
  return row;
}

export async function findLabelByName(name: string): Promise<Label | undefined> {
  const db = getDb();
  const [row] = await db.select(columns).from(labels).where(eq(labels.name, name)).limit(1);
  return row;
}

export type LabelInput = {
  name: string;
  notes?: string | null;
  discogsLabelId?: number | null;
};

export async function createLabel(input: LabelInput): Promise<Label> {
  const db = getDb();
  const [row] = await db.insert(labels).values(input).returning(columns);
  return row;
}

export async function updateLabel(
  id: string,
  input: Partial<LabelInput>,
): Promise<Label | undefined> {
  const db = getDb();
  const [row] = await db.update(labels).set(input).where(eq(labels.id, id)).returning(columns);
  return row;
}

/** Whether another label already holds this name — the rename collision case. */
export async function labelNameTakenByOther(id: string, name: string): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ value: count() })
    .from(labels)
    .where(and(eq(labels.name, name), ne(labels.id, id)));
  return (row?.value ?? 0) > 0;
}

/**
 * SPEC.md §7.4. Delegates to the shared referrer table, which declares BOTH of
 * this table's blocking foreign keys — `records.label_id` and
 * `want_list.label_id`. Counting only one under-reports, and the 409 then
 * carries a number that is simply wrong.
 */
export async function countLabelReferences(id: string): Promise<number> {
  return countReferences('labels', id);
}

export async function deleteLabel(id: string): Promise<DeleteOutcome> {
  const db = getDb();

  try {
    const deleted = await db.delete(labels).where(eq(labels.id, id)).returning({ id: labels.id });
    return deleted.length > 0 ? { status: 'deleted' } : { status: 'not-found' };
  } catch (error) {
    // The caller's count is not atomic with this delete; a reference inserted
    // in between arrives here as 23503, which IS §7.4's in-use condition.
    if (!isForeignKeyViolation(error)) throw error;
    return { status: 'in-use', referenceCount: await countReferences('labels', id) };
  }
}
