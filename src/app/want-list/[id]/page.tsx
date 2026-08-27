import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppHeader } from '@/components/AppHeader';
import { hydrateWantListItem } from '@/lib/db/queries/want-list';
import { formatCeiling, huntFacts, priorityLabel } from '../want-list-format';
import { PressingAssessment } from '../PressingAssessment';

/**
 * SPEC.md §10 — the want-list item detail view.
 *
 * **The defect this closes, from Adam's real use:** `target_pressing` and
 * `best_dig_notes` live on the row and were invisible unless editing. *"I filled
 * them in and cannot see them."* Nothing here is new data; it is data the app
 * already held and never showed.
 *
 * **§7.2 / CLAUDE.md §8 — best dig is not a price**, and the separation is
 * structural rather than a layout habit: the hunt and the ceiling are different
 * sections with different headings, and `huntFacts` cannot carry `max_price`
 * because it is not in that function's input type.
 */

export const dynamic = 'force-dynamic';

export default async function WantListItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const item = await hydrateWantListItem(id);

  // A malformed or unknown id is a not-found page, never a server error — the
  // same treatment `/records/:id` gives it.
  if (item === undefined) notFound();

  const hunt = huntFacts({
    bestDigNotes: item.bestDigNotes,
    targetPressing: item.targetPressing,
  });
  const ceiling = formatCeiling(item.maxPrice);

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-2xl px-4 py-5">
        <Link
          href="/want-list"
          className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          ← Want list
        </Link>

        <header className="mt-3">
          <h1 className="text-xl font-medium">{item.title}</h1>
          <p className="text-sm text-muted-foreground">{item.artist?.name ?? 'Unknown artist'}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Priority: {priorityLabel(item.priority)}
          </p>
        </header>

        {/*
          **The hunt, and it renders only when there is one.** Most rows carry
          nothing here, and the screen's job is showing what the user RECORDED —
          so a row with nothing recorded is a legitimate state rather than a gap
          to be filled. `huntFacts` returns [] and this section disappears
          entirely; a page of "not recorded" placeholders would treat blank as a
          defect and imply work to do.

          Absence-as-absence is NOT needed here, and the distinction is worth
          keeping: on `/lookup` "Discogs holds no matrix" earns its place because
          a blank could be misread as "this pressing has no runout". A blank hunt
          can only mean the user wrote nothing.
        */}
        {hunt.length > 0 && (
          <section data-testid="hunt" className="mt-5 border-t border-border pt-3">
            <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              The hunt
            </h2>
            <dl className="mt-2 space-y-2">
              {hunt.map((fact) => (
                <div key={fact.label}>
                  <dt className="text-xs text-muted-foreground">{fact.label}</dt>
                  <dd className="text-sm whitespace-pre-wrap">{fact.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {/*
          **A SEPARATE section, never folded into the hunt above** (§7.2). "Best
          dig" is the highest-fidelity pressing worth hunting for; `max_price` is
          an unrelated ceiling the user set. Sharing a heading would be the
          conflation CLAUDE.md §8 forbids, and the two would read as one
          judgement about value.
        */}
        {ceiling !== undefined && (
          <section data-testid="ceiling" className="mt-5 border-t border-border pt-3">
            <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              What you are willing to pay
            </h2>
            <p className="mt-2 font-mono text-sm">{ceiling}</p>
          </section>
        )}

        {/*
          §12b (A43). Below the hunt because it ANSWERS the question the hunt
          section poses — "which pressing" — and above the ceiling because it is
          about the record rather than about money.
        */}
        <PressingAssessment itemId={item.id} />

        <div className="mt-6 flex gap-2">
          <Link
            href={`/want-list/${item.id}/edit`}
            data-testid="want-list-edit"
            className="rounded-xs border border-border px-3 py-1.5 text-sm"
          >
            Edit
          </Link>
        </div>
      </main>
    </>
  );
}
