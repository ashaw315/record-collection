import Link from 'next/link';
import { PANEL_TEXT } from '../shelf/panel-palette';
import type { RecordSummary } from './summary';

/**
 * **The card beneath a pulled record: artist, title, year, and a tap for the
 * rest.**
 *
 * Its height is a CONSTANT, and that is the whole point rather than a detail of
 * styling. The size candidates each reserved a fraction of the frame for facts,
 * and while the card grew with the record that reservation was a guess about
 * content — three lines for a sparse record, an overflow for a documented one.
 * With a fixed two lines and a link, the reservation is knowable and the record
 * takes everything else.
 *
 * `e2e/summary-card.spec.ts` measures a sparse record's card against a fully
 * populated one and fails if they differ. **Any change here that makes the
 * height depend on the record breaks the size rule built on top of it**, which
 * is why the count sits on one line with the label rather than wrapping to its
 * own.
 *
 * ## The whole card is the link
 *
 * §10 wants a phone thumb-reachable, and a small "more" affordance beside
 * unclickable text is the target a thumb misses. `/records/[id]` is the same
 * destination `WallScene`'s accessible list already gives every record, so the
 * tap and the screen-reader path lead to one place and cannot drift.
 *
 * It reads as tappable rather than merely being tappable: a chevron, a border
 * that responds, and the count naming what is behind it.
 */
export function SummaryCard({ summary }: { summary: RecordSummary }) {
  /*
    The year joins the artist line rather than taking its own, which is what
    keeps the height constant when it is absent. An undated record shows the
    artist alone (§10b: absence is ordinary and unlabelled).
  */
  const attribution = [summary.artist, summary.year].filter((part) => part !== null).join(' · ');

  return (
    <Link
      href={summary.href}
      data-testid="summary-card"
      className="group block rounded-xs border border-transparent px-4 py-3 transition-colors hover:border-border"
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          {/*
            Truncated to one line each, so a long title cannot wrap and change
            the card's height — the property the size rule depends on.
          */}
          <h3
            data-testid="summary-title"
            className="font-heading truncate text-lg leading-tight font-semibold"
            style={{ color: PANEL_TEXT.title }}
          >
            {summary.title}
          </h3>
          <p
            data-testid="summary-attribution"
            className="mt-0.5 truncate text-sm"
            style={{ color: PANEL_TEXT.muted }}
          >
            {attribution}
          </p>
        </div>

        {/*
          A chevron, so the card reads as a way through rather than as a caption
          that happens to be clickable.
        */}
        <span
          aria-hidden="true"
          className="shrink-0 text-lg transition-transform group-hover:translate-x-0.5"
          style={{ color: PANEL_TEXT.muted }}
        >
          ›
        </span>
      </div>

      {/*
        **The count says what the tap is for.** "More" is a control that does not
        name what it does; a number distinguishes a record with nothing else
        recorded from one with a dozen fields. Zero is a real answer and is said
        plainly — §10b's "absence is fine", and a record with nothing else
        recorded should not be given a control implying otherwise.
      */}
      <p
        data-testid="summary-further"
        className="mt-1 truncate text-xs"
        style={{ color: PANEL_TEXT.muted }}
      >
        {summary.furtherFacts === 0
          ? 'Nothing else recorded yet — open the record'
          : `${summary.furtherFacts} more ${summary.furtherFacts === 1 ? 'fact' : 'facts'}, the journal and prices`}
      </p>
    </Link>
  );
}
