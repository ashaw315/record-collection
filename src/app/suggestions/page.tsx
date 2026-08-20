import Link from 'next/link';
import { AppHeader } from '@/components/AppHeader';
import { suggestions } from '@/lib/db/queries/suggestions';

/**
 * SPEC.md §10 `/suggestions`: "Relationship-based list with reasons, always
 * present. Separate 'Ask Claude for gap analysis' button for §9.2.
 * Add-to-want-list on each."
 *
 * **The gap-analysis button is not here yet.** §9.2 is a later unit and a button
 * calling an endpoint that does not exist is a dead control — worse than a
 * missing one, because it reads as broken rather than as unbuilt.
 *
 * **No header link points here, by decision** (NOTES, step 14 unit 3). Measured
 * at 390px, the nav already hides two of its five links behind a scroll with no
 * affordance; a sixth makes that worse. The way in is from `/want-list`, which
 * is where this screen's output lands. The nav still renders HERE, so there is
 * always a way back — reachability was the requirement, not a nav slot.
 *
 * **Two of §9.1's four terms are unscored** (§9.1a): nothing populates
 * `artist_genres` and no artist-to-label relationship exists. The screen says so
 * rather than presenting a two-term score as the whole judgement.
 */

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Suggestions · Record Collection' };

const LIMIT = 20;

export default async function SuggestionsPage() {
  const rows = await suggestions({ limit: LIMIT });

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl px-4 py-5">
        <Link
          href="/want-list"
          className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          ← Want list
        </Link>

        <h1 className="mt-3 mb-1 font-heading text-xl font-semibold tracking-tight">
          Suggestions
        </h1>

        <p className="mb-5 text-sm text-muted-foreground">
          Artists you don&rsquo;t own, reached from ones you do — through influences you&rsquo;ve
          recorded, or a shared line-up.
        </p>

        {rows.length === 0 ? (
          /**
           * **The realistic state, not an edge case.** `artist_influences` is
           * hand-entered and `artist_memberships` is filled by an on-demand
           * MusicBrainz walk, so a collection that has had neither produces
           * nothing here — and that is a fact about the data, not a failure.
           *
           * It says which two inputs are missing and where to supply them,
           * because "no suggestions" with no explanation is indistinguishable
           * from a broken screen.
           */
          <div className="rounded-md border border-border bg-muted/30 p-4 text-sm">
            <p className="font-medium">Nothing to suggest yet.</p>
            <p className="mt-1 text-muted-foreground">
              Suggestions come from two things: influence edges you record in{' '}
              <Link href="/manage" className="underline underline-offset-2">
                Manage
              </Link>
              , and band line-ups imported from MusicBrainz. Neither is filled in
              automatically — with both empty there is nothing to reach from.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {rows.map((row) => (
              <li
                key={row.artistId}
                className="rounded-md border border-border p-4"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <h2 className="font-medium">{row.artistName}</h2>
                  <Link
                    href={`/want-list/new?artistId=${row.artistId}`}
                    className="shrink-0 text-sm underline underline-offset-2 hover:text-foreground"
                  >
                    Add to want list
                  </Link>
                </div>

                {/**
                 * The reasons, one clause per contributing term. §9.1:
                 * "Suggestions must be explainable. Never return a bare score
                 * with no reasoning." The SCORE is deliberately not rendered —
                 * 8.5 means nothing to a reader, while "linked to 3 artists you
                 * own" is the same fact in a form they can check.
                 */}
                <ul className="mt-2 space-y-0.5 text-sm text-muted-foreground">
                  {row.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}

        {/**
         * §9.1a, said on the screen rather than only in the spec. A ranking
         * built from two of four terms is not wrong, but presenting it as the
         * whole judgement would overstate what the app knows.
         */}
        <p className="mt-6 border-t border-border pt-4 text-xs text-muted-foreground">
          Ranked on recorded influences and shared line-ups only. Genre and label
          overlap are specified but not scored — nothing in the app fills in an
          artist&rsquo;s genres or labels yet.
        </p>
      </main>
    </>
  );
}
