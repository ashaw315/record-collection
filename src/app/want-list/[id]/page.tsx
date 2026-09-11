import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppHeader } from '@/components/AppHeader';
import { hydrateWantListItem } from '@/lib/db/queries/want-list';
import { formatCeiling, huntFacts, priorityLabel } from '../want-list-format';
import { PressingVariants } from '../PressingVariants';

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
          className="text-meta text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          ← Want list
        </Link>

        <header className="mt-3">
          <h1 className="text-headline font-medium">{item.title}</h1>
          <p className="text-detail text-muted-foreground">{item.artist?.name ?? 'Unknown artist'}</p>
          <p className="mt-1 text-meta text-muted-foreground">
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
            <h2 className="text-label font-medium tracking-wide text-muted-foreground uppercase">
              The hunt
            </h2>
            <dl className="mt-2 space-y-2">
              {hunt.map((fact) => (
                <div key={fact.label}>
                  <dt className="text-label text-muted-foreground">{fact.label}</dt>
                  <dd className="text-detail whitespace-pre-wrap">{fact.value}</dd>
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
            <h2 className="text-label font-medium tracking-wide text-muted-foreground uppercase">
              What you are willing to pay
            </h2>
            <p className="mt-2 font-mono text-detail">{ceiling}</p>
          </section>
        )}

        {/*
          **A55: what the app HOLDS, before what a model says about it.**

          Placed ABOVE the assessment deliberately. The held facts are the
          record's identity — a catalogue number and a runout the user can read
          off the object — while the assessment is a model's claim about pressing
          history. Adam's Halcyon Digest report is why the order matters: the
          assessment invented CAD 3016 for a record whose number is CAD 3X38, and
          a fabricated identifier is a navigational failure rather than an
          uncertain judgement. What the app knows goes first.
        */}
        <PressingVariants pressing={item.targetPressing ?? null} />

        {/*
          §12b (A43). Below the hunt because it ANSWERS the question the hunt
          section poses — "which pressing" — and above the ceiling because it is
          about the record rather than about money.
        */}
        {/*
          **A59 (2026-09-08): the generated assessment is RETIRED, not hidden.**

          Three arguments converged and none was about the implementation:

          1. Discogs' master-versions endpoint omits `formats[].text` — the
             free-text descriptor that distinguishes pressings. Both Deerhunter
             variants are CAD 3X38; the descriptor IS the distinction, so
             retrieval-plus-ranking cannot be built cheaply.
          2. Once you HAVE the versions list you have answered "which pressing
             should I look for" without a model.
          3. **J. Lambert @ JLM** — a model with retrieval AND a correcting
             interlocutor produced a mastering credit present on every pressing
             as a discriminator, twice. Not a prompt defect, not a grounding
             defect, and more real data nearby arguably makes it worse.

          **Stored assessments are KEPT in the database and not rendered**
          (Adam): they are a record of what the feature said, and this whole
          thread turns on being able to compare answers across runs.
          `latestAssessment` and `assessmentWithPrevious` still work; nothing
          reads them on this screen.

          What replaces it is in `PressingVariants` above — the held facts, plus
          a pointer at real releases. See SPEC §12b for the full rationale and
          what the versions table does and does not answer.
        */}

        <div className="mt-6 flex gap-2">
          <Link
            href={`/want-list/${item.id}/edit`}
            data-testid="want-list-edit"
            className="rounded-xs border border-border px-3 py-1.5 text-label"
          >
            Edit
          </Link>
        </div>
      </main>
    </>
  );
}
