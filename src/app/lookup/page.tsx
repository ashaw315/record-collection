import { AppHeader } from '@/components/AppHeader';
import { LookupClient } from './LookupClient';
import { ConstructionStill } from '../records/[id]/ConstructionStill';
import { figureSource } from '../figure-source';
import { listRecordAges } from '@/lib/db/queries/records';

/**
 * SPEC.md §10 `/lookup` — "Mobile-optimized — this is the in-store screen."
 *
 * A thin server shell: everything here is driven by what the user types, so the
 * work belongs in the client component. The page exists to put the form on
 * screen fast and out of the way of the results.
 */

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Look up a record · Record Collection' };

export default async function LookupPage() {
  /* §T.6's one source record: "every figure in the app is drawn from one record". None where the collection is empty. */
  const source = figureSource(await listRecordAges());
  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl px-4 py-5">
        {/* §T.6 reaches look up's heading and its empty state only: "Its results were not surveyed and are not ruled." So the mapping is on these and on the form, and not on the page. */}
        <div data-t6="">
        <h1 className="mb-1 font-heading text-headline font-semibold tracking-tight">Look up a record</h1>
        <p className="mb-4 text-lede text-muted-foreground">
          Search Discogs for the record in your hand. A catalogue number narrows to an album, not a
          pressing — often dozens share one. A barcode narrows further.
        </p>
        </div>

        <LookupClient
          emptyFigure={
            source === null ? null : (
              <div style={{ height: source.clearing, width: source.clearing * source.aspect }}>
                <ConstructionStill recordId={source.id} spineColour={null} />
              </div>
            )
          }
        />
      </main>
    </>
  );
}
