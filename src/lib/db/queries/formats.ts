import 'server-only';
import { and, count, eq, ne } from 'drizzle-orm';
import { isForeignKeyViolation } from '@/lib/api/errors';
import { countReferences } from './referrers';
import { orderFor } from '@/lib/db/order';
import { getDb } from '@/db/client';
import { formats } from '@/db/schema';
import type { Offset, SortDirection } from '@/lib/api/query-params';

/**
 * The query layer for `formats` (CLAUDE.md §6).
 *
 * Unique to this resource: SPEC.md §4.1 forbids deleting a seeded row even when
 * unreferenced, because nothing re-seeds it and the delete is permanent. That
 * check reads `is_seeded` and NEVER the name — PATCH may rename a seeded row,
 * and a name-matched guard would stop protecting it silently at that moment.
 */

export const FORMAT_SORT_FIELDS = ['name', 'createdAt'] as const;
export type FormatSortField = (typeof FORMAT_SORT_FIELDS)[number];

export type Format = {
  id: string;
  name: string;
  isSeeded: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const columns = {
  id: formats.id,
  name: formats.name,
  isSeeded: formats.isSeeded,
  createdAt: formats.createdAt,
  updatedAt: formats.updatedAt,
};

const sortColumns = { name: formats.name, createdAt: formats.createdAt } as const;

export async function listFormats(options: {
  limit: number;
  offset: Offset;
  sort?: { field: FormatSortField; direction: SortDirection };
}): Promise<{ rows: Format[]; total: number }> {
  const db = getDb();

  const sortColumn = options.sort === undefined ? formats.name : sortColumns[options.sort.field];
  const direction = options.sort?.direction ?? 'asc';

  const rows = await db
    .select(columns)
    .from(formats)
    .orderBy(...orderFor(sortColumn, direction, formats.id))
    .limit(options.limit)
    .offset(options.offset);

  const [totals] = await db.select({ value: count() }).from(formats);

  return { rows, total: totals?.value ?? 0 };
}

export async function findFormatById(id: string): Promise<Format | undefined> {
  const db = getDb();
  const [row] = await db.select(columns).from(formats).where(eq(formats.id, id)).limit(1);
  return row;
}

export async function findFormatByName(name: string): Promise<Format | undefined> {
  const db = getDb();
  const [row] = await db.select(columns).from(formats).where(eq(formats.name, name)).limit(1);
  return row;
}

/**
 * Creates a user format. `is_seeded` is deliberately NOT a parameter: the only
 * rows that carry it are those set by migration 0002, and making it
 * unsettable here means no API path can mint a protected row or clear the
 * protection on an existing one.
 */
export async function createFormat(name: string): Promise<Format> {
  const db = getDb();
  const [row] = await db.insert(formats).values({ name }).returning(columns);
  return row;
}

/** Renames a format. Cannot touch `is_seeded`, by the same reasoning. */
export async function updateFormat(id: string, name: string): Promise<Format | undefined> {
  const db = getDb();
  const [row] = await db.update(formats).set({ name }).where(eq(formats.id, id)).returning(columns);
  return row;
}

export async function formatNameTakenByOther(id: string, name: string): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ value: count() })
    .from(formats)
    .where(and(eq(formats.name, name), ne(formats.id, id)));
  return (row?.value ?? 0) > 0;
}

/** SPEC.md §7.4. One blocking referrer: `records.format_id`. */
export async function countFormatReferences(id: string): Promise<number> {
  return countReferences('formats', id);
}

export type FormatDeleteOutcome =
  | { status: 'deleted' }
  | { status: 'not-found' }
  | { status: 'seeded' }
  | { status: 'in-use'; referenceCount: number };

export async function deleteFormat(id: string): Promise<FormatDeleteOutcome> {
  const db = getDb();

  const existing = await findFormatById(id);
  if (existing === undefined) return { status: 'not-found' };

  // Read from the row, not from a name list. This is the check that a rename
  // would have defeated.
  if (existing.isSeeded) return { status: 'seeded' };

  try {
    const deleted = await db.delete(formats).where(eq(formats.id, id)).returning({ id: formats.id });
    return deleted.length > 0 ? { status: 'deleted' } : { status: 'not-found' };
  } catch (error) {
    if (!isForeignKeyViolation(error)) throw error;
    return { status: 'in-use', referenceCount: await countReferences('formats', id) };
  }
}
