import Link from 'next/link';
import { BANDS, CONTENT_MEASURE, GRID_COLUMN, GRID_COLUMNS, GRID_FORK, IDENTITY_SPANS, LOWER_SPANS, STILL_MARGIN } from './band-geometry';
import { BAND_AT_REFERENCE, REFERENCE_HEIGHT, regionStylesheet, widePageStylesheet } from './region-rows';
import { Plane } from './Plane';
import { Flat } from './OrnamentMarks';
import { FLATS } from './ornament';
import { CONTROL_HEIGHT } from './extended-grid';
import { STRIP_SPLIT } from './cover-33';
import { LADDER_SUPPLY } from './title-steps';
import { MatrixSolid } from './MatrixSolid';
import { AboutCell } from './AboutCell';
import { ENTRY_LINES, aboutCellState } from './about-cell';
import { CELL_PADDING } from './extended-grid';
import { COVER, COVER_COLUMN, COVER_PAD } from './cover-geometry';
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
  /** §10b's snippet, stored in `records.snippet`; §33 calls it the About. */
  about: string | null;
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
  /*
    §6: "Label persists, one diagonal fills the body box." It was `absolute
    inset-0` of the cell, so the line crossed the label -- measured on the
    collection's real rows, where 12 of 17 have neither About nor entry.
    In flow after the label, it takes the body: the cell's remainder where
    the band fixes the height, one prose line where content sizes the cell.
  */
  return (
    <div
      aria-hidden="true"
      data-diagonal={diagonal}
      className="pointer-events-none relative min-h-[1lh] flex-1 text-prose"
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

/**
 * `writingConfigured`: whether the deployment can write an About (a real
 * Anthropic key). §36: the absence state offers the row with "Write one ↓"
 * only then -- "an offer that cannot be taken up is not an offer" -- and
 * which form renders "follows the same key that decides whether the row's
 * button renders".
 */
export function RecordPage8a({ record, writingConfigured = false }: { record: PageRecord; writingConfigured?: boolean }) {
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
  /* §28: row 1's figure, moved up into the upper band's air at 8 columns. */

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
  /* A column, so an empty cell's diagonal can fill the body box below the label (§6) without a measured top. */
  const cell = 'relative flex min-w-0 flex-col overflow-hidden p-[18px]';

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
        [data-upper-air] { display: none; }
        /*
          **Structural verticals live here, per fork, never inline.** §3's
          rule sits on "every structural edge" and §33's on the boundary
          between two cells; a rule whose neighbour is the page's edge divides
          nothing. Inline, the 1440 rule stayed on every stacked cell below
          the fork: measured at 1000, the record band's provenance, matrix,
          year and market each ran a 1px rule down the page's right edge.
          The journal edge keeps its inline 2px: §3 rules that mark "at the
          band's right end", which is the page's edge at 1440 by its own
          ruling, so it is not this defect.
        */
        [data-band="identity"] > [data-cell="identity"], [data-band="identity"] > [data-cell="still"], [data-band="record"] > [data-cell] { border-right: 1px solid ${RULE}; }
        /*
          **§33's cover, per breakpoint (steps 44 and 45).** "The cover is the
          largest square its cell holds", and the bar and block fill what it
          leaves. The marks were absolute pixels inside a 480 × 546 wrapper,
          so the square was 480 wherever the cell was. The cell is now a size
          container: the square is min(100cqw, 100cqh); where the cell is
          wider than tall the strip stands beside the square with the bar
          above the block, and where it is taller the strip lies beneath with
          the bar leading -- §33's rotation, decided by the cell's own aspect.
          The bar takes §23's share along the strip (cover-33's STRIP_SPLIT).
        */
        [data-cell="sleeve"] { container-type: size; }
        [data-cell="sleeve"] > [data-scale] { position: absolute; inset: 0; }
        [data-cell="sleeve"] [data-cover], [data-cell="sleeve"] [data-mark="coverFrame"] { position: absolute; left: 0; top: 0; width: min(100cqw, 100cqh); height: min(100cqw, 100cqh); }
        [data-cell="sleeve"] [data-mark="sleeveBar"], [data-cell="sleeve"] [data-mark="sleeveBlock"] { position: absolute; }
        @container (min-aspect-ratio: 1 / 1) {
          [data-mark="sleeveBar"] { left: 100cqh; top: 0; width: calc(100cqw - 100cqh); height: calc(100cqh * ${STRIP_SPLIT.bar}); }
          [data-mark="sleeveBlock"] { left: 100cqh; top: calc(100cqh * ${STRIP_SPLIT.bar}); width: calc(100cqw - 100cqh); height: calc(100cqh * ${STRIP_SPLIT.block}); }
        }
        @container (max-aspect-ratio: 1 / 1) {
          [data-mark="sleeveBar"] { left: 0; top: 100cqw; width: calc(100cqw * ${STRIP_SPLIT.bar}); height: calc(100cqh - 100cqw); }
          [data-mark="sleeveBlock"] { left: calc(100cqw * ${STRIP_SPLIT.bar}); top: 100cqw; width: calc(100cqw * ${STRIP_SPLIT.block}); height: calc(100cqh - 100cqw); }
        }
        @media (max-width: ${GRID_FORK - 1}px) {
          /* One column of full-width cells (§28): no cell has a neighbour on its right. The still ends the identity row at 8 columns. */
          [data-band="record"] > [data-cell], [data-band="identity"] > [data-cell="still"] { border-right-width: 0; }
          /*
            **The band keeps its fixed height to 480 (§28).** "The band stays
            at 547 above 480... Below 480 the band has no fixed height at
            all, so there the height give order does not apply." This rule
            carried height: auto from 1440 down, which is 960px of range
            where §28 says the height is fixed — and it made the identity
            cell shrink-wrap, so demand equalled supply exactly and the
            genres collapse could not tell 45px of slack from 2px over.
          */
          /*
            **Columns are set per band, by name -- the same rule §28 states
            for height.** The first fork collapsed EVERY band to one column
            through the shared [data-band] selector, so the record band's
            provenance cell came out 1000 × 72 under a 112px mark, and the
            still and sleeve were hidden rather than wrapped. Measured on
            Adam's own server at 1000: provenanceArc in front of the
            PROVENANCE label and the condition line on every record.

            **The identity band wraps (§28, step 20).** "The upper cells keep
            their size and wrap in order... At 8 columns, the first two cells
            sit side by side and the third takes a second row, with 480 of
            air beside it. At 4 columns the three cells stack. Below 480
            there is one fluid column." Each row keeps the band's 547; the
            band is as tall as its rows. The air beside the third cell
            carries "the lower region's first figure and the tint field" --
            that move is not built here; the slot is empty.

            **The record band is one column of full-width cells below the
            fork (§28).** "Twelve-column spans on fluid columns cut the 72px
            year from 480 to 1439, so the grouping does not reshape either."
            Its cells are 72-92px tall there, and §34 rules and accepts what
            that does to §5.1's arcs: sized to two-thirds of such a host they
            still cover the cell's text, so no quarter-circle is drawn below
            1440 -- "which is ruled and accepted" (step 32). Plane.tsx makes
            that decision per record at render; nothing here suppresses.
          */
          /*
            §41 (step 46): from 960 to 1439 each upper track is half the page
            and the band stays 547. §28's two 480 tracks held here, and the
            page's gain sat unassigned right of the construction: 40 at 1000,
            240 at 1200, 479 at 1439 -- that unassigned width was the defect
            (28/band-pinned-547). The cover cell is then W / 2 by 546, so its
            square is width-bound to about 1092 and height-bound at 546 above.
            The band's height is not the page's: 547 × W / 1440 was drafted and
            withdrawn within §41 (41/band-scaled-by-width).
          */
          [data-band="identity"] { grid-template-columns: repeat(2, 50%) !important; grid-auto-rows: ${BANDS.identity - 1}px; height: ${2 * BANDS.identity}px !important; }
          [data-band="identity"] > [data-cell] { grid-column: span 1 !important; }
          /*
            Step 39 (§37): the air LEFT of the sleeve in the second row, by
            grid placement only -- the markup and the reading order keep the
            sleeve before the air -- so the tint triangle bleeds off the
            page's left edge as §26 places it, not at a cell edge against the
            sleeve. Explicit rows, never order: a reader tabbing through
            the band meets the sleeve's cover before the air's ornament.
          */
          /* Specificity above the band's own span-1 rule ([data-band] > [data-cell]), which otherwise auto-places both. */
          [data-band="identity"] > [data-upper-air] { display: block; grid-row: 2 !important; grid-column: 1 !important; }
          [data-band="identity"] > [data-cell="sleeve"] { grid-row: 2 !important; grid-column: 2 !important; }
          [data-band="record"] { grid-template-columns: 1fr !important; }
          [data-band="record"] > [data-cell] { grid-column: 1 / -1 !important; }
          @media (max-width: 959px) {
            [data-band="identity"] { grid-template-columns: ${GRID_FORK / 3}px !important; height: ${3 * BANDS.identity}px !important; }
            /* Stacked (§28): the identity cell is alone in its row too. */
            [data-band="identity"] > [data-cell="identity"] { border-right-width: 0; }
            [data-band="identity"] > [data-upper-air] { display: none; }
            [data-band="identity"] > [data-cell="sleeve"] { grid-row: auto !important; grid-column: 1 !important; }
          }
          @media (max-width: 479px) {
            [data-band="identity"] { grid-template-columns: 1fr !important; grid-auto-rows: auto; height: auto !important; }
            /*
              **One fluid column: the two fitted cells scale with it.** §28:
              the construction "draws at (W - 48) / 432 of fitted scale";
              §33: the cover is "the largest square its cell holds". Both
              cells are laid out in 480-wide pixels, so each keeps its 480
              proportions and is drawn at the column's share of 480 -- the
              still through its SVG's own fit inside the cell's aspect, the
              sleeve through a scaled wrapper, since its marks are placed in
              pixels. Before this the sleeve cell had no height in a fluid
              column and its bar and block landed in the record band.
            */
            [data-cell="still"] { aspect-ratio: ${GRID_FORK / 3} / ${BANDS.identity}; }
            [data-cell="sleeve"] { aspect-ratio: ${GRID_FORK / 3} / ${BANDS.identity}; }
            /*
              A ratio of two lengths as a NUMBER: scale() takes a number, and
              calc(100vw / 480) is a length, so the first draft of this rule
              was invalid and silently dropped (measured: transform none at
              390). tan(atan2(a, b)) is a / b typed as a number.
            */
          }
          /*
            **§28, step 31: below 1440 the record band has no fixed height.**
            "§2.1's 300 is the twelve-column figure, stated for 1440 × 900,
            and it holds only there. At every width from 480 to 1439 the band
            is as tall as its rows, and each row is as tall as its tallest
            cell's content plus that cell's own padding." Measured before
            this rule: five cells stacked into 300px at 59.8 each, the 72px
            year overflowing by 9.3, the About by 39.2, the Images foot by
            83.2 into the region.

            **Set per band, by name.** §28: "Height is set per band, never
            through a selector shared by bands — the defect reached the 300
            through a shared [data-band] rule that did not know which band it
            was sizing." The identity band keeps its 547 here, as §28 rules
            for 480 to 1439; only the record band is released.
          */
          [data-band="record"] { height: auto !important; }
          [data-band="record"] > [data-cell] { min-height: 0; }
          [data-band="section"] > * { grid-column: 1 / -1 !important; }
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
          **§30's height axis, from the fork up.** "Above 1440 the upper band
          is max(547, 547/900 × viewport height)... The band's extra height
          passes to the construction cell in full, so its inner box is the
          band less 48." widePageStylesheet stated this from 1680 without
          !important, and the band's inline 547 won at every height -- the
          height sweep measured 547 at 1680 × 2000 where §30 rules 1216. The
          identity and sleeve cells keep their 546 at the band's top; only
          the still stretches.
        */
        @media (min-width: ${GRID_FORK}px) {
          [data-band="identity"] { height: max(${BAND_AT_REFERENCE}px, ${((BAND_AT_REFERENCE / REFERENCE_HEIGHT) * 100).toFixed(4)}vh) !important; }
          /*
            §40 (step 45): every upper cell takes the band's full height.
            This pinned the identity and sleeve cells at 546 with align-self
            start, so the band's extra height painted as paper beneath both:
            31.4px at 1920 × 950, 110 at 1080, 183 at 1200. The cells stretch
            with the grid now; the identity cell's content track stays the
            ladder's 510 and the extra is slack below it.
          */
          [data-cell="identity-content"] { --identity-track: ${LADDER_SUPPLY}px; }
          /* §40: any paper the marks leave in the cover cell takes the ladder's tint step, not bare paper. */
          [data-cell="sleeve"] { background: var(--sleeve-tint); }
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
          /*
            **Its height is the track's, never its content's.** A grid item
            with min-height:auto grows to its content, and the title ladder
            reads its supply from this cell's box: on a resize DOWN into
            §36's scaling band the title still at 120 kept the cell 503 tall
            in a 410 band, the supply read 452 rather than 358, and the ladder
            stayed at 120 -- measuring the thing the title inflates, the loop
            TitleStep's note describes, reached from the other side. With the
            height pinned to the track the content overflows the cell (§27:
            never overflow-hidden) instead of growing it, and the ladder reads
            the ruled height.
          */
          className="relative h-full min-h-0"
          style={{ gridColumn: `span ${IDENTITY_SPANS[0]}` }}
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
          style={{ gridColumn: `span ${IDENTITY_SPANS[2]}`, ['--sleeve-tint' as string]: tint }}
        >
          {/*
            No geometry here: the square, the bar and the block are placed by
            the stylesheet in the cell's own container units, so every
            breakpoint sizes them from the cell it is in. Only the colours are
            the record's and travel inline.
          */}
          <div data-scale="">
            {record.coverUrl === null ? (
              <div data-mark="coverFrame" style={{ border: `1px solid ${RULE}` }} />
            ) : (
              <img data-cover="" src={record.coverUrl} alt="" className="block object-cover" />
            )}
            <div data-mark="sleeveBar" style={{ background: base }} />
            <div data-mark="sleeveBlock" style={{ background: INK }} />
          </div>
        </div>
        {/*
          **§28's air beside the third upper cell, at 8 columns only.** "The
          first two cells sit side by side and the third takes a second row,
          with 480 of air beside it." §37, step 40: "the upper air is a
          section, and carries no figure" -- a `data-section`, so §21's cap,
          §25's size and §29's terms resolve against it rather than falling
          back to the host; the tint field moved up from the last lower row
          (that row's own triangle is not drawn at 8, "moved, not added"),
          and NO figure: "the construction is the only figure above the fold
          at every width". §28's figure move is withdrawn
          (`28/upper-air-figure`). The markup carries the cell at every
          width; the fork stylesheet shows it from 960 to 1439 and nowhere
          else.
        */}
        <div
          data-cell="upper-air"
          data-section="upper-air"
          data-upper-air=""
          aria-hidden="true"
          className="relative isolate overflow-hidden"
          style={{ gridColumn: `span ${IDENTITY_SPANS[2]}` }}
        >
          {ladder !== null && <Flat ladder={ladder} flat={FLATS.left} />}
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
          style={{ gridColumn: `span ${LOWER_SPANS[0]}` }}
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
              <Plane name="provenanceArc" corner="bottom-left" fill={tint} />
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
          style={{ gridColumn: `span ${LOWER_SPANS[1]}` }}
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
          style={{ gridColumn: `span ${LOWER_SPANS[3]}` }}
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
          {/*
            **§33 (d), amended — the About leads, then the entry, then the
            diagonal.** "The lower frame's last cell shows the record's About,
            labelled ABOUT... A record with no About shows its latest journal
            entry instead, date and text; a record with neither shows §6's
            diagonal." Journal-first is withdrawn within §33. The note has
            left the frame: it leads §9's Journal section, labelled NOTE.

            Absence is decided by `aboutCellState`, on emptiness rather than
            nullness -- the note version tested null and would have printed a
            heading over an empty string with no diagonal.
          */}
          {(() => {
            const state = aboutCellState({ about: record.about, entry: record.journalEntry });
            return (
              <>
                {/* §33: "labelled ABOUT" in every state; §35 restates the cell without a second label. The entry state once relabelled it JOURNAL. */}
                <div className={LABEL}>About</div>
                {state.kind === 'about' ? (
                  <AboutCell text={state.text} />
                ) : state.kind === 'entry' ? (
                  <>
                    <div className={`${LABEL} mt-[6px]`} style={{ color: LABEL_INK }}>
                      {state.entryDate}
                    </div>
                    <div
                      data-field="journal-entry"
                      className="text-prose mt-[6px] overflow-hidden"
                      style={{ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: ENTRY_LINES }}
                    >
                      {state.text}
                    </div>
                  </>
                ) : (
                  <>
                    {/*
                      §36: "below the label sits 'Write one ↓', a link to the
                      row in the same vocabulary as 'more ↓'. It is a link, not
                      a button, so the app still has one generate control."
                    */}
                    {writingConfigured && (
                      <Link href="#snippet" data-field="about-write" className={`${LABEL} mt-[6px] block`}>
                        Write one ↓
                      </Link>
                    )}
                    <EmptyMark diagonal="single" />
                  </>
                )}
              </>
            );
          })()}

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
            §35: the About's quarter-circle is withdrawn. Measured on the
            real seventeen it drew on one record, and every About Adam writes
            removes it from another; "a mark drawn on one record in seventeen
            is not part of the page's composition." Nothing replaces it.
          */}
        </div>
      </div>

      {/* The tail is paper, not a footer. */}
      <div data-band="tail" style={{ height: BANDS.tail }} />
    </div>
  );
}
