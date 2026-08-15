import type { Graph } from '@/lib/db/queries/graph';
import { artistGenreAncestors } from './graph-colour';

/**
 * The §8.1 fallback list: "a fallback list view for very small screens".
 *
 * **Grouped by top-level genre using the SAME walk the colours use.** A list
 * that grouped differently from the graph it stands in for would describe a
 * different collection at a different screen width — so `artistGenreAncestors`
 * is shared rather than reimplemented, and the two agree by construction.
 *
 * Genres are HEADINGS, not rows. A "Punk — 0 records" entry beside the artists
 * would be noise on the screen with the least room, and an ancestor genre
 * legitimately owns nothing directly (see graph.ts).
 */

export type ListArtist = { id: string; label: string; ownedCount: number };

export type ListGroup = {
  /** Null for the bucket of artists whose records carry no genre. */
  genreId: string | null;
  label: string;
  artists: ListArtist[];
};

/** §8.1 calls an artist with no genre an honest absence, not a gap to fill. */
const UNGROUPED_LABEL = 'No genre recorded';

export function groupArtistsByGenre(graph: Graph): ListGroup[] {
  const genreNodes = graph.nodes.filter((node) => node.type === 'genre');

  const ancestors = artistGenreAncestors(
    genreNodes.map((node) => ({
      id: node.id,
      label: node.label,
      parentGenreId: node.parentGenreId,
    })),
    graph.links,
  );

  const labelOf = new Map(genreNodes.map((node) => [node.id, node.label]));

  const byGenre = new Map<string, ListArtist[]>();
  const ungrouped: ListArtist[] = [];

  for (const node of graph.nodes) {
    if (node.type !== 'artist') continue;

    const entry: ListArtist = {
      id: node.id,
      label: node.label,
      ownedCount: node.ownedCount,
    };

    // One appearance per artist: `artistGenreAncestors` already resolves the
    // several has_genre edges an artist may carry down to a single ancestor.
    const ancestor = ancestors.get(node.id);
    if (ancestor === undefined) {
      ungrouped.push(entry);
      continue;
    }

    const existing = byGenre.get(ancestor);
    if (existing === undefined) {
      byGenre.set(ancestor, [entry]);
    } else {
      existing.push(entry);
    }
  }

  const byName = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label);

  const groups: ListGroup[] = [...byGenre.entries()]
    .map(([genreId, artists]) => ({
      genreId,
      label: labelOf.get(genreId) ?? genreId,
      artists: [...artists].sort(byName),
    }))
    .sort(byName);

  /**
   * Appended AFTER sorting, so the bucket is always last: sorting it with the
   * genres would let its label decide its position and drop "everything else"
   * into the middle of the list. Omitted entirely when empty — an empty
   * heading is itself a claim that something is missing.
   */
  if (ungrouped.length > 0) {
    groups.push({
      genreId: null,
      label: UNGROUPED_LABEL,
      artists: [...ungrouped].sort(byName),
    });
  }

  return groups;
}
