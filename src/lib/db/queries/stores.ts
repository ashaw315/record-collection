import 'server-only';
import { count, eq } from 'drizzle-orm';
import { isForeignKeyViolation } from '@/lib/api/errors';
import { countReferences } from './referrers';
import { orderFor } from '@/lib/db/order';
import { getDb } from '@/db/client';
import { recordStores } from '@/db/schema';
import type { Offset, SortDirection } from '@/lib/api/query-params';
import type { DeleteOutcome } from './tags';

/**
 * The query layer for `record_stores` (CLAUDE.md §6).
 *
 * Differs from tags and labels in a way that matters: SPEC.md §4.1 gives
 * `name` NO unique constraint, and that is deliberate — two shops can share a
 * name in different cities. So there is no duplicate-name check, no rename
 * collision, and no concurrent-create race on the name. Adding one would invent
 * a constraint the spec does not have and would reject legitimate data.
 *
 * `city` is nullable and sortable, which makes this the first resource where
 * orderFor's NULLS LAST clause is reachable (§5 sort, acceptance criterion 6).
 */

export const STORE_SORT_FIELDS = ['name', 'city', 'createdAt'] as const;
export type StoreSortField = (typeof STORE_SORT_FIELDS)[number];

export type Store = {
  id: string;
  name: string;
  city: string | null;
  stateRegion: string | null;
  country: string | null;
  address: string | null;
  website: string | null;
  notes: string | null;
  isFavorite: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const columns = {
  id: recordStores.id,
  name: recordStores.name,
  city: recordStores.city,
  stateRegion: recordStores.stateRegion,
  country: recordStores.country,
  address: recordStores.address,
  website: recordStores.website,
  notes: recordStores.notes,
  isFavorite: recordStores.isFavorite,
  createdAt: recordStores.createdAt,
  updatedAt: recordStores.updatedAt,
};

const sortColumns = {
  name: recordStores.name,
  city: recordStores.city,
  createdAt: recordStores.createdAt,
} as const;

export async function listStores(options: {
  limit: number;
  offset: Offset;
  sort?: { field: StoreSortField; direction: SortDirection };
}): Promise<{ rows: Store[]; total: number }> {
  const db = getDb();

  const sortColumn =
    options.sort === undefined ? recordStores.name : sortColumns[options.sort.field];
  const direction = options.sort?.direction ?? 'asc';

  const rows = await db
    .select(columns)
    .from(recordStores)
    .orderBy(...orderFor(sortColumn, direction, recordStores.id))
    .limit(options.limit)
    .offset(options.offset);

  const [totals] = await db.select({ value: count() }).from(recordStores);

  return { rows, total: totals?.value ?? 0 };
}

export async function findStoreById(id: string): Promise<Store | undefined> {
  const db = getDb();
  const [row] = await db
    .select(columns)
    .from(recordStores)
    .where(eq(recordStores.id, id))
    .limit(1);
  return row;
}

export type StoreInput = {
  name: string;
  city?: string | null;
  stateRegion?: string | null;
  country?: string | null;
  address?: string | null;
  website?: string | null;
  notes?: string | null;
  isFavorite?: boolean;
};

export async function createStore(input: StoreInput): Promise<Store> {
  const db = getDb();
  const [row] = await db.insert(recordStores).values(input).returning(columns);
  return row;
}

export async function updateStore(
  id: string,
  input: Partial<StoreInput>,
): Promise<Store | undefined> {
  const db = getDb();
  const [row] = await db
    .update(recordStores)
    .set(input)
    .where(eq(recordStores.id, id))
    .returning(columns);
  return row;
}

/** SPEC.md §7.4. One blocking referrer: `records.store_id`. */
export async function countStoreReferences(id: string): Promise<number> {
  return countReferences('record_stores', id);
}

export async function deleteStore(id: string): Promise<DeleteOutcome> {
  const db = getDb();

  try {
    const deleted = await db
      .delete(recordStores)
      .where(eq(recordStores.id, id))
      .returning({ id: recordStores.id });
    return deleted.length > 0 ? { status: 'deleted' } : { status: 'not-found' };
  } catch (error) {
    if (!isForeignKeyViolation(error)) throw error;
    return { status: 'in-use', referenceCount: await countReferences('record_stores', id) };
  }
}
