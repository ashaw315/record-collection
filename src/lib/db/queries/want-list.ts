import 'server-only';
import { and, asc, eq, exists, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { artists, genres, labels, wantList, wantListGenres } from '@/db/schema';

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
