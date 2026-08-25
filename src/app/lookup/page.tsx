import { AppHeader } from '@/components/AppHeader';
import { LookupClient } from './LookupClient';

/**
 * SPEC.md §10 `/lookup` — "Mobile-optimized — this is the in-store screen."
 *
 * A thin server shell: everything here is driven by what the user types, so the
 * work belongs in the client component. The page exists to put the form on
 * screen fast and out of the way of the results.
 */

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Look up a record · Record Collection' };

export default function LookupPage() {
  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl px-4 py-5">
        <h1 className="mb-1 font-heading text-xl font-semibold tracking-tight">Look up a record</h1>
        <p className="mb-4 text-sm text-muted-foreground">
          Search Discogs for the record in your hand. A catalogue number narrows to an album, not a
          pressing — often dozens share one. A barcode narrows further.
        </p>

        <LookupClient />
      </main>
    </>
  );
}
