import Link from 'next/link';
import { GenresRun } from './GenresRun';
import { INK, LABEL, LABEL_INK } from './grid-type';

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
  ornament,
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
  /**
   * §5.1's corner field, rendered INSIDE the cell as a grid track.
   *
   * It was an absolutely-positioned mark with a fixed height, which is why the
   * reserve could not yield: an absolute box is out of flow and shares no space
   * with anything. As a track it is what remains after the content takes what
   * it needs.
   */
  ornament?: React.ReactNode;
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
      track, so content overflows the ornament rather than displacing it, and
      the numbers still look reasonable. Asserted on the computed style,
      because the defect is invisible until a title is long enough to need the
      give.
    */
    <div
      data-cell="identity"
      className="grid h-full overflow-hidden p-[18px]"
      /*
        **Three rows now, and the first is `auto` (§13).** The eyebrow is the
        frame's top line and it is not part of the type's measure, so it sits
        OUTSIDE `data-track="content"` — otherwise Edit lands at the 412 measure
        rather than at the cell's right edge, 32px short of it.

        `auto` for the line, `1fr` for the content, and §4.2's reserve
        unchanged at the foot: the added row takes the line's own height and
        the ornament track still yields as the title grows.
      */
      style={{ gridTemplateRows: 'auto 1fr minmax(0, 140px)' }}
    >
      {/*
        **§13: the eyebrow line, with Edit at its right end.**

        §8.1 rules the COLLECTION eyebrow the identity band's LABEL — not a
        link, which is why it is set in the label system rather than as a
        control. §13 puts Edit on that line: the eyebrow is the frame's top
        line at 11px mono and Edit is 11px mono, so the control joins a line it
        already matches and costs no height. Not AppHeader, which is chrome
        shared with six screens; a control acting on THIS record cannot live in
        a bar identical on all of them.

        The row is the structure that makes "costs no height" true rather than
        hoped for: `justify-between` on a baseline-aligned row, eyebrow first
        and Edit second, so the row's height is the line's and Edit sits at the
        cell's right edge rather than being absolutely positioned against it.
      */}
      <div data-row="eyebrow" className="flex items-baseline justify-between">
        <div data-field="eyebrow" className={LABEL} style={{ color: LABEL_INK }}>
          Collection
        </div>
        <Link data-control="edit" href={editHref} className={`${LABEL} no-underline hover:underline`} style={{ color: INK }}>
          Edit
        </Link>
      </div>
      <div data-track="content" className="flex flex-col justify-between">
      {/*
        The title block flows from the TOP. It grows downward into the gap and
        cannot displace the pressing block, which is anchored below.
      */}
      <div data-block="title" className="w-[412px] max-w-full">
        <h1
          data-field="title"
          className={TITLE}
          /*
            `balance` evens the lines so a five-line title has no orphan;
            `hyphens: none` keeps it from breaking words to achieve that.
            Inline because Tailwind has no utility for `text-wrap: balance`
            in this version, and the property is the decision.
          */
          style={{ textWrap: 'balance', hyphens: 'none' }}
        >
          {title}
        </h1>
        {/*
          **§4.2's "the break is balanced" applies to the artist too (§12).**
          The section rules the artist at 40 and says its break is balanced;
          the build gave the 72 block `text-wrap: balance` and `hyphens: none`
          and gave this line neither, so a real band name — "Godspeed You!
          Black Emperor" — ran past the cell and was CUT by §9.2's
          `overflow: hidden`, 50px at 1100 and more as the cell narrows.

          Same treatment as the title, for the same reason and with the same
          two declarations: balance evens the lines so a two-line artist has
          no orphan, and `hyphens: none` keeps a name from being broken
          mid-word to achieve it. A person's name is not a place to hyphenate.
        */}
        <div data-field="artist" className={ARTIST} style={{ textWrap: 'balance', hyphens: 'none' }}>
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
          <Link href={`/?artistId=${artistId}`} className="underline-offset-2 hover:underline">
            {artistName}
          </Link>
        </div>
      </div>

      {/*
        Anchored to the cell floor. `justify-between` on the parent puts this
        last child at the bottom whatever the title above it does — which is the
        structural guard: the two blocks cannot push each other.
      */}
      <div data-block="pressing" className="w-[412px] max-w-full">
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

      {/*
        The ornament track. It takes what is left of 140px after the content
        above has taken what it needs — 76.2px at four title lines, 8.6px at
        five, and the full reserve at one. The field shrinks on two records and
        disappears on none.
      */}
      <div data-track="ornament" className="relative min-h-px">
        {ornament}
      </div>
    </div>
  );
}
