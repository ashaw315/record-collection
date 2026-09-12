import { BANDS, IDENTITY_SPANS, LOWER_SPANS } from './band-geometry';
import { ConstructionStill } from './ConstructionStill';
import { IdentityCell } from './IdentityCell';
import { gridModules, type Diagonal } from './grid-modules';
import { LABEL } from './grid-type';
import { recordLadder } from '@/lib/colour/record-ladder';

/**
 * 8a assembled — three fixed bands at 1440 × 900, no scroll.
 *
 * **The assembly is the measurement.** Every piece so far has been measured in
 * isolation: the bands' rendered total, the identity cell's anchor, the colour
 * ladder's contrast, the construction's containment. What none of them can show
 * is whether the composition holds with all of it at once.
 */

/** §3: one ink weight for every structural edge. */
const RULE = 'oklch(0.72 0.004 80)';
const INK = 'oklch(0.19 0.008 60)';

export type PageRecord = {
  id: string;
  title: string;
  artistName: string;
  pressingLine: string;
  formatLine: string | null;
  matrixRunout: string | null;
  releaseYear: number | null;
  yearPressed: number | null;
  genres: ReadonlyArray<{ id: string; name: string }>;
  purchasePrice: string | null;
  storeName: string | null;
  conditionMedia: string | null;
  conditionSleeve: string | null;
  marketMedian: string | null;
  marketLow: string | null;
  marketHigh: string | null;
  hasDiscogsRelease: boolean;
  journalEntry: { entry: string; entryDate: string } | null;
  note: string | null;
  imageCount: number;
  coverUrl: string | null;
  spineColour: string | null;
};

/** §1.3's mark: one line means not recorded, crossed means not applicable. */
function EmptyMark({ diagonal }: { diagonal: Exclude<Diagonal, 'none'> }) {
  return (
    <div
      aria-hidden="true"
      data-diagonal={diagonal}
      className="pointer-events-none absolute inset-0"
      style={{
        backgroundImage: [
          'linear-gradient(135deg,transparent calc(50% - 0.5px),oklch(0.15 0.005 60) calc(50% - 0.5px),oklch(0.15 0.005 60) calc(50% + 0.5px),transparent calc(50% + 0.5px))',
          ...(diagonal === 'crossed'
            ? [
                'linear-gradient(45deg,transparent calc(50% - 0.5px),oklch(0.15 0.005 60) calc(50% - 0.5px),oklch(0.15 0.005 60) calc(50% + 0.5px),transparent calc(50% + 0.5px))',
              ]
            : []),
        ].join(','),
      }}
    />
  );
}

export function RecordPage8a({ record }: { record: PageRecord }) {
  const modules = gridModules({
    catalogNumber: record.pressingLine === '' ? null : record.pressingLine,
    labelName: null,
    formatName: record.formatLine,
    countryPressed: null,
    releaseYear: record.releaseYear,
    yearPressed: record.yearPressed,
    genres: record.genres,
    purchasePrice: record.purchasePrice,
    storeName: record.storeName,
    conditionMedia: record.conditionMedia,
    conditionSleeve: record.conditionSleeve,
    marketMedian: record.marketMedian,
    marketLow: record.marketLow,
    marketHigh: record.marketHigh,
    marketFetchedAt: null,
    hasDiscogsRelease: record.hasDiscogsRelease,
    journalEntry: record.journalEntry,
  });
  const ladder = recordLadder(record.spineColour);

  /* §5.3: no cover means every mark falls back to ink, filled. */
  /**
   * The matrix line, broken on a token boundary.
   *
   * Slicing at a character count cut `<stamped>` into `<s tamped>` — a real
   * value made to look corrupt. Tokens are the slash-separated variants the
   * field actually holds, so the break falls where a reader expects one.
   */
  const matrix = (() => {
    const tokens = (record.matrixRunout ?? '').split(' / ').filter((t) => t !== '');
    if (tokens.length === 0) return { shown: '', hidden: 0 };

    const shown: string[] = [];
    let used = 0;
    for (const token of tokens) {
      if (used + token.length > 46 && shown.length > 0) break;
      shown.push(token);
      used += token.length + 3;
    }
    return { shown: shown.join(' / '), hidden: tokens.length - shown.length };
  })();

  const base = ladder?.base ?? INK;
  const tint = ladder?.tint ?? 'oklch(0.19 0.008 60 / 0.14)';

  /**
   * **Every cell that hosts a mark clips it, and that is one rule rather than
   * three adjustments.** A mark that paints its box is correct; a box that lets
   * it out is not. Three defects were the same class: diagonals running past
   * cell edges into neighbours, the about arc reading as an artefact because it
   * was clipped to a quarter by the wrong edge, and the sleeve's black block
   * half off the right edge reading as a crop.
   *
   * So containment lives on the host, asserted in
   * `e2e/page8a-marks.spec.ts` — no mark renders outside its cell on any of the
   * three records.
   */
  const cell = 'relative min-w-0 overflow-hidden p-[18px]';

  return (
    <div data-testid="record-page-8a" style={{ color: INK }}>
      {/* IDENTITY BAND — 4 / 3 / 5. */}
      <div
        data-band="identity"
        className="grid grid-cols-12 gap-0"
        style={{ height: BANDS.identity, borderBottom: `1px solid ${RULE}` }}
      >
        <div
          data-cell="identity"
          className="relative overflow-hidden"
          style={{ gridColumn: `span ${IDENTITY_SPANS[0]}`, borderRight: `1px solid ${RULE}` }}
        >
          {/*
            §5.1's triangle: tint, ground, anchored to the cell's RIGHT EDGE at
            mid-height.

            **Ground does not overlap content — it sits where content is not.**
            §5.5 makes tint ground, and at bottom-left this mark covered
            `Pressing`, the catalogue line and the format line by up to 132×16px.
            A z-index would have been a stacking fix for a placement problem, and
            shrinking would have traded the mark's presence for the collision
            without settling where a mark may sit.

            The identity cell's type occupies the left: the title flows from the
            top-left and the pressing block anchors bottom-left inside a 412px
            measure. The right edge past that measure is the corner the block
            does not reach, and `e2e/page8a-marks.spec.ts` asserts no mark's box
            contains type on any of the three records.
          */}
          <div
            data-mark="identityTriangle"
            aria-hidden="true"
            className="pointer-events-none absolute top-[175px] right-0 h-[150px] w-[56px]"
            style={{
              background: tint,
              clipPath: 'polygon(100% 0, 100% 100%, 0 50%)',
            }}
          />
          <IdentityCell
            title={record.title}
            artistName={record.artistName}
            pressingLine={record.pressingLine}
            formatLine={record.formatLine}
          />
        </div>

        {/* The construction, with its tint disc as ground. */}
        <div
          data-cell="still"
          className="relative overflow-hidden"
          style={{ gridColumn: `span ${IDENTITY_SPANS[1]}`, borderRight: `1px solid ${RULE}` }}
        >
          {/*
            The disc is drawn INSIDE the construction's own SVG (it is one of
            the generator's marks, at the tint step and never base), so nothing
            is added here — the cell only has to contain it.
          */}
          <ConstructionStill recordId={record.id} spineColour={record.spineColour} />
        </div>

        {/* The sleeve, with §5.1's base bar on its right edge. */}
        <div
          data-cell="sleeve"
          className="relative overflow-hidden"
          style={{ gridColumn: `span ${IDENTITY_SPANS[2]}` }}
        >
          {record.coverUrl === null ? (
            /* §5.3: a frame at paper luminance, never a filled rectangle. */
            <div className="absolute inset-[18px]" style={{ border: `1px solid ${RULE}` }} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={record.coverUrl} alt="" className="block h-full w-full object-cover" />
          )}
          <div
            data-mark="sleeveBar"
            className="absolute top-0 right-0 h-full w-[10px]"
            style={{ background: base }}
          />
          {/*
            Inside the bar, not straddling the frame edge. It anchors the
            construction (§5.1) and a mark half off the page reads as a crop.
          */}
          <div
            data-mark="sleeveBlock"
            className="absolute right-[10px] bottom-[18px] h-[46px] w-[46px]"
            style={{ background: INK }}
          />
        </div>
      </div>

      {/* RECORD BAND — 3 / 2 / 2 / 2 / 3. */}
      <div data-band="record" className="grid grid-cols-12 gap-0" style={{ height: BANDS.record }}>
        {/* Provenance. */}
        <div
          data-cell="provenance"
          className={cell}
          style={{ gridColumn: `span ${LOWER_SPANS[0]}`, borderRight: `1px solid ${RULE}` }}
        >
          <div className={LABEL}>Provenance</div>
          {modules.provenance.empty ? (
            <EmptyMark diagonal="single" />
          ) : (
            <>
              {/*
                §5.1's provenance arc: tint, ground, bottom-right. Suppressed
                when the cell is empty (§5.4) — a decorated empty cell reads as
                a designed state rather than as a gap the reader can fill.
              */}
              <div
                data-mark="provenanceArc"
                aria-hidden="true"
                className="pointer-events-none absolute right-[14px] bottom-[14px] h-[96px] w-[96px] rounded-full"
                style={{ background: tint }}
              />
              {record.purchasePrice !== null && (
                <div className="text-prose">Paid ${record.purchasePrice}</div>
              )}
              {record.storeName !== null && (
                <div className="text-prose">at {record.storeName}</div>
              )}
              {record.conditionMedia !== null && (
                <div className="text-prose">
                  {record.conditionMedia} media
                  {record.conditionSleeve !== null && `, ${record.conditionSleeve} sleeve`}
                </div>
              )}
            </>
          )}
        </div>

        {/* Matrix / runout — mono, because a character matters. */}
        <div
          data-cell="matrix"
          className={cell}
          style={{ gridColumn: `span ${LOWER_SPANS[1]}`, borderRight: `1px solid ${RULE}` }}
        >
          <div className={LABEL}>Matrix / runout</div>
          {record.matrixRunout === null ? (
            <EmptyMark diagonal="single" />
          ) : (
            <div className="font-mono text-[12px] leading-[1.5]">
              {/*
                Broken on a TOKEN boundary, never mid-word: a 44-character slice
                cut `<stamped>` into `<s tamped>`, which reads as corruption
                rather than truncation. The count follows, the way 8a already
                shows variants.
              */}
              {matrix.shown}
              {matrix.hidden > 0 && (
                <div className={`${LABEL} mt-[8px]`} style={{ color: INK }}>
                  {matrix.hidden + 1} variants
                </div>
              )}
            </div>
          )}
        </div>

        {/* Release year: the one mark carrying type, always filled. */}
        {/*
          **Labelled as the mark it is.** §5.1 counts the release-year field
          among its seven, and it was drawn as a cell background with no
          `data-mark` — so an audit of the marks could not see it and the colour
          budget could not be measured. A mark that happens to be implemented as
          a background is still a mark.
        */}
        <div
          data-cell="year"
          data-mark="releaseYearField"
          className="relative flex min-w-0 flex-col justify-end overflow-hidden p-[18px]"
          style={{
            gridColumn: `span ${LOWER_SPANS[2]}`,
            borderRight: `1px solid ${RULE}`,
            background: base,
          }}
        >
          {/*
            **The 72's position is what must not move**, so the label shortens
            rather than the field growing: at 2 columns (240px) less 36px of
            padding, "Released · pressed same year" wrapped to two lines and
            pushed the page's largest mark down. `whitespace-nowrap` makes a
            future overflow visible instead of silently reflowing the figure.
          */}
          <div className={`${LABEL} whitespace-nowrap`} style={{ color: INK }}>
            {modules.pressing.pressedSameYear ? 'Released · same year' : 'Released'}
          </div>
          <div className="text-[72px] leading-[0.86] font-extrabold">{record.releaseYear}</div>
        </div>

        {/* Market median: the only 40, and the one number the owner does not control. */}
        <div
          data-cell="market"
          className="relative flex min-w-0 flex-col justify-end overflow-hidden p-[18px]"
          style={{ gridColumn: `span ${LOWER_SPANS[3]}`, borderRight: `1px solid ${RULE}` }}
        >
          <div className={LABEL}>Market median</div>
          {modules.market.empty ? (
            <EmptyMark diagonal={modules.market.diagonal === 'crossed' ? 'crossed' : 'single'} />
          ) : (
            <>
              <div className="text-[40px] leading-none font-extrabold">${record.marketMedian}</div>
              {record.marketLow !== null && (
                <div className="mt-[6px] font-mono text-[10px] text-[oklch(0.55_0.008_60)]">
                  ${record.marketLow}–${record.marketHigh}
                </div>
              )}
            </>
          )}
        </div>

        {/* Journal and About: the 2px derived edge, the only non-grey rule. */}
        {/*
          The journal's 2px derived edge — §3's only non-grey rule and only 2px
          edge. Labelled for the same reason as the year field above.
        */}
        <div
          data-cell="journal"
          data-mark="journalEdge"
          className={cell}
          style={{ gridColumn: `span ${LOWER_SPANS[4]}`, borderRight: `2px solid ${base}` }}
        >
          <div className={LABEL}>Journal</div>
          {modules.journal.empty ? (
            <>
              <EmptyMark diagonal="single" />
              <div className={`${LABEL} relative mt-[10px]`} style={{ color: INK }}>
                Add entry
              </div>
            </>
          ) : (
            <div className="text-prose">{record.journalEntry?.entry}</div>
          )}
          {record.note !== null && (
            <>
              <div
                className="mt-[14px] mb-[8px] w-[220px]"
                style={{ borderTop: `1px solid ${RULE}` }}
              />
              <div className={LABEL}>About</div>
              <div className="text-prose">{record.note}</div>
            </>
          )}
          {/* §5.1's tint arc, suppressed when the cell is empty (§5.4). */}
          {!modules.journal.empty && (
            <div
              data-mark="aboutArc"
              aria-hidden="true"
              className="absolute right-[14px] bottom-[14px] h-[76px] w-[76px] rounded-full"
              style={{ background: tint }}
            />
          )}
        </div>
      </div>

      {/* The tail is paper, not a footer. */}
      <div data-band="tail" style={{ height: BANDS.tail }} />
    </div>
  );
}
