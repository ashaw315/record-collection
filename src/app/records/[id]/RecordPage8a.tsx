import { BANDS, IDENTITY_SPANS, LOWER_SPANS, MAX_GRID_WIDTH } from './band-geometry';
import { ConstructionStill } from './ConstructionStill';
import { IdentityCell } from './IdentityCell';
import { gridModules, type Diagonal } from './grid-modules';
import { project } from './construction';
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

function MatrixSolid() {
  const p = (u: number, v: number, w: number) => {
    const [x, y] = project(u, v, w);
    return [x * 13 + 60, y * 13 + 52] as const;
  };
  const face = (pts: ReadonlyArray<readonly [number, number]>) =>
    pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

  /* A low slab: wide on the ground, shallow in height. */
  const [du, dv, dw] = [2.6, 1.5, 0.55];

  return (
    <svg
      data-mark="matrixSolid"
      aria-hidden="true"
      viewBox="0 0 120 104"
      className="pointer-events-none absolute right-[18px] bottom-[18px] h-[104px] w-[120px]"
    >
      <polygon
        points={face([p(0, 0, dw), p(du, 0, dw), p(du, dv, dw), p(0, dv, dw)])}
        fill="oklch(0.80 0.004 80)"
      />
      <polygon
        points={face([p(0, dv, 0), p(du, dv, 0), p(du, dv, dw), p(0, dv, dw)])}
        fill="oklch(0.66 0.004 80)"
      />
      <polygon
        points={face([p(du, 0, 0), p(du, dv, 0), p(du, dv, dw), p(du, 0, dw)])}
        fill="oklch(0.52 0.004 80)"
      />
    </svg>
  );
}

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
      style={{ color: INK, maxWidth: MAX_GRID_WIDTH }}
    >
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
          <IdentityCell
            title={record.title}
            artistName={record.artistName}
            artistId={record.artistId}
            pressingLine={record.pressingLine}
            formatLine={record.formatLine}
            genres={record.genres}
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
            ornament={
              /*
                **§5.1's corner triangle: a FLAT plane, not a solid.**

                A mark that touches a page edge is a flat plane of the derived
                colour; a mark that does not is an isometric solid. This one
                sits in the identity block's lower-left corner and runs to the
                cell's edge, so it is a plane.

                It was built flat, replaced with an `IsoMark` on 13 Sep under a
                ruling that withdrew §5.1's arcs and triangle for isometric
                solids, and that ruling was itself withdrawn — "that was true
                for one turn, under the withdrawn isometric ruling, and is not
                true now". Nothing failed when the ruling reversed, because
                code implementing a superseded rule keeps working; the only
                evidence was a mark named `triangle` drawing three faces.

                In the ornament TRACK rather than positioned against the cell,
                so §4.2's corner reserve yields structurally: 140px at two
                title lines, 115.4 at three, 47.7 at four, gone at five. The
                HEIGHT is the drawing's; the track supplies it.

                **268 × 140, ratio 1.91** — read off the drawing, where all
                three instances have carried it since they were drawn.

                It was 180 for one round, which was a build decision taken
                because §5.1 gives the edge fields "a count, a value, a step and
                a suppression rule, and stops" and fixes only the height. Full
                cell width made a corner mark into a band across the block, so
                the constraint was real and the value was not ruled. Design's
                own first answer derived 1.30 from the projection and landed
                86px from the mark it described — a number reached by reasoning
                rather than read off the drawing.
              */
              <div
                data-mark="identityTriangle"
                aria-hidden="true"
                className="pointer-events-none absolute bottom-0 left-0 h-full w-[268px] max-w-full"
                style={{
                  background: tint,
                  /* Lower-left corner: the hypotenuse runs up to the right. */
                  clipPath: 'polygon(0 0, 0 100%, 100% 100%)',
                }}
              />
            }
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
          className="relative"
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
          {/*
            **Fitted, not cropped.** `object-cover` on a square source in a cell
            that widens without heightening shows a horizontal slice — measured
            at 83% of the artwork visible at 1440 and 47% at 2560. The sleeve is
            §5's entry point and the source of the page's colour, so showing
            less than half of it was the worst cost of the unspecified widths.

            `object-contain` with the artwork centred, and the bar anchored to
            the ARTWORK'S edge rather than the cell's, so the mark stays on the
            thing it marks.
          */}
          {record.coverUrl === null ? (
            /* §5.3: a frame at paper luminance, never a filled rectangle. */
            <div className="absolute inset-[18px]" style={{ border: `1px solid ${RULE}` }} />
          ) : (
            <div className="relative flex h-full w-full items-center justify-end">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={record.coverUrl}
                alt=""
                className="block h-full w-auto max-w-full object-contain"
              />
              <div
                data-mark="sleeveBar"
                className="h-full w-[10px] shrink-0"
                style={{ background: base }}
              />
            </div>
          )}
          {record.coverUrl === null && (
            <div
              data-mark="sleeveBar"
              className="absolute top-0 right-0 h-full w-[10px]"
              style={{ background: base }}
            />
          )}
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
          <div className={`${LABEL} whitespace-nowrap`} style={{ color: INK }}>
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
            className="text-[72px] leading-[0.86] font-extrabold"
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
                <div className="mt-[6px] font-mono text-[10px] text-[oklch(0.55_0.008_60)]">
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
          data-cell="about"
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

            §8.1's trigger goes with the entry. Its rule forbids a form's submit
            from sharing a label with the trigger that opened it; with no cell
            here there is no trigger, so the rule is vacuous rather than
            violated and the section keeps `Save entry`. The journal is reached
            by scrolling to it, not by a control.
          */}
          <div className={LABEL}>About this record</div>
          {record.note === null ? (
            <EmptyMark diagonal="single" />
          ) : (
            <div className="text-prose">{record.note}</div>
          )}
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
