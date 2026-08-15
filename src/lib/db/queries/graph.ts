import 'server-only';
import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
// §7.1's hierarchy, shared with the collection list and the want list.
import { genreSubtree } from './genre-hierarchy';

/**
 * The network graph (SPEC.md §8.1), scoped to OWNED records (§5.6).
 *
 * **People are edges, not nodes.** A lineup walk creates a row per session
 * player, side project and tribute act — 71 artists against Adam's collection,
 * of which 4 have records. Emitting the other 67 as nodes produces a hairball
 * around the four that matter, and since node radius scales with `ownedCount`
 * they would render at radius zero: invisible dots still occupying
 * force-simulation space. A person who links two groups is collapsed into a
 * `shared_member` edge between them instead.
 *
 * **Sparseness is reported, not disguised.** Every edge here comes from a row
 * that exists. Four unrelated artists produce four nodes and no links, and that
 * is the correct answer rather than a layout failure.
 */

export type GraphNode = {
  /** Prefixed so artist and genre ids cannot collide in one namespace. */
  id: string;
  type: 'artist' | 'genre';
  label: string;
  ownedCount: number;
  priorityTier: number | null;
  parentGenreId: string | null;
};

export type GraphLinkType =
  | 'influence'
  | 'member_of'
  | 'genre_parent'
  | 'shared_member'
  | 'has_genre';

export type GraphLink = {
  source: string;
  target: string;
  type: GraphLinkType;
  weight: number;
};

export type Graph = { nodes: GraphNode[]; links: GraphLink[] };

const artistNodeId = (id: string) => `artist:${id}`;
const genreNodeId = (id: string) => `genre:${id}`;

type ArtistRow = { id: string; name: string; ownedCount: number; priorityTier: number | null };
type GenreRow = { id: string; name: string; parentGenreId: string | null; ownedCount: number };
type EdgeRow = { source: string; target: string; weight: number };

export async function buildGraph(options: { genreId?: string }): Promise<Graph> {
  const db = getDb();
  const genreId = options.genreId ?? null;

  /**
   * The set every other query is filtered against: artists with at least one
   * owned record, narrowed by `genreId` when given. Defined once here because
   * an edge whose endpoint is missing from this set must be dropped rather than
   * left dangling — a link to a node that was never emitted renders as a broken
   * edge into empty space.
   */
  /**
   * **The filter walks §7.1's subtree, not a flat equality.** A record tagged
   * only UK82 IS a Punk record for filtering "and graph purposes" — the spec
   * binds both with one sentence. This shipped as `rg.genre_id = $1`, so
   * filtering by Punk returned an entirely EMPTY graph while `/?genreId=<Punk>`
   * returned the records: the same question answered two ways by two screens.
   *
   * Shared with the collection list and the want list rather than reimplemented
   * (see ./genre-hierarchy) — three copies is how this happened.
   */
  /**
   * Composed rather than made branchless with a `$1 IS NULL OR ...` guard: the
   * subtree walk only makes sense when there IS a genre, and an unfiltered
   * graph should not carry a recursive CTE the planner has to reason about.
   */
  const inSubtree = (recordAlias: string) =>
    genreId === null
      ? sql`TRUE`
      : sql`EXISTS (
          SELECT 1 FROM record_genres rg
          WHERE rg.record_id = ${sql.raw(recordAlias)}.id
            AND rg.genre_id IN (SELECT id FROM ${genreSubtree(genreId)})
        )`;

  const collectedArtists = sql`
    SELECT r.artist_id AS id, COUNT(*)::int AS owned_count
    FROM records r
    WHERE r.artist_id IS NOT NULL
      AND ${inSubtree('r')}
    GROUP BY r.artist_id
  `;

  const artistRows = await db.execute<ArtistRow>(sql`
    WITH collected AS (${collectedArtists})
    SELECT
      a.id,
      a.name,
      c.owned_count AS "ownedCount",
      (
        SELECT MIN(w.priority)::int FROM want_list w WHERE w.artist_id = a.id
      ) AS "priorityTier"
    FROM collected c
    JOIN artists a ON a.id = c.id
    ORDER BY a.name, a.id
  `);

  /**
   * A genre is sized by the records DIRECTLY tagged with it — deliberately
   * NOT the §7.1 filtering rule, which rolls children up so that filtering by
   * Punk returns UK82 records. That question is "show me punk"; a node's size
   * answers "how many records are tagged Punk". Rolling up would make every
   * parent larger than all its children by construction, which is structure the
   * data does not have.
   */
  /**
   * Genres carrying owned records, PLUS every ancestor of those genres.
   *
   * **An ancestor may legitimately have `ownedCount: 0`, and that is not the
   * people-are-edges rule contradicting itself.** The two rules look opposed —
   * one omits zero-count artists, this one emits zero-count genres — and the
   * difference is what the node is FOR. A session player at count zero is a
   * dot nobody would ever click, so it is collapsed into an edge. Punk at count
   * zero is a genre the user navigates by, and it is what UK82 and US Hardcore
   * are children of: omitting it broke the `genre_parent` hierarchy §8.1 claims
   * to draw and split two scenes of one family into different colours.
   *
   * The count stays honest either way: zero means no record is tagged Punk
   * DIRECTLY, which is true, and §7.1's rollup deliberately does not apply here
   * (see the ownedCount note below).
   */
  const genreRows = await db.execute<GenreRow>(sql`
    WITH RECURSIVE owned_genres AS (
      -- Every genre carried by a record that survives the filter. The filter is
      -- §7.1's subtree, so a record tagged only UK82 is inside a Punk subset and
      -- brings its genres with it.
      SELECT DISTINCT rg.genre_id AS id
      FROM record_genres rg
      JOIN records r ON r.id = rg.record_id
      WHERE ${inSubtree('r')}
    ),
    with_ancestors AS (
      SELECT id FROM owned_genres
      UNION
      -- Walks up one level per iteration. UNION (not UNION ALL) dedupes, which
      -- also stops a cycle in parent_genre_id from recursing forever.
      SELECT g.parent_genre_id AS id
      FROM genres g
      JOIN with_ancestors wa ON wa.id = g.id
      WHERE g.parent_genre_id IS NOT NULL
    )
    SELECT
      g.id,
      g.name,
      g.parent_genre_id AS "parentGenreId",
      (
        SELECT COUNT(*)::int
        FROM record_genres rg
        JOIN records r ON r.id = rg.record_id
        WHERE rg.genre_id = g.id
      ) AS "ownedCount"
    FROM with_ancestors wa
    JOIN genres g ON g.id = wa.id
    ORDER BY g.name, g.id
  `);

  /**
   * Two groups joined by the people they have in common (§8.1's weight).
   *
   * `COUNT(DISTINCT person)`, because §4.3 identifies a membership by
   * (person, group, instrument) — one player holding both keyboards and guitar
   * in a band is two rows and one person. `m1.group < m2.group` yields ONE
   * undirected edge per pair with a stable orientation, so the same collection
   * always produces the same payload.
   */
  const sharedRows = await db.execute<EdgeRow>(sql`
    WITH collected AS (${collectedArtists})
    SELECT
      m1.group_artist_id::text AS source,
      m2.group_artist_id::text AS target,
      COUNT(DISTINCT m1.person_artist_id)::int AS weight
    FROM artist_memberships m1
    JOIN artist_memberships m2
      ON m1.person_artist_id = m2.person_artist_id
     AND m1.group_artist_id < m2.group_artist_id
    WHERE m1.group_artist_id IN (SELECT id FROM collected)
      AND m2.group_artist_id IN (SELECT id FROM collected)
    GROUP BY m1.group_artist_id, m2.group_artist_id
    ORDER BY source, target
  `);

  /**
   * §8.1's narrowing: person-to-group only where the person is themselves an
   * artist in the collection. A sideman with no records of his own is not a
   * node, so no `member_of` is emitted for him — he reaches the graph solely as
   * a `shared_member` edge above.
   */
  const memberRows = await db.execute<EdgeRow>(sql`
    WITH collected AS (${collectedArtists})
    SELECT DISTINCT
      m.person_artist_id::text AS source,
      m.group_artist_id::text AS target,
      p.owned_count AS weight
    FROM artist_memberships m
    JOIN collected p ON p.id = m.person_artist_id
    WHERE m.group_artist_id IN (SELECT id FROM collected)
    ORDER BY source, target
  `);

  /**
   * §8.1's `has_genre`: an artist to each genre their OWNED records carry,
   * weighted by how many of those records are in it.
   *
   * Without this the genre nodes were orphans — drawn, connected to nothing,
   * and doing none of the clustering §8.1 claims emerges from "shared genres".
   * Found by rendering the graph and looking at it, not by a failing test.
   *
   * Sourced from `record_genres` only. `want_list_genres` is a separate table
   * and including it would leak the want list into a collection graph that
   * §5.6 scopes to owned records.
   */
  const hasGenreRows = await db.execute<EdgeRow>(sql`
    WITH collected AS (${collectedArtists})
    SELECT
      r.artist_id::text AS source,
      rg.genre_id::text AS target,
      COUNT(DISTINCT r.id)::int AS weight
    FROM records r
    JOIN collected c ON c.id = r.artist_id
    JOIN record_genres rg ON rg.record_id = r.id
    GROUP BY r.artist_id, rg.genre_id
    ORDER BY source, target
  `);

  const influenceRows = await db.execute<EdgeRow>(sql`
    WITH collected AS (${collectedArtists})
    SELECT
      i.source_artist_id::text AS source,
      i.target_artist_id::text AS target,
      i.strength::int AS weight
    FROM artist_influences i
    WHERE i.source_artist_id IN (SELECT id FROM collected)
      AND i.target_artist_id IN (SELECT id FROM collected)
    ORDER BY source, target
  `);

  const nodes: GraphNode[] = [
    ...artistRows.rows.map((row) => ({
      id: artistNodeId(row.id),
      type: 'artist' as const,
      label: row.name,
      ownedCount: row.ownedCount,
      priorityTier: row.priorityTier,
      parentGenreId: null,
    })),
    ...genreRows.rows.map((row) => ({
      id: genreNodeId(row.id),
      type: 'genre' as const,
      label: row.name,
      ownedCount: row.ownedCount,
      priorityTier: null,
      parentGenreId: row.parentGenreId,
    })),
  ];

  /** Only between two genres that both survived the filter above. */
  const genreIds = new Set(genreRows.rows.map((row) => row.id));
  const genreParentLinks: GraphLink[] = genreRows.rows
    .filter((row) => row.parentGenreId !== null && genreIds.has(row.parentGenreId))
    .map((row) => ({
      source: genreNodeId(row.id),
      target: genreNodeId(row.parentGenreId as string),
      type: 'genre_parent' as const,
      weight: 1,
    }));

  const links: GraphLink[] = [
    ...influenceRows.rows.map((row) => ({
      source: artistNodeId(row.source),
      target: artistNodeId(row.target),
      type: 'influence' as const,
      weight: row.weight,
    })),
    ...memberRows.rows.map((row) => ({
      source: artistNodeId(row.source),
      target: artistNodeId(row.target),
      type: 'member_of' as const,
      weight: row.weight,
    })),
    ...sharedRows.rows.map((row) => ({
      source: artistNodeId(row.source),
      target: artistNodeId(row.target),
      type: 'shared_member' as const,
      weight: row.weight,
    })),
    /**
     * Filtered against the genre nodes actually emitted: a `genreId` subset
     * narrows the genre rows, and an edge to a node that was never emitted is a
     * link into empty space.
     */
    ...hasGenreRows.rows
      .filter((row) => genreIds.has(row.target))
      .map((row) => ({
        source: artistNodeId(row.source),
        target: genreNodeId(row.target),
        type: 'has_genre' as const,
        weight: row.weight,
      })),
    ...genreParentLinks,
  ];

  return { nodes, links };
}
