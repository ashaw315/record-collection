import { AppHeader } from '@/components/AppHeader';
import { ManageClient } from './ManageClient';
import type { Row } from './ResourceTable';
import { listArtists } from '@/lib/db/queries/artists';
import { listOpenMatchCandidates } from '@/lib/db/queries/artist-match-candidates';
import { MatchReview } from './MatchReview';
import { listGenres } from '@/lib/db/queries/genres';
import { listLabels } from '@/lib/db/queries/labels';
import { listFormats } from '@/lib/db/queries/formats';
import { listStores } from '@/lib/db/queries/stores';
import { listTags } from '@/lib/db/queries/tags';
import type { Offset } from '@/lib/api/query-params';

/**
 * SPEC.md §10 `/manage`: CRUD for genres (incl. hierarchy), labels, formats,
 * tags, artists and stores.
 *
 * NOT pressings (§10): a pressing has no meaning apart from the record it
 * describes, so its fields are entered on the record form instead. The
 * /api/pressings endpoints remain — step 7's Discogs import needs them.
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
 * Rendered per request, not at build time.
 *
 * This page reads seven tables and uses no request-scoped API — auth is in
 * middleware, which does not opt a page into dynamic rendering — so Next
 * PRERENDERED it. Proven against a production build: a tag created through the
 * API was returned by the API and never appeared here, on a full page load.
 * The screen would have shown whatever data existed when the build ran.
 *
 * Declared rather than relying on an incidental dynamic API, so it cannot
 * regress when the code around it changes. test/repo/dynamic-pages.test.ts
 * fails if any database-backed page loses this.
 */
export const dynamic = 'force-dynamic';

/**
 * Reference data is small, so one page of 200 covers every resource and this
 * screen needs no pagination controls. The offset cast is the one place a
 * branded Offset is minted outside parseListParams: it is the literal 0, not
 * anything derived from a request.
 */
const PAGE = { limit: 200, offset: 0 as Offset };

export default async function ManagePage({
  searchParams,
}: {
  searchParams: Promise<{ artists?: string }>;
}) {
  /**
   * The toggle lives in the URL rather than in client state: it survives a
   * reload, it is linkable, and it needs no refetch — the page is a server
   * component and simply queries differently.
   */
  const showAllArtists = (await searchParams).artists === 'all';

  const [artists, genres, labels, formats, stores, tags, matchCandidates] = await Promise.all([
    listArtists({ ...PAGE, collectedOnly: !showAllArtists }),
    listGenres(PAGE),
    listLabels(PAGE),
    listFormats(PAGE),
    listStores(PAGE),
    listTags(PAGE),
    // §4.3: surfaced here rather than asked during the import walk.
    listOpenMatchCandidates(),
  ]);

  /**
   * §10's `/manage`, narrowed after QA: two lineup walks took the artist list
   * from 6 to 71, and the imported session players and tribute acts sat between
   * the artists being collected. The default is what the user MANAGES; the
   * count names what is hidden.
   */
  const rowsByResource: Record<string, Row[]> = {
    artists: artists.rows as unknown as Row[],
    genres: genres.rows as unknown as Row[],
    labels: labels.rows as unknown as Row[],
    formats: formats.rows as unknown as Row[],
    stores: stores.rows as unknown as Row[],
    tags: tags.rows as unknown as Row[],
  };

  return (
    <>
      <AppHeader />
      <div className="mx-auto w-full max-w-5xl px-3 pt-4">
        <MatchReview candidates={matchCandidates} />
      </div>
      <ManageClient
        rowsByResource={rowsByResource}
        artistCounts={{
          shown: artists.total,
          hidden: artists.totalAll - artists.total,
          showingAll: showAllArtists,
        }}
      />
    </>
  );
}
