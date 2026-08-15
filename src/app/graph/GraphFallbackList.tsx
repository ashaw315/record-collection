import Link from 'next/link';
import type { Graph } from '@/lib/db/queries/graph';
import { groupArtistsByGenre } from './graph-list';

/**
 * SPEC.md §8.1's fallback for very small screens.
 *
 * Not a degraded graph — a different shape for the same data. At 390px the
 * force layout renders, pans and zooms, but the node labels are unreadable, so
 * the information the graph carries is not actually available. The list gives
 * up the topology and keeps what survives at that width: which artists you own,
 * grouped by genre family, and how many records each has.
 *
 * A plain server component: no simulation, no client state, and the same
 * click-to-filter destination as a node (§8.1).
 */
export function GraphFallbackList({ graph }: { graph: Graph }) {
  const groups = groupArtistsByGenre(graph);

  if (groups.length === 0) {
    return (
      <p className="mt-6 text-sm text-muted-foreground">
        Nothing to list yet — the graph shows artists and genres from records you own.
      </p>
    );
  }

  return (
    <div className="mt-4" data-testid="graph-fallback-list">
      <p className="text-xs text-muted-foreground">
        Grouped by genre. The network view needs a wider screen.
      </p>

      <ul className="mt-3 space-y-4">
        {groups.map((group) => (
          <li key={group.genreId ?? 'ungrouped'}>
            <h2 className="font-heading text-sm font-semibold tracking-tight">{group.label}</h2>

            <ul className="mt-1 divide-y divide-border border-t border-border">
              {group.artists.map((artist) => (
                <li key={artist.id}>
                  <Link
                    href={`/?artistId=${artist.id.replace('artist:', '')}`}
                    className="flex items-baseline justify-between gap-3 py-2 text-sm"
                    data-testid="graph-list-artist"
                  >
                    <span>{artist.label}</span>
                    <span className="text-xs whitespace-nowrap text-muted-foreground">
                      {artist.ownedCount} record{artist.ownedCount === 1 ? '' : 's'}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
