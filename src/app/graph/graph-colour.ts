/**
 * SPEC.md §8.1: "Colour by top-level ancestor genre."
 *
 * The §8.1 payload carries `parentGenreId` per genre node and no ancestor, so
 * the top of each chain is walked. Pure and separately tested because it is the
 * only real logic on the graph screen — the rest is layout.
 *
 * §8's genre rule is why this groups rather than flattens: UK82, US hardcore and
 * psychobilly stay distinct rows in the data (§7.1) while sharing a colour under
 * Punk, which is a visual grouping and not a claim that they are the same scene.
 */

export type GenreParent = { id: string; parentGenreId: string | null };

/**
 * Every genre id mapped to the root of its chain.
 *
 * Two termination guards, both reachable:
 *
 *   - a parent id absent from `genres` is treated as a root, because `genreId`
 *     subsets the graph and a child can outlive its parent in the payload;
 *   - a cycle stops at the node already seen. `genres.parent_genre_id` has no
 *     cycle constraint, so a→b→a is storable, and an unguarded walk would be an
 *     infinite loop inside a render — a frozen tab rather than a wrong colour.
 */
export function topLevelAncestors(genres: GenreParent[]): Map<string, string> {
  const parentOf = new Map<string, string | null>();
  for (const genre of genres) {
    parentOf.set(genre.id, genre.parentGenreId);
  }

  const ancestors = new Map<string, string>();

  for (const genre of genres) {
    const seen = new Set<string>([genre.id]);
    let current = genre.id;

    for (;;) {
      const parent = parentOf.get(current) ?? null;
      if (parent === null || !parentOf.has(parent) || seen.has(parent)) break;
      seen.add(parent);
      current = parent;
    }

    ancestors.set(genre.id, current);
  }

  return ancestors;
}

/**
 * A fixed palette, indexed by the ancestor's position in a SORTED list.
 *
 * Sorted rather than payload-ordered so a `genreId` subset does not repaint
 * every other genre: if the colour shifted when an unrelated genre was filtered
 * out, the two views would look like different data.
 *
 * Hand-picked rather than generated so the colours stay distinguishable — a hue
 * rotation at N genres produces neighbours nobody can tell apart. Beyond the
 * palette the colours repeat, which is honest: at that many top-level genres
 * colour has stopped being the thing carrying the information.
 */
const PALETTE = [
  '#e05c5c',
  '#4f9dd4',
  '#e0a13c',
  '#5cb85c',
  '#9b6bc4',
  '#3fb0a5',
  '#d4699e',
  '#8a8f4a',
] as const;

/** Artists carry no genre in the §8.1 payload and must still render. */
export const NEUTRAL_COLOUR = '#8b8b8b';

export type GenreNode = { id: string; label: string; parentGenreId: string | null };

export type ColourLink = { source: string; target: string; type: string; weight: number };

/**
 * Each artist node id mapped to its top-level ancestor genre — §8.1's
 * `artist → genre → root` walk.
 *
 * **Derived from the edges, not from a payload field.** The association already
 * exists as `has_genre` and `genre_parent`; duplicating it into a node field
 * would let the two disagree, which is the reason §8.1 gives for deriving
 * `shared_member` at query time rather than storing it.
 *
 * The genre chosen is the one carrying the most of that artist's owned records,
 * ties broken by genre NAME. Edge order must not decide it: the payload's
 * ordering is stable today, but a colour that depends on it would repaint the
 * whole graph the first time an unrelated query changed its ORDER BY.
 *
 * An artist with no `has_genre` edge is absent from the map and renders grey —
 * §8.1 calls that an honest absence rather than a gap to fill.
 */
export function artistGenreAncestors(
  genres: GenreNode[],
  links: ColourLink[],
): Map<string, string> {
  // `parentGenreId` is a bare uuid while node ids carry a `genre:` prefix.
  // Walking the two namespaces together finds no parent and silently makes
  // every genre its own root.
  const ancestors = topLevelAncestors(
    genres.map((genre) => ({
      id: genre.id,
      parentGenreId: genre.parentGenreId === null ? null : `genre:${genre.parentGenreId}`,
    })),
  );

  const labelOf = new Map(genres.map((genre) => [genre.id, genre.label]));

  type Best = { genreId: string; weight: number; label: string };
  const best = new Map<string, Best>();

  for (const link of links) {
    if (link.type !== 'has_genre') continue;

    const label = labelOf.get(link.target);
    // A `genreId` subset can drop the genre node while an edge to it survives;
    // colouring by a node nobody can see explains nothing.
    if (label === undefined) continue;

    const current = best.get(link.source);
    const candidate: Best = { genreId: link.target, weight: link.weight, label };

    if (
      current === undefined ||
      candidate.weight > current.weight ||
      (candidate.weight === current.weight && candidate.label < current.label)
    ) {
      best.set(link.source, candidate);
    }
  }

  const result = new Map<string, string>();
  for (const [artistId, choice] of best) {
    result.set(artistId, ancestors.get(choice.genreId) ?? choice.genreId);
  }

  return result;
}

export function colourForAncestor(ancestorId: string | null, ancestorIds: string[]): string {
  if (ancestorId === null) return NEUTRAL_COLOUR;

  const ordered = [...new Set(ancestorIds)].sort();
  const index = ordered.indexOf(ancestorId);
  if (index === -1) return NEUTRAL_COLOUR;

  return PALETTE[index % PALETTE.length];
}
