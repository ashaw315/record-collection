import Link from 'next/link';
import { LABEL } from './grid-type';

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
}: {
  title: string;
  artistName: string;
  artistId: string;
  /** Label · catalogue · country, year — one line, absent parts dropped. */
  pressingLine: string;
  genres: ReadonlyArray<{ id: string; name: string }>;
  /** §4: sans 500, because it describes rather than identifies. */
  formatLine: string | null;
}) {
  return (
    <div
      data-cell="identity"
      className="flex h-full flex-col justify-between overflow-hidden p-[18px]"
    >
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
        <div data-field="artist" className={ARTIST}>
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
        {formatLine !== null && (
          <div data-field="format" className="text-prose font-medium">
            {formatLine}
          </div>
        )}
        {/*
          **Genres, as LINKS — the capability the swap dropped.**

          `PageRecord` declared them, the route supplied them and `gridModules`
          carried them into `modules.pressing.genres`, but nothing rendered
          them: the richest record went straight from the pressing line to
          Provenance. §1.1 puts the genres line in the pressing block, so this
          is where they were meant to be.

          Links rather than text, for the reason the deleted grid recorded and
          `record-detail.spec.ts` asserts: §10 makes "what else is like this"
          one click, and plain text would have hidden the loss while looking
          right. Dropping them a second time is what made this a rule.

          The block is anchored to the cell's floor, so this line grows UP into
          the gap the title leaves rather than pushing anything.
        */}
        {genres.length > 0 && (
          /*
            `leading-none` because the inline links' leading otherwise pushes
            the block's last line box 4px past its content box, and the cell's
            floor is measured from the BLOCK — `e2e/identity-cell.spec.ts`
            caught it as an 18px gap becoming 14. The line still sits on the
            18px padding; only the half-leading below the glyphs is removed.
          */
          <div data-field="genres" className="text-prose leading-none">
            {genres.map((genre, index) => (
              <span key={genre.id}>
                {index > 0 && ', '}
                <Link
                  href={`/?genreId=${genre.id}`}
                  className="underline-offset-2 hover:underline"
                >
                  {genre.name}
                </Link>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
