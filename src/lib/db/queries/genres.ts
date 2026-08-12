import 'server-only';
import { and, count, eq, ne, sql } from 'drizzle-orm';
import { isForeignKeyViolation } from '@/lib/api/errors';
import { countReferences } from './referrers';
import { orderFor } from '@/lib/db/order';
import { getDb } from '@/db/client';
import { genres } from '@/db/schema';
import { meaningful } from '@/lib/discogs/fields';
import type { Offset, SortDirection } from '@/lib/api/query-params';
import type { DeleteOutcome } from './tags';

/**
 * The query layer for `genres` (CLAUDE.md §6).
 *
 * Two things distinguish this resource: a self-referencing parent whose cycles
 * are prevented only at the application layer (§4.1), and the nested `tree`
 * representation (§5.4).
 */

export const GENRE_SORT_FIELDS = ['name', 'createdAt'] as const;
export type GenreSortField = (typeof GENRE_SORT_FIELDS)[number];

export type Genre = {
  id: string;
  name: string;
  parentGenreId: string | null;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type GenreNode = Genre & { children: GenreNode[] };

const columns = {
  id: genres.id,
  name: genres.name,
  parentGenreId: genres.parentGenreId,
  description: genres.description,
  createdAt: genres.createdAt,
  updatedAt: genres.updatedAt,
};

const sortColumns = { name: genres.name, createdAt: genres.createdAt } as const;

export async function listGenres(options: {
  limit: number;
  offset: Offset;
  sort?: { field: GenreSortField; direction: SortDirection };
}): Promise<{ rows: Genre[]; total: number }> {
  const db = getDb();

  const sortColumn = options.sort === undefined ? genres.name : sortColumns[options.sort.field];
  const direction = options.sort?.direction ?? 'asc';

  const rows = await db
    .select(columns)
    .from(genres)
    .orderBy(...orderFor(sortColumn, direction, genres.id))
    .limit(options.limit)
    .offset(options.offset);

  const [totals] = await db.select({ value: count() }).from(genres);

  return { rows, total: totals?.value ?? 0 };
}

/**
 * The whole hierarchy, nested (§5.4 `?tree=true`).
 *
 * Deliberately unpaginated: a page boundary would cut subtrees arbitrarily and
 * return children whose parents are on another page, which is not a hierarchy.
 * The nesting is assembled in one pass over a single flat query rather than
 * with a recursive CTE — the whole table is needed either way, and this keeps
 * the ordering rules identical to the flat endpoint.
 */
export async function listGenreTree(): Promise<{ nodes: GenreNode[]; total: number }> {
  const db = getDb();

  const rows = await db.select(columns).from(genres).orderBy(genres.name, genres.id);

  const byId = new Map<string, GenreNode>();
  for (const row of rows) byId.set(row.id, { ...row, children: [] });

  const roots: GenreNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parentGenreId === null ? undefined : byId.get(node.parentGenreId);
    // A node whose parent is missing is treated as a root rather than dropped:
    // losing a genre silently is worse than showing it at the wrong depth, and
    // the FK makes a dangling parent impossible in practice.
    if (parent === undefined) roots.push(node);
    else parent.children.push(node);
  }

  return { nodes: roots, total: rows.length };
}

export async function findGenreById(id: string): Promise<Genre | undefined> {
  const db = getDb();
  const [row] = await db.select(columns).from(genres).where(eq(genres.id, id)).limit(1);
  return row;
}

export async function findGenreByName(name: string): Promise<Genre | undefined> {
  const db = getDb();
  const [row] = await db.select(columns).from(genres).where(eq(genres.name, name)).limit(1);
  return row;
}

export async function genreExists(id: string): Promise<boolean> {
  return (await findGenreById(id)) !== undefined;
}

/**
 * Whether `candidateParentId` is `id` itself or any of its descendants — i.e.
 * whether making it the parent would create a cycle (§4.1: "a genre may not be
 * its own ancestor").
 *
 * This is the ONLY protection. Verified against the database: `UPDATE genres
 * SET parent_genre_id = id` succeeds, and so does a two-node cycle. A cycle
 * would make §7.1's recursive ancestor CTE loop and would drop every genre in
 * the cycle from the tree endpoint.
 *
 * Walks DOWN from `id` rather than up from the candidate, because the question
 * is "is the candidate inside my subtree". `UNION` (not `UNION ALL`) bounds the
 * walk: if the data already contains a cycle, the duplicate-elimination stops
 * it rather than looping forever.
 */
export async function wouldCreateCycle(id: string, candidateParentId: string): Promise<boolean> {
  if (id === candidateParentId) return true;

  const db = getDb();
  const result = await db.execute<{ found: boolean }>(sql`
    WITH RECURSIVE descendants AS (
      SELECT ${genres.id} AS id FROM ${genres} WHERE ${genres.id} = ${id}
      UNION
      SELECT g.id FROM ${genres} g JOIN descendants d ON g.parent_genre_id = d.id
    )
    SELECT EXISTS (SELECT 1 FROM descendants WHERE id = ${candidateParentId}) AS found
  `);

  return result.rows[0]?.found === true;
}

export type GenreInput = {
  name: string;
  parentGenreId?: string | null;
  description?: string | null;
};

export async function createGenre(input: GenreInput): Promise<Genre> {
  const db = getDb();
  const [row] = await db.insert(genres).values(input).returning(columns);
  return row;
}

export async function updateGenre(
  id: string,
  input: Partial<GenreInput>,
): Promise<Genre | undefined> {
  const db = getDb();
  const [row] = await db.update(genres).set(input).where(eq(genres.id, id)).returning(columns);
  return row;
}

export async function genreNameTakenByOther(id: string, name: string): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ value: count() })
    .from(genres)
    .where(and(eq(genres.name, name), ne(genres.id, id)));
  return (row?.value ?? 0) > 0;
}

/**
 * SPEC.md §7.4. Four blocking referrers, verified from pg_constraint —
 * record_genres, want_list_genres, artist_genres, and genres.parent_genre_id
 * itself. The self-reference is the one most easily forgotten: deleting a
 * parent that still has children is refused like any other in-use row.
 */
export async function countGenreReferences(id: string): Promise<number> {
  return countReferences('genres', id);
}

export async function deleteGenre(id: string): Promise<DeleteOutcome> {
  const db = getDb();

  try {
    const deleted = await db.delete(genres).where(eq(genres.id, id)).returning({ id: genres.id });
    return deleted.length > 0 ? { status: 'deleted' } : { status: 'not-found' };
  } catch (error) {
    if (!isForeignKeyViolation(error)) throw error;
    return { status: 'in-use', referenceCount: await countReferences('genres', id) };
  }
}

/**
 * §6's find-or-create for a list of genre names, outside a transaction.
 *
 * The import has its own transaction-scoped copy (`discogs-import.ts`) because
 * its writes must be atomic with the record. This one serves the PREFILL, which
 * has no transaction to join — and both must apply the same rules, so the
 * matching is identical: case-insensitive, and absence-prose is ignored.
 *
 * **Why the prefill creates rows at all**, when it deliberately does not create
 * artists or labels: the form renders a checkbox per EXISTING genre. An
 * unmatched genre is not merely unselected, it is unselectable — so the user
 * cannot verify or correct it, which is the whole point of §5.7's two stages.
 * A genre is also cheap debris: a name in a small reference table, visible in
 * /manage and deletable, versus an artist that anchors a record's identity.
 */
export async function findOrCreateGenresByName(names: string[]): Promise<string[]> {
  const db = getDb();
  const ids: string[] = [];
  const seen = new Set<string>();

  for (const raw of names) {
    // Discogs encodes absence as prose. A genre row called "Unknown" would be
    // indistinguishable from one the user meant.
    const name = meaningful(raw);
    if (name === null) continue;

    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const [existing] = await db
      .select({ id: genres.id })
      .from(genres)
      .where(sql`lower(${genres.name}) = lower(${name})`)
      .limit(1);

    if (existing !== undefined) {
      ids.push(existing.id);
      continue;
    }

    const [created] = await db.insert(genres).values({ name }).returning({ id: genres.id });
    ids.push(created.id);
  }

  return ids;
}
