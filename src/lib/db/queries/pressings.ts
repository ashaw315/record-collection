import 'server-only';
import { and, count, eq, isNull, ne, sql } from 'drizzle-orm';
import { isForeignKeyViolation } from '@/lib/api/errors';
import { countReferences } from './referrers';
import { orderFor } from '@/lib/db/order';
import { getDb } from '@/db/client';
import { pressings } from '@/db/schema';
import type { Offset, SortDirection } from '@/lib/api/query-params';
import type { DeleteOutcome } from './tags';

/**
 * The query layer for `pressings` (SPEC.md §4, §5.4).
 *
 * A CORE table, not reference data. Rows are SHARED: the same pressing may be
 * referenced by a `records` row and a `want_list.target_pressing_id` at once,
 * which is why creation is find-or-create and why a careless match is
 * destructive rather than merely untidy — it repoints another record's pressing.
 */

export const PRESSING_SORT_FIELDS = [
  'catalogNumber',
  'yearPressed',
  'countryPressed',
  'createdAt',
] as const;
export type PressingSortField = (typeof PRESSING_SORT_FIELDS)[number];

export type Pressing = {
  id: string;
  catalogNumber: string | null;
  matrixRunout: string | null;
  pressingPlant: string | null;
  yearPressed: number | null;
  countryPressed: string | null;
  vinylWeightGrams: number | null;
  colorVariant: string | null;
  discogsReleaseId: number | null;
  isReissue: boolean;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const columns = {
  id: pressings.id,
  catalogNumber: pressings.catalogNumber,
  matrixRunout: pressings.matrixRunout,
  pressingPlant: pressings.pressingPlant,
  yearPressed: pressings.yearPressed,
  countryPressed: pressings.countryPressed,
  vinylWeightGrams: pressings.vinylWeightGrams,
  colorVariant: pressings.colorVariant,
  discogsReleaseId: pressings.discogsReleaseId,
  isReissue: pressings.isReissue,
  notes: pressings.notes,
  createdAt: pressings.createdAt,
  updatedAt: pressings.updatedAt,
};

const sortColumns = {
  catalogNumber: pressings.catalogNumber,
  yearPressed: pressings.yearPressed,
  countryPressed: pressings.countryPressed,
  createdAt: pressings.createdAt,
} as const;

export async function listPressings(options: {
  limit: number;
  offset: Offset;
  sort?: { field: PressingSortField; direction: SortDirection };
}): Promise<{ rows: Pressing[]; total: number }> {
  const db = getDb();

  const sortColumn =
    options.sort === undefined ? pressings.catalogNumber : sortColumns[options.sort.field];
  const direction = options.sort?.direction ?? 'asc';

  const rows = await db
    .select(columns)
    .from(pressings)
    .orderBy(...orderFor(sortColumn, direction, pressings.id))
    .limit(options.limit)
    .offset(options.offset);

  const [totals] = await db.select({ value: count() }).from(pressings);

  return { rows, total: totals?.value ?? 0 };
}

export async function findPressingById(id: string): Promise<Pressing | undefined> {
  const db = getDb();
  const [row] = await db.select(columns).from(pressings).where(eq(pressings.id, id)).limit(1);
  return row;
}

/** The fields §4 designates as the fallback match key. */
export type MatchKey = {
  discogsReleaseId?: number | null;
  catalogNumber?: string | null;
  countryPressed?: string | null;
  yearPressed?: number | null;
};

/**
 * Whether a request carries enough to identify a pressing at all (§4).
 *
 * `matrixRunout` counts here but is deliberately NOT part of the match key
 * below: a white label with only an etched runout is identified rather than
 * unknown, so it must not be treated as an empty request — but runout
 * transcriptions are frequently partial, and a false merge silently rewrites
 * another record's pressing while a duplicate stays visible and fixable.
 */
export function hasIdentifyingFields(
  input: MatchKey & { matrixRunout?: string | null },
): boolean {
  return (
    input.discogsReleaseId !== null && input.discogsReleaseId !== undefined
      ? true
      : [input.catalogNumber, input.countryPressed, input.yearPressed, input.matrixRunout].some(
          (value) => value !== null && value !== undefined,
        )
  );
}

/**
 * Finds the pressing a request should reuse, or undefined to create one.
 *
 * §4: match by `discogs_release_id` if present, otherwise by the tuple
 * `(catalog_number, country_pressed, year_pressed)` — and ONLY when that key is
 * non-empty. An all-null tuple matches any other all-null row in SQL (verified),
 * so without the emptiness check two unrelated white labels silently collapse
 * into one shared row.
 */
export async function findMatchingPressing(input: MatchKey): Promise<Pressing | undefined> {
  const db = getDb();

  if (input.discogsReleaseId !== null && input.discogsReleaseId !== undefined) {
    const [row] = await db
      .select(columns)
      .from(pressings)
      .where(eq(pressings.discogsReleaseId, input.discogsReleaseId))
      .limit(1);
    return row;
  }

  const tuple = [input.catalogNumber, input.countryPressed, input.yearPressed];
  const tupleIsEmpty = tuple.every((value) => value === null || value === undefined);
  if (tupleIsEmpty) return undefined;

  // IS NOT DISTINCT FROM, not `=`: a null tuple field must match a null column,
  // which `=` never does. That is what lets a partial key — say a catalog
  // number with no country or year — find the row it belongs to.
  const [row] = await db
    .select(columns)
    .from(pressings)
    .where(
      and(
        sql`${pressings.catalogNumber} IS NOT DISTINCT FROM ${input.catalogNumber ?? null}`,
        sql`${pressings.countryPressed} IS NOT DISTINCT FROM ${input.countryPressed ?? null}`,
        sql`${pressings.yearPressed} IS NOT DISTINCT FROM ${input.yearPressed ?? null}`,
        isNull(pressings.discogsReleaseId),
      ),
    )
    .limit(1);

  return row;
}

/**
 * Looks a pressing up by Discogs id alone.
 *
 * Used by POST's unique-violation recovery, deliberately NOT via
 * findMatchingPressing: the recovery must not route back through the same
 * function whose miss caused the race, or a stale/mocked result sends a
 * recoverable conflict to the 500 path.
 */
export async function findPressingByDiscogsId(
  discogsReleaseId: number,
): Promise<Pressing | undefined> {
  const db = getDb();
  const [row] = await db
    .select(columns)
    .from(pressings)
    .where(eq(pressings.discogsReleaseId, discogsReleaseId))
    .limit(1);
  return row;
}

export type PressingInput = {
  catalogNumber?: string | null;
  matrixRunout?: string | null;
  pressingPlant?: string | null;
  yearPressed?: number | null;
  countryPressed?: string | null;
  vinylWeightGrams?: number | null;
  colorVariant?: string | null;
  discogsReleaseId?: number | null;
  isReissue?: boolean;
  notes?: string | null;
};

export async function createPressing(input: PressingInput): Promise<Pressing> {
  const db = getDb();
  const [row] = await db.insert(pressings).values(input).returning(columns);
  return row;
}

export async function updatePressing(
  id: string,
  input: Partial<PressingInput>,
): Promise<Pressing | undefined> {
  const db = getDb();
  const [row] = await db
    .update(pressings)
    .set(input)
    .where(eq(pressings.id, id))
    .returning(columns);
  return row;
}

/** Whether another pressing already holds this Discogs id. */
export async function discogsIdTakenByOther(id: string, discogsReleaseId: number): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ value: count() })
    .from(pressings)
    .where(and(eq(pressings.discogsReleaseId, discogsReleaseId), ne(pressings.id, id)));
  return (row?.value ?? 0) > 0;
}

/**
 * SPEC.md §4 / §7.4. THREE blocking referrers, verified from pg_constraint:
 * records.pressing_id, want_list.target_pressing_id, and price_history
 * .pressing_id — the last easily missed, since a pressing can be blocked by
 * price history alone with no record and no want-list row.
 */
export async function countPressingReferences(id: string): Promise<number> {
  return countReferences('pressings', id);
}

export async function deletePressing(id: string): Promise<DeleteOutcome> {
  const db = getDb();

  try {
    const deleted = await db
      .delete(pressings)
      .where(eq(pressings.id, id))
      .returning({ id: pressings.id });
    return deleted.length > 0 ? { status: 'deleted' } : { status: 'not-found' };
  } catch (error) {
    if (!isForeignKeyViolation(error)) throw error;
    return { status: 'in-use', referenceCount: await countReferences('pressings', id) };
  }
}
