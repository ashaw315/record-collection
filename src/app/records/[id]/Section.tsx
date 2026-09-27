import type { RecordLadder } from '@/lib/colour/record-ladder';
import { LABEL } from './grid-type';
import { Figure, Flat } from './OrnamentMarks';
import { FLATS, figureAt, type Figure as FigureSpec } from './ornament';
import { MAX_ROWS, REGION_ROWS, airPlacement, placementOf } from './region-rows';
import {
  CELL_PADDING,
  CONTENT_SPLITS,
  MARK_HEIGHT,
  MARK_WIDTH,
  SECTION_RULE,
  carriesMark,
  type ContentShape,
  type SectionName,
} from './extended-grid';

/**
 * §26's section — an ITEM in one of the region's five rows.
 *
 * **§9.1 made every section its own twelve-column grid with the label in a
 * two-column span.** §26 gives the region varied spans — 7 + 5, 4 / 4 / 4,
 * 12, 6 / 6, 3 + 9 — so a section is four or six or twelve columns wide, and
 * a two-column label inside a four-column section would be half of it. §26's
 * drawing puts the label at each section's top-left with the content
 * beneath, and that is what this builds.
 *
 * **What that keeps of §9.1's argument.** The rail existed so a reader
 * scrolling past sections of wildly different heights sees one edge that
 * never moves. Each section's label still starts at its own left edge, and
 * the rows' spans are column multiples, so the edges a reader sees are still
 * column edges — one per row rather than one per page, which is what having
 * rows means.
 *
 * **The section is the positioned, clipping box, and that is load-bearing.**
 * §25 sizes a figure at 0.855 of the SECTION's height; a percentage resolves
 * against the positioned ancestor, so the section must be it. §26: "each
 * figure's clip is its own cell, so it can never enter another", and "a
 * figure may be cut by at most one of its cell's edges — its foot".
 */
const CELL_LAYER = {
  position: 'relative',
  isolation: 'isolate',
  overflow: 'hidden',
} as const;

export function Section({
  name,
  title,
  base,
  shape,
  children,
  span,
  start,
  ladder = null,
}: {
  name: SectionName;
  title: string;
  /** §5.5's base step, or null when the record has no cover to derive from. */
  base: string | null;
  /** How the section divides internally — see `CONTENT_SPLITS`. */
  shape: ContentShape;
  /** One node per span in the chosen split. */
  children: React.ReactNode;
  /**
   * Columns this section takes in its row, and the column it starts at
   * (§26, §28). **Both default to what the region's rows say for this
   * section's NAME**, so no call site states a span: `region-rows.ts` is the
   * only place §28's list lives. Passing them is for the component test,
   * which renders a section outside any region.
   */
  span?: number;
  start?: number;
  /** False when another item follows in the row, which is what draws the rule. */
  /** The record's ladder, for §25's figures and §26's flats. Null when there is no cover. */
  ladder?: RecordLadder | null;
}) {
  const split = CONTENT_SPLITS[shape];
  /* Step 18b builds the 12-column region; step 20 turns §28's other widths on. */
  const placed = placementOf(1440, name);
  const column = start ?? placed.start;
  const width = span ?? placed.span;

  /**
   * **One cell per child, not one per span.** A section declaring `pair` and
   * passing a single child left the second cell empty — and an empty cell is
   * not harmless: it renders as a real box beside the content, takes its
   * columns, and at 390px sat on top of the control next to it and swallowed
   * clicks. So unused spans collapse into the last cell that has content.
   */
  const given = (Array.isArray(children) ? children : [children]).filter(
    (child) => child !== null && child !== undefined && child !== false,
  );
  const cells =
    given.length >= split.length
      ? split.map((weight, index) => ({ weight, child: given[index] }))
      : given.map((child, index) => ({
          weight:
            index === given.length - 1
              ? split.slice(index).reduce((sum, weight) => sum + weight, 0)
              : split[index],
          child,
        }));

  /* §26's strip figure, and the flat that sits beside this section. */
  const figure = figureAt(name, 'strip');
  const flat = FLATS.right.beside === name ? FLATS.right : null;

  return (
    <section
      id={name}
      data-section={name}
      data-shape={shape}
      style={{
        /*
          Placement comes from §28's generated stylesheet, which states it per
          width; an inline value would beat every breakpoint. `placementOf`
          still governs — the stylesheet is generated from it — and the
          fallbacks below are for a section rendered outside a region, which
          is what the component test does.
        */
        /*
          **§33 moved the row's rule off the section.** "A row's horizontal
          rule runs full-bleed across every cell, occupied or empty; the build
          drew each cell's rule, so the empty cell of the four-by-three row
          left a gap."

          Measured on the built page: the 4/4/4 row rendered only Acquisition,
          because Tags and Market are both conditional, so its rule stopped at
          x=480 with 960px of the region's 1440 missing. A rule drawn per item
          can only ever span the items that exist, and §26's rows are allowed
          to hold fewer.

          `RowRule` below draws one full-width line per row instead.

          **And the VERTICAL is not inline either.** The section once set
          `border-right: 1px solid` here for its 1440 placement, and an
          inline width beats the generated stylesheet's per-width `0`: at
          eight columns pressing-detail, row-final there, drew a 1px rule
          down the page's right edge across its 174px (measured at 1000);
          acquisition and tags did the same at four columns and images at
          one. A rule on the page's edge is a line the page does not carry.
          The region stylesheet gives every section a 0-width solid rule and
          widens it per breakpoint from the same table as the placement.
        */
        /*
          **A grid item's automatic minimum size is its content**, so a
          section whose content is wider than its span would grow past it
          rather than letting its own content wrap — the same reason the
          content cells one level down carry it.

          It is NOT what caused About to paint over Images: that was the fork
          stylesheet forcing `grid-column` without `grid-row`, so both row-4
          sections landed on one track. This was added on a wrong diagnosis
          and kept on its own merits, which the test below states.
        */
        minWidth: 0,
        ...CELL_LAYER,
      }}
    >
      {/*
        §26's two placements that belong to a SECTION rather than to air: the
        solo in Price history's strip, and the base quarter-disc beside About
        this record. Both sit at `z-index: -1` inside the section's own
        stacking context, so every piece of content is above them by being in
        flow, and neither can leave this section.
      */}
      {ladder !== null && figure !== null && <Figure ladder={ladder} figure={figure} host={'strip'} />}
      {ladder !== null && flat !== null && <Flat ladder={ladder} flat={flat} />}

      {/*
        **The label above the content**, at the section's own left edge. §9.3's
        bar sits under it, where a mark at the label's x sits on the line the
        reader has already learned.
      */}
      <div data-cell="label" style={{ padding: `${CELL_PADDING}px ${CELL_PADDING}px 0` }}>
        <div className={LABEL}>{title}</div>

        {/*
          **Marked on the schema, not the record**: a bar that appeared when a
          record had images and vanished when it did not would make the mark
          encode that fact. A control-only section keeps its bar — it says the
          record's colour reaches that place, not that something is in it.
        */}
        {carriesMark(name) && base !== null && (
          <div
            data-mark="section-bar"
            className="mt-[10px]"
            style={{ width: MARK_WIDTH, height: MARK_HEIGHT, background: base }}
          />
        )}
      </div>

      {/*
        The content cells, dividing the section's own width by the split's
        weights. Fractions rather than columns: the section's span is already
        a column multiple, and a split of a four-column section into 5 + 5 of
        the page's columns has no meaning.
      */}
      <div
        className="grid"
        style={{ gridTemplateColumns: cells.map((cell) => `${cell.weight}fr`).join(' '), gap: 0 }}
      >
        {cells.map(({ child }, index) => (
          <div
            key={index}
            data-cell={`content-${index}`}
            className="min-w-0"
            /*
              **§33 withdrew this divider.** "A vertical rule runs its row's
              full height or is not drawn: the label-to-value dividers inside
              Pressing detail and Market start below their section labels, and
              a vertical that starts partway reads as a break. They are
              withdrawn; the label and value columns are separated by space."

              It sat on the content grid, which begins below the section's
              label, so it could never run the row's height -- measured at
              104px inside a 175px row. The columns are separated by
              `CELL_PADDING` on both sides of the boundary, which is the space
              §33 names.
            */
            style={{ padding: CELL_PADDING }}
          >
            {child}
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * The region the rows stack in.
 *
 * **No max-width and no centring of its own.** The section rules bleed to the
 * composition's edge, and the frame above already establishes that measure.
 */
export function ExtendedGrid({ children, ladder = null }: { children: React.ReactNode; ladder?: RecordLadder | null }) {
  return (
    <div
      data-region="extended-grid"
      className="grid"
      /*
        **The columns come from §28's generated stylesheet, not from here.**
        An inline `grid-template-columns` beats every rule in a stylesheet
        that lacks `!important`, so setting it here pinned the region at
        twelve columns and the breakpoints silently did nothing — measured at
        1200, where the region reported 12 columns where §28 rules 8.
      */
      style={{ gap: 0 }}
    >
      {children}
      {/*
        **§26's air columns, rendered by the region rather than by a
        section.** Air belongs to a ROW — "the air columns are where the
        figures and flats go, so the rhythm makes the air rather than finding
        it" — and no section owns its row. Rendered after the sections and
        placed explicitly, so source order does not decide where they land.

        Row 1's air carries §25's pair; row 5's carries the tint triangle,
        and its span is what makes the left page edge (§26: "the left page
        edge is made, not found").
      */}
      {/*
        **§33's row rules: one line per row, spanning every column.**

        Placed on the grid at `grid-column: 1 / -1` and the row's own track, so
        it reaches the region's full width whether or not every section in that
        row renders. `aria-hidden` and zero height: it is a rule, not a cell.

        The stylesheet cannot do this with a pseudo-element on the row, because
        a CSS grid has no element for a row -- which is why the build drew the
        line on the items in the first place.
      */}
      {Array.from({ length: MAX_ROWS }, (_, index) => (
        <div
          key={`rule-${index}`}
          data-row-rule={index}
          aria-hidden="true"
          style={{
            gridColumn: '1 / -1',
            gridRow: index + 1,
            alignSelf: 'start',
            height: 0,
            borderTop: `1px solid ${SECTION_RULE}`,
            /*
              **The rule must not size its track.** A zero-height box with a
              1px border is 1px tall, so a row with no sections rendered --
              the 4/4/4 row on a record with no latest price, no tags and no
              Discogs release -- kept a 1px track for its rule, and the next
              row's rule sat directly beneath it: a doubled hairline, measured
              at 1111 and 1112. §9.1 forbids reserved space for an empty
              section, and a pixel-tall track for an empty row is that. With
              the margin, the box contributes nothing to the track: an empty
              row collapses to 0 and its rule coincides with the next row's,
              one line drawn twice in the same place rather than two lines.
            */
            marginBottom: -1,
          }}
        />
      ))}

      {REGION_ROWS.map((row, index) => {
        const air = airPlacement(1440, index);
        if (air === null) return null;
        return (
          <ExtendedGrid.Air
            key={`air-${index}`}
            index={index}
            ladder={ladder}
            figure={figureAt(row.sections[0], 'air')}
            flat={FLATS.left.beside === row.sections[0] ? FLATS.left : null}
          />
        );
      })}
    </div>
  );
}

/**
 * §26's air column — "the air columns are where the figures and flats go, so
 * the rhythm makes the air rather than finding it".
 *
 * It carries no label, no rule and no content: air is not a cell with empty
 * content, which §9.1 forbids as reserved space, but the shape of the row
 * itself. It renders even with nothing in it, because the row's spans are
 * what make the left page edge in the last row (§26).
 */
ExtendedGrid.Air = function Air({
  index,
  ladder,
  figure = null,
  flat = null,
}: {
  /**
   * Which of §26's five rows it belongs to. **The only placement it
   * carries**: §28's generated stylesheet states its column, row and
   * visibility per width, addressed by this index.
   */
  index?: number;
  ladder: RecordLadder | null;
  figure?: FigureSpec | null;
  flat?: (typeof FLATS)[keyof typeof FLATS] | null;
}) {
  return (
    <div
      data-cell="air"
      data-air={index}
      aria-hidden="true"
      style={{
        /*
          **No inline placement.** §28's generated stylesheet places every air
          column per width, and an inline `grid-column` beats it: an air cell
          hidden at 8 columns still reached column 12 through its inline
          value and opened four implicit 0px tracks on the region's grid.
          The `data-air` index is what the stylesheet addresses.
        */
        /* §33: the row's rule belongs to the row -- see `RowRule`. */
        ...CELL_LAYER,
      }}
    >
      {ladder !== null && figure !== null && <Figure ladder={ladder} figure={figure} host={'air'} />}
      {ladder !== null && flat !== null && <Flat ladder={ladder} flat={flat} />}
    </div>
  );
};
