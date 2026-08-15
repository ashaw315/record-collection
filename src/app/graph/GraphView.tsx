'use client';

import dynamic from 'next/dynamic';
import type { Graph } from '@/lib/db/queries/graph';

/**
 * The `ssr: false` boundary required by SPEC.md §8.1.
 *
 * `next/dynamic` with `ssr: false` is not allowed in a server component under
 * the app router, so this thin client wrapper exists solely to host it. The
 * simulation module below touches `window` on import and would break SSR.
 */
const GraphCanvas = dynamic(() => import('./GraphCanvas').then((m) => m.GraphCanvas), {
  ssr: false,
  loading: () => (
    <p className="mt-4 text-sm text-muted-foreground" role="status">
      Laying out the graph…
    </p>
  ),
});

export type GenreOption = { id: string; name: string };

export function GraphView({
  graph,
  genres,
  selectedGenreId,
}: {
  graph: Graph;
  genres: GenreOption[];
  selectedGenreId: string | null;
}) {
  return <GraphCanvas graph={graph} genres={genres} selectedGenreId={selectedGenreId} />;
}
