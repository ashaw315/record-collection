import 'server-only';
import { and, asc, eq, exists, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  artists,
  genres,
  labels,
  pressings,
  recordGenres,
  recordTags,
  records,
  wantList,
  wantListGenres,
} from '@/db/schema';

/**
 * The query layer for `want_list` (SPEC.md §5.3).
 *
 * The rule that shapes everything here is §7.3: **acquiring never deletes the
 * row.** The want list doubles as acquisition history, so acquired items stay
 * forever and the default listing has to exclude them — otherwise the screen
 * fills with records the user already owns.
 */

export type WantListRow = typeof wantList.$inferSelect;

type Named = { id: string; name: string };

export type ListedWantListItem = WantListRow & {
  artist: Named;
  label: Named | null;
};

export type WantListFilters = {
  artistId?: string;
  genreId?: string;
  priority?: number;
  /** §5.3: absent means FALSE, not "either". */
  isAcquired?: boolean;
};

/**
 * §7.1's subtree, identical in shape to the records version.
 *
 * A want-list item tagged with a child genre is a member of every ancestor, so
 * filtering by Punk must find a UK82 item. The records endpoint shipped without
 * this and returned nothing for a parent genre; the same defect is available
 * here.
 *
 * `UNION` rather than `UNION ALL` bounds the walk if a cycle ever reaches the
 * data, matching `wouldCreateCycle` in ./genres.
 */
function genreSubtree(genreId: string) {
  return sql`(
    WITH RECURSIVE subtree AS (
      SELECT id FROM ${genres} WHERE id = ${genreId}
      UNION
      SELECT g.id FROM ${genres} g JOIN subtree s ON g.parent_genre_id = s.id
    )
    SELECT id FROM subtree
  )`;
}

function buildWhere(filters: WantListFilters) {
  const clauses = [];

  /**
   * The §5.3 default. `undefined` means "not yet acquired", NOT "either" — the
   * want list is what you are still hunting for.
   */
  clauses.push(eq(wantList.isAcquired, filters.isAcquired ?? false));

  if (filters.artistId !== undefined) clauses.push(eq(wantList.artistId, filters.artistId));
  if (filters.priority !== undefined) clauses.push(eq(wantList.priority, filters.priority));

  if (filters.genreId !== undefined) {
    // EXISTS rather than a join, so an item with three genres is not returned
    // three times.
    clauses.push(
      exists(
        sql`(SELECT 1 FROM ${wantListGenres} wg
              WHERE wg.want_list_id = ${wantList.id}
                AND wg.genre_id IN (SELECT id FROM ${genreSubtree(filters.genreId)}))`,
      ),
    );
  }

  return and(...clauses);
}

export async function listWantList(options: {
  limit: number;
  offset: number;
  filters: WantListFilters;
}): Promise<{ rows: ListedWantListItem[]; total: number }> {
  const db = getDb();
  const where = buildWhere(options.filters);

  /**
   * Ordered by priority ASCENDING, because §4.2 makes 1 the highest. Any other
   * default puts the least-wanted record at the top of the screen.
   *
   * `id` breaks the tie, as on every list endpoint: an untied sort loses rows
   * across pages.
   */
  const rows = await db
    .select({
      item: wantList,
      artistId: artists.id,
      artistName: artists.name,
      labelId: labels.id,
      labelName: labels.name,
    })
    .from(wantList)
    // LEFT even for artists, whose FK is NOT NULL: an inner join would be
    // correct today and become a silent row-dropper the day that changes.
    .leftJoin(artists, eq(artists.id, wantList.artistId))
    .leftJoin(labels, eq(labels.id, wantList.labelId))
    .where(where)
    .orderBy(asc(wantList.priority), asc(wantList.id))
    .limit(options.limit)
    .offset(options.offset);

  const [totals] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(wantList)
    .where(where);

  return {
    rows: rows.map((row) => ({
      ...row.item,
      artist: { id: row.artistId ?? row.item.artistId, name: row.artistName ?? '' },
      label: row.labelId === null ? null : { id: row.labelId, name: row.labelName ?? '' },
    })),
    total: totals?.value ?? 0,
  };
}

export type WantListValues = {
  artistId: string;
  title: string;
  labelId?: string | null;
  priority?: number;
  targetPressingId?: string | null;
  /**
   * §7.2: the highest-fidelity pressing worth hunting for. NOT a price, and
   * never to be conflated with `maxPrice` (CLAUDE.md §8).
   */
  bestDigNotes?: string | null;
  /** The user's own ceiling. Unrelated to `bestDigNotes`. */
  maxPrice?: string | null;
};

/**
 * Creates an item together with its genre links, atomically.
 *
 * NOTES item 9, re-applying to `want_list`: an item created with its genres
 * silently dropped looks successful, and the loss surfaces later as missing
 * §8 graph edges and wrong filter results.
 */
export async function createWantListItem(input: {
  values: WantListValues;
  genreIds: string[];
}): Promise<WantListRow> {
  const db = getDb();

  return db.transaction(async (tx) => {
    const [created] = await tx.insert(wantList).values(input.values).returning();

    const unique = [...new Set(input.genreIds)];
    if (unique.length > 0) {
      await tx
        .insert(wantListGenres)
        .values(unique.map((genreId) => ({ wantListId: created.id, genreId })));
    }

    return created;
  });
}

export type HydratedWantListItem = WantListRow & {
  artist: Named;
  label: Named | null;
  /**
   * §5.3 names this specifically, and §7.2 is why: it is the pressing worth
   * hunting for. An id alone cannot tell the user WHICH pressing to look for,
   * which is the entire purpose of the field.
   */
  targetPressing: typeof pressings.$inferSelect | null;
  genres: Named[];
};

export async function findWantListItemById(id: string): Promise<WantListRow | undefined> {
  const db = getDb();
  const [row] = await db.select().from(wantList).where(eq(wantList.id, id)).limit(1);
  return row;
}

/**
 * The §5.3 detail read.
 *
 * Relations are separate queries rather than one wide join, for the same reason
 * as `hydrateRecord`: joining across a junction multiplies rows, and collapsing
 * that back is easy to get wrong in a way that shows another item's genres on
 * this one.
 */
export async function hydrateWantListItem(
  id: string,
): Promise<HydratedWantListItem | undefined> {
  const db = getDb();

  const [item] = await db.select().from(wantList).where(eq(wantList.id, id)).limit(1);
  if (item === undefined) return undefined;

  const [artist] = await db
    .select({ id: artists.id, name: artists.name })
    .from(artists)
    .where(eq(artists.id, item.artistId))
    .limit(1);

  const label =
    item.labelId === null
      ? null
      : ((
          await db
            .select({ id: labels.id, name: labels.name })
            .from(labels)
            .where(eq(labels.id, item.labelId))
            .limit(1)
        )[0] ?? null);

  const targetPressing =
    item.targetPressingId === null
      ? null
      : ((
          await db
            .select()
            .from(pressings)
            .where(eq(pressings.id, item.targetPressingId))
            .limit(1)
        )[0] ?? null);

  const genreRows = await db
    .select({ id: genres.id, name: genres.name })
    .from(wantListGenres)
    .innerJoin(genres, eq(genres.id, wantListGenres.genreId))
    .where(eq(wantListGenres.wantListId, id))
    .orderBy(genres.name, genres.id);

  return { ...item, artist, label, targetPressing, genres: genreRows };
}

/**
 * The PATCH counterpart to `createWantListItem`: the scalar update and the
 * genre replacement in ONE transaction.
 *
 * Step 5's PATCH ran its writes as separate transactions and committed the
 * earlier ones behind a 500. The same shape is available here, and the same fix
 * applies — `undefined` means LEAVE ALONE, `[]` means REMOVE ALL, checked
 * independently.
 */
export async function updateWantListItem(input: {
  id: string;
  values: Partial<typeof wantList.$inferInsert>;
  genreIds?: string[];
}): Promise<void> {
  const db = getDb();

  await db.transaction(async (tx) => {
    if (Object.keys(input.values).length > 0) {
      await tx.update(wantList).set(input.values).where(eq(wantList.id, input.id));
    }

    if (input.genreIds !== undefined) {
      await tx.delete(wantListGenres).where(eq(wantListGenres.wantListId, input.id));

      const unique = [...new Set(input.genreIds)];
      if (unique.length > 0) {
        await tx
          .insert(wantListGenres)
          .values(unique.map((genreId) => ({ wantListId: input.id, genreId })));
      }
    }
  });
}

/**
 * Deletes an item.
 *
 * No 409 case, unlike the reference resources: both referrers
 * (`want_list_genres`, `price_history`) CASCADE — verified against
 * pg_constraint — so a delete always succeeds. The target pressing is NOT
 * removed: pressings are shared (§4), and deleting one could alter another
 * record.
 *
 * §7.3 forbids ACQUIRING from deleting the row; it does not forbid an explicit
 * user delete, and the acquired record survives because the FK points the other
 * way.
 */
export async function deleteWantListItem(id: string): Promise<boolean> {
  const db = getDb();

  const deleted = await db
    .delete(wantList)
    .where(eq(wantList.id, id))
    .returning({ id: wantList.id });

  return deleted.length > 0;
}

/**
 * SPEC.md §5.3's acquire, and §7.3's history invariant, in ONE transaction.
 *
 * This is the most correctness-critical operation in the app. It writes three
 * things — the record, its genre links, and the mark on the want-list row — and
 * a partial application corrupts SILENTLY:
 *
 *   - record without the mark  → the want list still shows something owned, and
 *                                the acquisition is missing from history;
 *   - mark without the record  → `acquired_record_id` points at nothing, and
 *                                §7.3's "doubles as acquisition history" is a
 *                                lie.
 *
 * Neither raises an error. Both look like success, which is why §11 requires a
 * forced mid-transaction failure test for this operation specifically.
 *
 * The mark is an UPDATE guarded on `is_acquired = false`: acquiring twice would
 * overwrite `acquired_record_id` and orphan the first record, losing an
 * acquisition that happened. Zero rows updated means the item was already
 * acquired (or vanished), and the throw takes the record with it.
 */
export async function acquireWantListItem(input: {
  wantListId: string;
  values: typeof records.$inferInsert;
  genreIds: string[];
  tagIds: string[];
}): Promise<typeof records.$inferSelect> {
  const db = getDb();

  return db.transaction(async (tx) => {
    const [record] = await tx.insert(records).values(input.values).returning();

    const uniqueGenreIds = [...new Set(input.genreIds)];
    if (uniqueGenreIds.length > 0) {
      await tx
        .insert(recordGenres)
        .values(uniqueGenreIds.map((genreId) => ({ recordId: record.id, genreId })));
    }

    /**
     * §5.3: acquire carries EVERY nested collection the create endpoint does.
     * These were validated by the route and then dropped — a silent
     * per-acquisition loss behind a 201, made to look like user error by the
     * fact that genres landed.
     */
    const uniqueTagIds = [...new Set(input.tagIds)];
    if (uniqueTagIds.length > 0) {
      await tx.insert(recordTags).values(uniqueTagIds.map((tagId) => ({ recordId: record.id, tagId })));
    }

    const marked = await tx
      .update(wantList)
      .set({ isAcquired: true, acquiredRecordId: record.id })
      .where(and(eq(wantList.id, input.wantListId), eq(wantList.isAcquired, false)))
      .returning({ id: wantList.id });

    if (marked.length === 0) {
      // Rolls the record and its links back with it. Throwing is the only way
      // to leave nothing behind — returning early would COMMIT the record.
      throw new Error('want-list item not found or already acquired');
    }

    return record;
  });
}
