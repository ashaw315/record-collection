/**
 * SPEC.md §10/A66: `/stats`' genre series is a TREE OF PAIRS, not a chart.
 *
 * Each genre carries two numbers — how many records are filed under it
 * directly, and how many are in its subtree — and the pair is what keeps three
 * states apart that one number collapses:
 *
 *   `Jazz 3 · 4`         a parent holding less than its branch
 *   `Rock 10 · 10`       a parent whose branch adds nothing to its own total
 *   `Black Metal 0 · 0`  a genre holding nothing anywhere
 *
 * **A bar cannot be honest about two numbers**, which is why the chart is
 * retired for this series rather than restyled: a bar is one length.
 *
 * Pure, because the decisions are here — which genres appear, what each row's
 * numbers are, and when a second number would describe a set that does not
 * exist. A component test would confirm whatever the component produced.
 */

export type GenreCount = {
  id: string;
  name: string;
  parentGenreId: string | null;
  /** Records filed under this genre itself. */
  direct: number;
};

export type GenrePairNode = {
  id: string;
  name: string;
  /** Records filed under this genre itself. */
  direct: number;
  /** Distinct records under this genre or anything beneath it. */
  subtree: number;
  /**
   * Whether the row renders a SECOND number.
   *
   * **The absence of the second figure IS the distinction**, so a childless row
   * is not marked in any other way. `Rock 10 · 10`'s second number is a
   * receipt — the branch was walked and added nothing — while `Dub 1` has no
   * branch, so a second number would describe a set that does not exist.
   */
  hasBranch: boolean;
  children: GenrePairNode[];
  depth: number;
};

/**
 * Records reachable from each genre, as sets rather than counts.
 *
 * **Sets, because subtree counts must DEDUPLICATE.** A record tagged both `Oi!`
 * and `UK82` reaches `Punk` by two paths and is still one record; summing
 * children's counts would report it twice. That is §7.1's rule arriving as
 * arithmetic, and it is the reason this is not a fold over `direct`.
 */
function reachableRecords(
  rows: GenreCount[],
  recordIdsByGenre: Map<string, ReadonlySet<string>>,
): Map<string, Set<string>> {
  const childrenOf = new Map<string, string[]>();
  for (const row of rows) {
    if (row.parentGenreId === null) continue;
    childrenOf.set(row.parentGenreId, [...(childrenOf.get(row.parentGenreId) ?? []), row.id]);
  }

  const resolved = new Map<string, Set<string>>();

  /**
   * **Cycle-guarded, and the guard is not decorative.** `parent_genre_id` has
   * no cycle constraint — no CHECK can express one, since a CHECK cannot
   * traverse rows — so the only thing keeping a loop out of the table is
   * `wouldCreateCycle` on `PATCH /api/genres/:id`. If that is ever bypassed, an
   * unguarded walk here does not return a wrong number, it does not return.
   *
   * The same reasoning as `genreSubtree`'s `UNION`, which this mirrors in JS.
   */
  const walk = (id: string, seen: Set<string>): Set<string> => {
    const cached = resolved.get(id);
    if (cached !== undefined) return cached;
    if (seen.has(id)) return new Set();

    const next = new Set(seen).add(id);
    const records = new Set(recordIdsByGenre.get(id) ?? []);
    for (const child of childrenOf.get(id) ?? []) {
      for (const recordId of walk(child, next)) records.add(recordId);
    }

    /*
      Only cached once resolved on a path that did not revisit — a value
      computed while a cycle truncated it is not the genre's real subtree, and
      caching it would make the answer depend on which row was walked first.
    */
    if (seen.size === 0) resolved.set(id, records);
    return records;
  };

  for (const row of rows) resolved.set(row.id, walk(row.id, new Set()));
  return resolved;
}

/**
 * The genre tree, every genre in it, each row carrying its pair.
 *
 * **Every genre appears, including those holding nothing anywhere.** `/stats`
 * is an account of the collection and its failure mode is hiding its own gaps:
 * a genre created and never filled is exactly such a gap, so suppressing it
 * would be the screen committing the defect it was designed against. The filter
 * row on `/collection` withholds them for a different reason — a chip is an
 * offer to act, and an unselectable chip is a broken offer — which does not
 * travel to an account.
 *
 * **Eight zeros among seventeen rows is not wallpaper.** Wallpaper is a mark
 * whose value never varies; here the value IS the information. The device that
 * makes it payable already exists and came from another screen — §7a's *a zero
 * keeps display and takes muted* — so the empty rows recede without being
 * hidden, which is the whole difference between receding and being withheld.
 */
export function genrePairs(
  rows: GenreCount[],
  recordIdsByGenre: Map<string, ReadonlySet<string>>,
): GenrePairNode[] {
  const reachable = reachableRecords(rows, recordIdsByGenre);

  const byId = new Map<string, GenrePairNode>();
  for (const row of rows) {
    byId.set(row.id, {
      id: row.id,
      name: row.name,
      direct: row.direct,
      subtree: reachable.get(row.id)?.size ?? 0,
      hasBranch: false,
      children: [],
      depth: 0,
    });
  }

  const roots: GenrePairNode[] = [];
  for (const row of rows) {
    const node = byId.get(row.id);
    if (node === undefined) continue;

    const parent = row.parentGenreId === null ? undefined : byId.get(row.parentGenreId);
    /*
      An unknown parent makes the node a root rather than dropping it, matching
      `buildTree` in /manage: showing a genre at the wrong depth is recoverable,
      losing it from an account of the collection is not.
    */
    if (parent === undefined || parent.id === node.id) roots.push(node);
    else parent.children.push(node);
  }

  const shape = (nodes: GenrePairNode[], depth: number, seen: ReadonlySet<string>): GenrePairNode[] =>
    nodes
      .filter((node) => !seen.has(node.id))
      .map((node) => {
        const next = new Set(seen).add(node.id);
        return {
          ...node,
          depth,
          hasBranch: node.children.length > 0,
          children: shape(node.children, depth + 1, next),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

  return shape(roots, 0, new Set());
}

/** Depth-first flattening, for rendering the tree as a list of rows. */
export function flattenPairs(nodes: GenrePairNode[]): GenrePairNode[] {
  return nodes.flatMap((node) => [node, ...flattenPairs(node.children)]);
}
