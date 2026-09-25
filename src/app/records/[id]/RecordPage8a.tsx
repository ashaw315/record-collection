import { BANDS, CONTENT_MEASURE, GRID_COLUMN, GRID_COLUMNS, GRID_FORK, IDENTITY_SPANS, LOWER_SPANS, STILL_MARGIN } from './band-geometry';
import { regionStylesheet, widePageStylesheet } from './region-rows';
import { CONTROL_HEIGHT } from './extended-grid';
import { COVER_CELL } from './cover-geometry';
import { STRIP_SPLIT, coverSquare, leftoverStrip } from './cover-33';
import { MatrixSolid } from './MatrixSolid';
import { CELL_PADDING } from './extended-grid';
import { BAR_BOTTOM, BLOCK_BOTTOM, COVER, COVER_COLUMN, COVER_PAD } from './cover-geometry';
import { ConstructionStill } from './ConstructionStill';
import { IdentityCell } from './IdentityCell';
import { gridModules, type Diagonal } from './grid-modules';
import { project } from './construction';
import { LABEL, LABEL_INK } from './grid-type';
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
  /* For the collection link — §10's "what else do I have by this artist". */
  artistId: string;
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

/**
 * §5.4's small solid: one box in the construction's own projection, at a
 * fraction of its scale, anchored to the matrix cell's empty lower half.
 *
 * Drawn from the same `project()` the construction uses rather than as a flat
 * shape, so it reads as the same vocabulary — the difference between one system
 * and two.
 */
/*
  **`IsoMark` is deleted.** It drew three faces at three opacities and was used
  only by §5.1's three edge fields, which are flat planes — so it was the
  mechanism by which a withdrawn ruling kept rendering. `MatrixSolid` still
  draws the one in-cell solid the frame keeps; nothing else needs a generic
  isometric helper, and leaving one invites the same substitution again.
*/

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
    /*
      Capped and centred, with paper bleeding past it. The wrapper is the page's
      only element that knows about the viewport; everything inside is the grid
      8a specifies at a width it specifies.

      **Redundant on `/records/[id]` and kept deliberately.** The route now caps
      the whole composition — frame and §9 region together — so §9.1's section
      rules bleed to the same edge this does. This cap still governs where the
      component renders alone, which is `/wall/probe/page8a`; removing it would
      leave the probe uncapped and make the two disagree about the composition's
      width.
    */
    <div
      data-testid="record-page-8a"
      className="mx-auto"
      /*
        **The cap is in the stylesheet, not inline.** §30 lifts it to 1920
        above 1440, and an inline `max-width` beats every rule that lacks
        `!important` — the same defect that made §28's breakpoints silently
        do nothing when sections were placed inline. `GRID_FORK` remains the
        cap up to 1679, stated in `widePageStylesheet`.
      */
      style={{ color: INK }}
    >
      {/*
        **§18: the type never moves, the grid does.**

        The bands are `repeat(12, 120px)` — FIXED, not fractions — so the page
        does not stretch and does not squeeze. §7 specifies nothing below 1440,
        so a fluid grid was asking a fixed composition to be a fluid one, and
        the 93px identity cell was reporting that question rather than a layout
        to repair.

        Below the fork the twelve columns become one and every cell spans it.
        A stylesheet rather than measurement: the server has no viewport, so a
        JavaScript fork would render the wrong composition first and correct it
        after hydration — and this page must be right on the first paint.

        The content track floors at §4.2's own measure (`CONTENT_MEASURE`), and
        below 480 the measure yields to the column's inner width, which is
        §4.2's give order's fourth term. `min()` states that as one rule rather
        than a second breakpoint: 412 where there is room, the column's inner
        width where there is not.
      */}
      <style>{`
        [data-band] { grid-template-columns: repeat(${GRID_COLUMNS}, ${GRID_COLUMN}px) !important; }
        [data-track="content"] { width: ${CONTENT_MEASURE}px; max-width: 100%; }
        @media (max-width: ${GRID_FORK - 1}px) {
          /*
            **The band keeps its fixed height to 480 (§28).** "The band stays
            at 547 above 480... Below 480 the band has no fixed height at
            all, so there the height give order does not apply." This rule
            carried height: auto from 1440 down, which is 960px of range
            where §28 says the height is fixed — and it made the identity
            cell shrink-wrap, so demand equalled supply exactly and the
            genres collapse could not tell 45px of slack from 2px over.
          */
          [data-band] { grid-template-columns: 1fr !important; }
          [data-band] > [data-cell] { grid-column: 1 / -1 !important; }
          [data-band="section"] > * { grid-column: 1 / -1 !important; }
          [data-cell="still"], [data-cell="sleeve"] { display: none; }
          [data-track="content"] { width: min(${CONTENT_MEASURE}px, 100vw - ${CELL_PADDING * 2}px); }
        }

        /*
          §28: below 480 the band has no fixed height, so the cell grows to
          its content and the height give order stops applying. That is the
          one range where auto is correct.
        */
        @media (max-width: 479px) {
          [data-band] { height: auto !important; }
        }

        /*
          §28's breakpoints for the lower region, GENERATED from the same
          table region-rows.ts states and the unit tests assert. Four widths
          × eight sections × two air columns is fifty-odd placements; hand
          written they would be a second copy of §28's list, and the drift
          would show only as a layout nobody measured.
        */
        ${regionStylesheet()}

        /*
          §30's page above 1440: 14 columns from 1680, 16 from 1920, the page
          taking the window up to that ceiling, and the upper band keeping its
          share of the viewport's height with the extra going to the
          construction. Generated for the same reason as the region's blocks.
        */
        ${widePageStylesheet()}

        /*
          §28's 44px touch floor: "the hit area is padded out to 44 while the
          drawn type stays the same size."

          **The drawn box must not grow, and two attempts grew it.** An
          ::after overlay reaching 44px around each control covered the
          controls beside it, so a tap near a row of chips landed on whichever
          overlay came last in the DOM. Then min-height grew the box itself —
          and §9.2 rules the journal's date field 34px with its underline at
          the bottom, so a 44px box moves a mark whose position is ruled
          (caught by extended-grid's field-height claim).

          So the hit area is an overlay that extends only VERTICALLY, never
          past the control's own width, and sits behind the control rather
          than over it. A neighbour in the same row is beside it horizontally,
          so a vertical-only extension cannot reach one; a neighbour above or
          below is separated by more than 5px of the cell's own 34px padding.
          The drawn box, its height and its underline are untouched.
        */
        [data-section] :is(a, button, select, input, label),
        [data-cell="air"] :is(a, button, select, input, label) { position: relative; }
        [data-section] :is(a, button, select, input, label)::before,
        [data-cell="air"] :is(a, button, select, input, label)::before {
          content: '';
          position: absolute;
          left: 0;
          right: 0;
          top: 50%;
          height: ${CONTROL_HEIGHT}px;
          transform: translateY(-50%);
          /*
            No z-index: the overlay is in the control's own stacking context
            and paints under its text by source order, so it takes the tap
            without hiding the type. z-index: -1 put it behind the cell's
            background, where elementFromPoint never reached it.
          */
        }
      `}</style>
      {/* IDENTITY BAND — 4 / 3 / 5. */}
      <div
        data-band="identity"
        className="grid grid-cols-12 gap-0"
        style={{ height: BANDS.identity, borderBottom: `1px solid ${RULE}` }}
      >
        <div
          data-cell="identity"
          /* §27: the response to overflow is the collapse, never overflow-hidden. */
          className="relative"
          style={{ gridColumn: `span ${IDENTITY_SPANS[0]}`, borderRight: `1px solid ${RULE}` }}
        >
          <IdentityCell
            title={record.title}
            artistName={record.artistName}
            artistId={record.artistId}
            pressingLine={record.pressingLine}
            formatLine={record.formatLine}
            genres={record.genres}
            editHref={`/records/${record.id}/edit`}
            /*
              §5.1's triangle: tint, ground, in the cell's corner FIELD.

              **Ground does not overlap content — it sits where content is
              not.** §5.5 makes tint ground, and at bottom-left this mark
              covered `Pressing`, the catalogue line and the format line by up
              to 132×16px. A z-index would have been a stacking fix for a
              placement problem, and shrinking would have traded the mark's
              presence for the collision without settling where a mark may sit.

              **Passed as the ornament rather than positioned against the
              cell.** It was `absolute` at a fixed 112px height, which is why
              the reserve could not yield: an absolute box is out of flow and
              shares space with nothing. It now fills a track that shrinks by
              what the content takes, so the mark is displaced rather than
              overlapped — and `e2e/page8a-marks.spec.ts` still asserts no
              mark's box contains type on any of the three records.
            */
          />
        </div>

        {/* The construction, with its tint disc as ground. */}
        {/*
          **Exactly one crosser, one edge.** The construction's forms reach into
          the title cell, and the hairline stays drawn at full strength
          underneath — a grid that breaks for what crosses it is not a grid, and
          a crossing that nothing resists is not a crossing. `overflow-visible`
          on this cell only; every other cell still clips.
        */}
        <div
          data-cell="still"
          className="relative h-full min-h-0 overflow-hidden"
          style={{
            gridColumn: `span ${IDENTITY_SPANS[1]}`,
            borderRight: `1px solid ${RULE}`,
            /*
              §26: forms and disc together at the build's fit, INSIDE the
              cell's 24px margin — the inner box is 432 × 499, and the SVG
              fills that box, so `meet` fits the shared frame to it by the
              smaller of the two ratios.
            */
            padding: STILL_MARGIN,
          }}
        >
          {/*
            The disc is drawn INSIDE the construction's own SVG (it is one of
            the generator's marks, at the tint step and never base), so nothing
            is added here — the cell only has to contain it.
          */}
          <ConstructionStill recordId={record.id} spineColour={record.spineColour} />
        </div>

        {/*
          **§23's cover cell: 26 + 414 + 10 + 30, ruled rather than left to the
          span.** The cover is 414 square at (26, 26). The sleeve bar and the
          black block share ONE 30px column at the cell's right edge — bar
          above, block below — which is how the supplied render draws them.
          They had been drawn side by side, needing 58px beside the cover that
          a 480 cell does not have.

          Absolutely placed against the ruled figures rather than laid out by
          flex, because §23 gives coordinates and a flex row would derive them
          from the cover's size — a square source lands in the same place
          either way, but a rule stated as positions is checked as positions.

          **Fitted, not cropped** survives: `object-contain` on a 414 square.
          The paper below the cover is the band's, as in the render, and
          carries nothing.

          The bar runs 26 → 398 and the block 398 → 544, §23's figures as
          written. 544 sits inside the 547 band; the 3px of bottom padding
          against 26 at the top is the open input Design has been asked to
          settle, and it is recorded in `cover-geometry.ts` rather than closed
          here.
        */}
        {/*
          **§33: the cover is the largest square its cell holds.**

          "Flush to the cell's top, left and right, and never cropped. At 1440
          the cell is 480 × 547, so the cover is 480 × 480 and a 67px strip
          remains beneath it. The column that sat beside the cover rotates
          into that strip: the base bar and the black block keep their order
          and proportions, now horizontal."

          This replaces §23's 26 + 414 + 10 + 30 closure of the cell, which
          sized the cover for a column standing beside it. The square goes
          414 → 480 and the column lies down.
        */}
        <div
          data-cell="sleeve"
          className="relative overflow-hidden"
          style={{ gridColumn: `span ${IDENTITY_SPANS[2]}` }}
        >
          {(() => {
            const cell = { width: COVER_CELL, height: BANDS.identity };
            const square = coverSquare(cell);
            const strip = leftoverStrip(cell);
            const along = strip.orientation === 'horizontal' ? strip.width : strip.height;
            const barAlong = along * STRIP_SPLIT.bar;

            return (
              <>
                {record.coverUrl === null ? (
                  /* §5.3: a frame at paper luminance at the square's exact size, never a filled rectangle. */
                  <div
                    data-mark="coverFrame"
                    className="absolute"
                    style={{ left: square.x, top: square.y, width: square.size, height: square.size, border: `1px solid ${RULE}` }}
                  />
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    data-cover=""
                    src={record.coverUrl}
                    alt=""
                    className="absolute block object-cover"
                    style={{ left: square.x, top: square.y, width: square.size, height: square.size }}
                  />
                )}

                {/*
                  The bar and the block, lying in the strip. Order preserved:
                  the bar leads, as it sat above the block in the column.
                */}
                <div
                  data-mark="sleeveBar"
                  className="absolute"
                  style={
                    strip.orientation === 'horizontal'
                      ? { left: strip.x, top: strip.y, width: barAlong, height: strip.height, background: base }
                      : { left: strip.x, top: strip.y, width: strip.width, height: barAlong, background: base }
                  }
                />
                <div
                  data-mark="sleeveBlock"
                  className="absolute"
                  style={
                    strip.orientation === 'horizontal'
                      ? { left: strip.x + barAlong, top: strip.y, width: along - barAlong, height: strip.height, background: INK }
                      : { left: strip.x, top: strip.y + barAlong, width: strip.width, height: along - barAlong, background: INK }
                  }
                />
              </>
            );
          })()}
        </div>
      </div>

      {/* RECORD BAND — 3 / 2 / 2 / 2 / 3. */}
      {/*
        **The grid closes.** §3 puts a 1px rule on "every structural edge", and
        the bottom of the lower band is one — without it the last thing on the
        page is nothing, and nothing is also what a page that failed to load
        shows. The rule sits on the BAND rather than in the tail, because §2.1
        is explicit that "the tail is paper, not a footer; nothing is drawn in
        it".
      */}
      <div
        data-band="record"
        className="grid grid-cols-12 gap-0"
        style={{ height: BANDS.record, borderBottom: `1px solid ${RULE}` }}
      >
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
              {/*
                **§5.1's quarter-circle: a FLAT plane.** It bleeds off the
                record band's left end, so it touches a page edge and the frame
                rule sends it flat — one fill, one corner rounded, no faces.

                No inset: it was `right-14 bottom-14`, which is a mark NEAR an
                edge rather than one touching it, and the rule turns on
                touching. A quarter-circle held 14px clear of the corner is a
                disc with two sides hidden.
              */}
              <div
                data-mark="provenanceArc"
                aria-hidden="true"
                className="pointer-events-none absolute bottom-0 left-0 h-[112px] w-[112px]"
                style={{ background: tint, borderTopRightRadius: '100%' }}
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
          {/*
            **§5.4's second rendered still**, and it was simply never built:
            "the isometric still in the identity band and the small solid in
            Matrix are record-independent artwork". It sits in the cell's empty
            lower half, in the construction's own vocabulary at a fraction of
            the scale — which is what makes the page one system rather than an
            isometric cell surrounded by flat shapes.

            Record-independent, so it does not recolour: a neutral solid on
            every record, like the still it belongs with.
          */}
          {record.matrixRunout !== null && (
            <MatrixSolid />
          )}
          {record.matrixRunout === null ? (
            <EmptyMark diagonal="single" />
          ) : (
            <div data-matrix-text="" className="font-mono text-[12px] leading-[1.5]">
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
        {/*
          **The label sits directly ON the 72, with nothing between them.**

          §4: "11px mono label directly above the 72 in the release-year field
          ... small first, large beneath, NO INTERVENING ELEMENT." Justifying to
          the cell's end put a ~200px gap between them, which is the adjacency
          device broken in the one place the page's largest mark sits — the
          render's year field is a wide short band with the label immediately
          above the figure, and ours was a tall square with its content dropped
          to the floor.

          The pair is centred as a block, so the field reads as a band carrying
          a figure rather than a square with something at the bottom.
        */}
        <div
          data-cell="year"
          data-mark="releaseYearField"
          className="relative flex min-w-0 flex-col justify-center overflow-hidden p-[18px]"
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
          {/*
            §5.3: on the record with no cover the field falls back to ink, and
            the label and figure reverse to paper. **Both**, and by the page's
            own ground token — a label left at INK here was measured at 1.00:1
            on the one record the E2E seed produces by default.
          */}
          <div
            className={`${LABEL} whitespace-nowrap ${ladder === null ? 'text-background' : ''}`}
            style={ladder === null ? undefined : { color: INK }}
          >
            {modules.pressing.pressedSameYear ? 'Released · same year' : 'Released'}
          </div>
          {/*
            **A reserved box, where the padding yields before the glyph does.**
            At 1440 the cell is 240px, the padding 36px and a four-digit year at
            72pt is 203px — 1px of slack. The figure filling its field is
            intended; one pixel of proof is a coincidence, so the box is stated
            rather than left to arithmetic that happens to fit.
          */}
          <div
            data-field="year"
            className={`text-[72px] leading-[0.86] font-extrabold ${ladder === null ? 'text-background' : ''}`}
            style={{ minWidth: '203px', marginInline: '-18px', paddingInline: '18px' }}
          >
            {record.releaseYear}
          </div>
        </div>

        {/* Market median: the only 40, and the one number the owner does not control. */}
        <div
          data-cell="market"
          className="relative flex min-w-0 flex-col justify-center overflow-hidden p-[18px]"
          style={{ gridColumn: `span ${LOWER_SPANS[3]}`, borderRight: `1px solid ${RULE}` }}
        >
          <div className={LABEL}>Market median</div>
          {modules.market.empty ? (
            <EmptyMark diagonal={modules.market.diagonal === 'crossed' ? 'crossed' : 'single'} />
          ) : (
            <>
              <div className="text-[40px] leading-none font-extrabold">${record.marketMedian}</div>
              {record.marketLow !== null && (
                <div className="mt-[6px] font-mono text-[10px]" style={{ color: LABEL_INK }}>
                  ${record.marketLow}–${record.marketHigh}
                </div>
              )}
            </>
          )}
        </div>

        {/* About: the 2px derived edge, the only non-grey rule. */}
        {/*
          The journal's 2px derived edge — §3's only non-grey rule and only 2px
          edge. Labelled for the same reason as the year field above.
        */}
        <div
          data-cell="note"
          /*
            **The mark keeps its name.** `journalEdge` is the 2px derived edge
            at the band's right end, and the name is load-bearing —
            `mark-boxes.ts` keys its step and suppression off it, and three
            specs classify it by it. The CELL changed what it holds; the edge is
            the same mark in the same position, so renaming it would have been
            a cosmetic change that cost six call sites.
          */
          data-mark="journalEdge"
          className={cell}
          style={{ gridColumn: `span ${LOWER_SPANS[4]}`, borderRight: `2px solid ${base}` }}
        >
          {/*
            **The journal has left the frame.** It has its own §9 section at the
            bottom of the page, so the frame does not need a cell for it — and
            this cell was drawing two facts at once: a journal entry, then an
            `About` rule with the owner's note under it.

            What stays is the note, which is what the markup already pointed at.
            The snippet is a DIFFERENT fact — a separate column carrying §10b's
            generated text — and lives in its own section.

            **Labelled `NOTE`, not `About this record`.** Both surfaces carried
            those words for one round while holding different columns. The
            frame's labels are field names — PRESSING, PROVENANCE, MATRIX — and
            NOTE is that register; the §9 section keeps `About this record`,
            and its own "Written by Claude" line carries the attribution, so a
            possessive here would buy nothing and be the only one in a frame
            that belongs to the record.

            §8.1's trigger goes with the entry. Its rule forbids a form's submit
            from sharing a label with the trigger that opened it; with no cell
            here there is no trigger, so the rule is vacuous rather than
            violated and the section keeps `Save entry`. The journal is reached
            by scrolling to it, not by a control.
          */}
          {/*
            **§33 returns the journal to this cell**, reversing the clause
            above. "The lower frame's last cell carries the journal. It shows
            the latest entry's date and its text, clamped to four lines, and
            the Images N Manage → line stays at the cell's foot, where it
            fits. With no entry the cell shows the owner's note, and with
            neither, §6's diagonal."

            Three states in a fixed order, so the cell always says the most
            specific thing it has. §33 names the consequence rather than
            hiding it: "journal and note are both empty on sixteen of
            seventeen records today, so the diagonal still fires on most of
            the collection. That is §8.1's constant-because-unfilled, a state
            the app expects to leave, not a defect of the cell."
          */}
          <div className={LABEL}>{record.journalEntry !== null ? 'Journal' : 'Note'}</div>
          {record.journalEntry !== null ? (
            <>
              <div className={`${LABEL} mt-[6px]`} style={{ color: LABEL_INK }}>
                {record.journalEntry.entryDate}
              </div>
              {/*
                Clamped to four lines, per §33. `line-clamp` rather than a
                character cut: the limit is lines on this measure, which only
                the browser knows, and a cut string would break mid-word.
              */}
              <div
                data-field="journal-entry"
                className="text-prose mt-[6px] overflow-hidden"
                style={{
                  display: '-webkit-box',
                  WebkitBoxOrient: 'vertical',
                  WebkitLineClamp: 4,
                }}
              >
                {record.journalEntry.entry}
              </div>
            </>
          ) : record.note === null ? (
            <EmptyMark diagonal="single" />
          ) : (
            <div className="text-prose">{record.note}</div>
          )}

          {/*
            **`Images N Manage →` — the count, and a link to its editor.**

            `imageCount` was declared, passed by the route, carried by the
            probe's fixtures, and never read: a field with no consumer. §9.4
            marked Images on the ground "the frame shows a count, never the
            images", and for two days it showed neither.

            Kept where the acquisition date was struck, and the rule splits on
            WHY a constant is constant. purchase_date is constant because the
            app abandoned the field — nothing will ever write it, so a mark can
            only be texture. The image count is constant because the collection
            is unphotographed: the schema carries cover, gatefold left, gatefold
            right and back, so one image per record is a backlog rather than a
            ceiling. A rule that reads texture from an UNFILLED field measures
            the backlog rather than the design.

            Same vocabulary as the genres count — a fact that exists and is not
            shown, with the control that shows it — and §6 requires absence to
            be visible rather than silent, so a count of 0 is drawn too.
          */}
          {/*
            **§3's second inset hairline, 220px** — the one over `Images`,
            declared alongside the identity block's 372 and never drawn.
            §16 settles that it stays inset on §3's MODULE axis: the note and
            the `Images N Manage →` line are both inside the About cell, so
            the rule separates two things within one module rather than two
            modules. §3 names the failure mode as extending it to the cell
            edge, "which silently promotes a paragraph break into a division",
            so the 220 is the ruling and not a starting point.
          */}
          <div
            data-line="about-images"
            className="mt-[14px] w-[220px] max-w-full"
            style={{ borderTop: `1px solid ${RULE}` }}
          />
          <div className={`${LABEL} relative mt-[14px]`} style={{ color: INK }}>
            Images{' '}
            <span data-field="image-count" className="font-mono">
              {record.imageCount}
            </span>{' '}
            <a href="#images" className="underline underline-offset-2">
              Manage →
            </a>
          </div>
          {/*
            §5.1's second quarter-circle, bleeding off the band's right end.
            Flat for the same reason as the first — it touches a page edge —
            and rounded on the corner that faces into the page. Suppressed when
            the cell is empty (§5.4): a decorated empty cell reads as a designed
            state rather than as a gap the reader can fill — and the cell's
            content is the NOTE now, so its emptiness is the note's absence
            rather than the journal's.
          */}
          {record.note !== null && (
            <div
              data-mark="aboutArc"
              aria-hidden="true"
              className="pointer-events-none absolute right-0 bottom-0 h-[112px] w-[112px]"
              style={{ background: tint, borderTopLeftRadius: '100%' }}
            />
          )}
        </div>
      </div>

      {/* The tail is paper, not a footer. */}
      <div data-band="tail" style={{ height: BANDS.tail }} />
    </div>
  );
}
