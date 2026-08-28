import Link from 'next/link';
import { AppHeader } from '@/components/AppHeader';
import { suggestions } from '@/lib/db/queries/suggestions';
import { latestGapAnalysis } from '@/lib/db/queries/gap-analysis';
import { listGenreTree, type GenreNode } from '@/lib/db/queries/genres';
import { isAnthropicConfigured } from '@/lib/llm/client';
import { GapAnalysis } from './GapAnalysis';

/**
 * SPEC.md §10 `/suggestions`: "Relationship-based list with reasons, always
 * present. Separate 'Ask Claude for gap analysis' button for §9.2.
 * Add-to-want-list on each."
 *
 * **The gap-analysis button is here and is deliberately separate**, per §10's
 * "Separate 'Ask Claude for gap analysis' button". Separate because the two
 * halves make different claims: §9.1's list is computed from the user's own
 * data and is always right about what it says, while §9.2's is a model's
 * opinion about music. Mixing them into one ranked list would present both
 * with the same authority.
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

  /*
   * A39: the last analysis, so navigating away no longer costs a request to see
   * the same answer again. Read here rather than fetched by the client, because
   * this page is a server component and the value is already on the server.
   */
  const lastGapAnalysis = await latestGapAnalysis();

  /*
   * §12d (A45): every genre is offerable as a scope. No depth rule — measured,
   * `Rock`'s breadth is direct tagging rather than accumulation, so a gate would
   * forbid it for a false reason and forbid `Jazz` for a true one.
   */
  const genreTree = await listGenreTree();

  /*
   * Flattened with an indent, so the picker shows the hierarchy the scope
   * actually walks — asking about `Punk` includes `UK82` beneath it, and a flat
   * alphabetical list would hide that the two are related.
   */
  const scopeOptions: Array<{ id: string; name: string }> = [];
  const walk = (nodes: GenreNode[], depth: number) => {
    for (const node of nodes) {
      scopeOptions.push({ id: node.id, name: `${'\u00a0\u00a0'.repeat(depth)}${node.name}` });
      walk(node.children, depth + 1);
    }
  };
  walk(genreTree.nodes, 0);

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

        <div className="mb-6">
          <GapAnalysis
            last={lastGapAnalysis}
            genres={scopeOptions}
            configured={isAnthropicConfigured()}
          />
        </div>

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
