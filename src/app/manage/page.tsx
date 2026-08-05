import { ManageClient } from './ManageClient';
import type { Row } from './ResourceTable';
import { listArtists } from '@/lib/db/queries/artists';
import { listGenres } from '@/lib/db/queries/genres';
import { listLabels } from '@/lib/db/queries/labels';
import { listFormats } from '@/lib/db/queries/formats';
import { listStores } from '@/lib/db/queries/stores';
import { listTags } from '@/lib/db/queries/tags';
import { listPressings } from '@/lib/db/queries/pressings';
import type { Offset } from '@/lib/api/query-params';

/**
 * SPEC.md §10 `/manage`: CRUD for genres (incl. hierarchy), labels, formats,
 * tags, artists, stores and pressings.
 *
 * Rows are read here, on the server, and handed to the client component as
 * props. Fetching from an effect instead causes the cascading renders the
 * react-hooks lint rule warns about, and trades a data-carrying first paint for
 * a spinner. Mutations go to the §5.4 endpoints and then call
 * router.refresh(), which re-runs this component — no client cache to
 * invalidate and no stale-response race.
 */

export const metadata = { title: 'Manage · Record Collection' };

/**
 * Reference data is small, so one page of 200 covers every resource and this
 * screen needs no pagination controls. The offset cast is the one place a
 * branded Offset is minted outside parseListParams: it is the literal 0, not
 * anything derived from a request.
 */
const PAGE = { limit: 200, offset: 0 as Offset };

export default async function ManagePage() {
  const [artists, genres, labels, formats, stores, tags, pressings] = await Promise.all([
    listArtists(PAGE),
    listGenres(PAGE),
    listLabels(PAGE),
    listFormats(PAGE),
    listStores(PAGE),
    listTags(PAGE),
    listPressings(PAGE),
  ]);

  const rowsByResource: Record<string, Row[]> = {
    artists: artists.rows as unknown as Row[],
    genres: genres.rows as unknown as Row[],
    labels: labels.rows as unknown as Row[],
    formats: formats.rows as unknown as Row[],
    stores: stores.rows as unknown as Row[],
    tags: tags.rows as unknown as Row[],
    pressings: pressings.rows as unknown as Row[],
  };

  return <ManageClient rowsByResource={rowsByResource} />;
}
