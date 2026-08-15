import { AppHeader } from '@/components/AppHeader';
import { buildGraph } from '@/lib/db/queries/graph';
import { listGenres } from '@/lib/db/queries/genres';
import type { Offset } from '@/lib/api/query-params';
import { GraphView } from './GraphView';

/**
 * SPEC.md §10 `/graph`: "The force-directed network. Controls: genre subset,
 * reset zoom. Owned records only."
 *
 * The payload is fetched on the server and handed to the client component as a
 * prop rather than re-fetched in the browser: the page is already a server
 * component with database access, and a client-side fetch would reimplement a
 * server concern and show an empty canvas while it resolved.
 */

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Graph' };

const GENRE_PAGE = { limit: 200, offset: 0 as Offset };

export default async function GraphPage({
  searchParams,
}: {
  searchParams: Promise<{ genreId?: string }>;
}) {
  const { genreId } = await searchParams;

  const [graph, genres] = await Promise.all([
    buildGraph({ genreId }),
    listGenres(GENRE_PAGE),
  ]);

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-6xl px-4 py-6">
        <h1 className="font-heading text-xl font-semibold tracking-tight">Graph</h1>

        <GraphView
          graph={graph}
          genres={genres.rows.map((row) => ({ id: row.id, name: row.name }))}
          selectedGenreId={genreId ?? null}
        />
      </main>
    </>
  );
}
