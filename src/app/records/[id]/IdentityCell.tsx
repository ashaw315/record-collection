import Link from 'next/link';
import { TitleStep } from './TitleStep';
import { GenresRun } from './GenresRun';
import { LABEL, LABEL_INK } from './grid-type';

/**
 * 8a's identity cell — the title block from the top, the pressing block anchored
 * to the floor (§4.2).
 *
 * **The guard is structural, not a clamp.** §7 feared the 38-character title
 * overflowing the 500px band; measured at the real spec it needs 498 of 500. But
 * 2px is a coincidence rather than a margin, so the layout does not rely on it:
 * `justify-content: space-between` puts the title at the top and the pressing
 * block on the cell floor, and the gap between them absorbs the difference.
 * That gap is real at one to three lines and zero at five — and at five it is
 * measured to fit. **An overflow risk becomes an overlap that cannot happen**,
 * which is worth more than a clamp.
 *
 * §7's clamp paragraph is retracted. Every clamp option paid real characters of
 * a record's name for a problem correctness does not have, and the fault was
 * the BREAK rather than the length: an orphaned volume number reads as a
 * rendering error, not as a long title.
 *
 * **`text-wrap: balance` and `hyphens: none`** on the 72 block: five lines stay
 * five, evenly measured, and the orphan goes.
 *
 * **It was checked, and here is the measurement** — because the next person to
 * find `text-wrap: balance` in a codebase with this much measurement in it will
 * reasonably wonder. On the real 38-character title the line widths are
 * [235, 206, 283, 270, 141] with the property and [235, 206, 283, 365, 43]
 * without: the 43px last line is the orphaned volume number. The height is 338
 * either way.
 *
 * So where `balance` is unsupported it is simply ignored, the orphan returns,
 * and **nothing overflows** — the fallback is worse-looking and still correct,
 * which is the right shape for a rendering behaviour that cannot be guaranteed.
 * `e2e/identity-cell.spec.ts` asserts both states rather than assuming either.
 */

/** §4.2: the title is the 72, the artist the 40 beneath it. */
const TITLE = 'text-[72px] leading-[0.94] font-extrabold tracking-[-0.02em]';
const ARTIST = 'text-[40px] leading-none font-extrabold';

/** §3: the inset hairline runs the 372px text measure, not the 480px cell. */
const INSET_RULE = 'oklch(0.72 0.004 80)';

export function IdentityCell({
  title,
  artistName,
  artistId,
  pressingLine,
  genres,
  formatLine,
  editHref,
}: {
  title: string;
  artistName: string;
  artistId: string;
  /** Label · catalogue · country, year — one line, absent parts dropped. */
  pressingLine: string;
  genres: ReadonlyArray<{ id: string; name: string }>;
  /** §4: sans 500, because it describes rather than identifies. */
  formatLine: string | null;
  /** The pressing editor §4.2's genres count opens when the run collapses. */
  editHref: string;
}) {
  return (
    /*
      **A two-track grid: content at 1fr, ornament at minmax(0, 140px).**

      The corner field is a TRACK that shrinks by exactly what the content
      takes. What it replaces was static padding plus a fixed absolute height —
      two independent numbers with nothing coupling either to remaining space,
      so "the reserve yields" was a claim with no mechanism behind it. It
      produced plausible numbers, which is why a test pinning figures would
      have passed on it; `e2e/identity-cell.spec.ts` asserts the relationship
      instead.

      **The content track keeps its automatic min-content minimum.** Do not add
      `min-height: 0` here: it reads as flex-overflow hygiene and is the one
      declaration that defeats the mechanism it sits inside — it pins the 1fr
      track, so content overflows the CELL rather than being measured against
      it, and
      the numbers still look reasonable. Asserted on the computed style,
      because the defect is invisible until a title is long enough to need the
      give.
    */
    <div
      /*
        **Its own name, because two elements carried `data-cell="identity"`.**
        The band's grid item wraps this one, so every locator on that
        attribute was a strict-mode violation surviving only by being scoped,
        and the collapse trigger reached this box as `content.parentElement`
        — right by position rather than by name, which is the relationship
        held implicitly that `docs/findings/inline-values-and-width.md`
        records as a class.
      */
      data-cell="identity-content"
      /*
        **No `overflow-hidden` (§27).** "If the worst title still overflows,
        §4.2's genres-collapse fires — never overflow-hidden." The class
        turned a 0.9px overflow into a silent clip, which is why the trigger
        measuring the wrong thing stayed invisible for as long as it did.
        With the collapse firing on the demand §4.2 actually defines, nothing
        overflows — and the next thing that does will announce itself.
      */
      className="grid h-full min-w-0 p-[18px]"
      /*
        **One row (§28): the ornament track is withdrawn and its space
        returns to the content.** "The identity cell carries no ornament. Its
        corner field and ornament track are withdrawn, and the ornament step
        leaves §4.2's give order... The space the track held returns to the
        content on every record."

        A track holding a triangle on most records and 1px on the worst makes
        ornament's presence depend on the record, which §21 forbids — the
        same defect as hashing ornament, reached through the give order
        rather than through the generator. A floor on the track would not
        help: at the triangle's 140px it would take height from the title on
        every long record for a mark that carries nothing.
      */
      /* §40: above the fork the page pins the track at the ladder's 510 and the cell's extra height is slack below it. */
      /* A definite column: without one the grid sizes its column to the track's content, and the track's 100% resolves to nothing (measured 196 on the identity probe, 29 Sep). */
      style={{ gridTemplateColumns: 'minmax(0, 1fr)', gridTemplateRows: '1fr' }}
    >
      {/* §45 (step 53): the track is the cell's inner width at every window -- the ladder's measure. Stated here, on the component, so a page that renders the cell without RecordPage8a's stylesheet (the identity probe) measures the same track. */}
      <div data-track="content" className="flex w-full min-w-0 flex-col justify-between">
      {/*
        The title block flows from the TOP. It grows downward into the gap and
        cannot displace the pressing block, which is anchored below.
      */}
      <div data-block="title" className="w-full">
        {/*
          **§27: COLLECTION is in the content flow, and the eyebrow grid row is
          deleted.** §8.1 rules the eyebrow the band's label, not a link. §13
          lifted it into a grid row of its own so Edit could share its line;
          §24 moved Edit to the nav and the row stayed behind, 16.5px that
          §4.2's give order never saw because it sat outside the track the
          collapse measures. On the collection's real five-line title that was
          2.5px of overflow and a cut pressing block. No give-order term — a
          new term would be a second mechanism patching the first.

          **Inside the title block, not beside it.** The track is
          `justify-between` with two children, title block and pressing block,
          and that pairing is the structural guard: the title flows from the
          top and the pressing anchors to the floor. A third child shares the
          slack, and the first build of this put the label there — on a
          one-line title the slack opened 81px between COLLECTION and the
          title. Here it is the top of the block that flows from the top.
        */}
        <div data-field="eyebrow" className={LABEL} style={{ color: LABEL_INK }}>
          Collection
        </div>
        {/*
          **§33's display ladder.** "The title takes the largest display step
          that fits. The steps are 72, 96, 120 and 144, and the artist line is
          five-ninths of the title... If 72 does not fit, §4.2's give order
          runs as now."

          The cell was dimensioned for the collection's extreme -- the
          five-line title -- so an ordinary record set at 72 in a cell built
          for five lines of it, and §33 reads that as the band being thin:
          "the returned space becomes type, not gap".

          `TitleStep` chooses by MEASURING, because both of §33's conditions
          are browser facts: how many lines a string sets to at a size, and
          how tall the cell's content then is.
        */}
        {/*
          **A LINK, restored for the second time.** The deleted header linked
          the artist; `RecordGrid` had to put it back and recorded why; 8a
          dropped it again, and `record-form.spec.ts` caught it — §10 makes
          "what else do I have by this artist" one click rather than a search.

          Three losses of the same shape in one component's history (this, the
          genres line, and the grid's own note about the header) is why the
          capability is asserted by ROLE in the E2E rather than by text: plain
          text satisfies a text assertion and loses the click.
        */}
        <TitleStep
          title={title}
          artist={
            <Link href={`/?artistId=${artistId}`} className="underline-offset-2 hover:underline">
              {artistName}
            </Link>
          }
        />
      </div>

      {/*
        Anchored to the cell floor. `justify-between` on the parent puts this
        last child at the bottom whatever the title above it does — which is the
        structural guard: the two blocks cannot push each other.
      */}
      <div data-block="pressing" className="w-full">
        <div
          className="mb-[14px] w-[372px] max-w-full"
          style={{ borderTop: `1px solid ${INSET_RULE}` }}
        />
        <div className={LABEL}>Pressing</div>
        {pressingLine !== '' && (
          <div data-field="pressing-line" className="text-prose">
            {pressingLine}
          </div>
        )}
        {/*
          **Format line and genres run together**, because §4.2's collapse
          moves the run onto the format line as a count. `GenresRun` is a
          client component: whether the content overflows is decided by layout,
          and it measures once the cell has laid out — after the gap and the
          ornament track have already given, which is the order §4.2 states.

          The run is still LINKS: §10 makes "what else is like this" one click,
          and this capability has been lost twice to rebuilds that kept the
          text. The count, when it renders, is a link too — to the pressing
          editor that holds every other pressing fact.
        */}
        <GenresRun
          formatLine={formatLine}
          genres={genres}
          editHref={editHref}
          runClassName="text-prose leading-none"
        />
      </div>
      </div>

    </div>
  );
}
