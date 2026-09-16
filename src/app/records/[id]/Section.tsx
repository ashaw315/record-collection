import { LABEL } from './grid-type';
import { Ornament } from './OrnamentMarks';
import { archetypeFor, mayOrnament, takesFill } from './ornament';
import {
  CELL_PADDING,
  CONTENT_SPLITS,
  GRID_TEMPLATE,
  LABEL_SPAN,
  MARK_HEIGHT,
  MARK_WIDTH,
  SECTION_RULE,
  carriesMark,
  type ContentShape,
  type SectionName,
} from './extended-grid';

/**
 * §9.1's section — twelve columns, content-derived rows.
 *
 * **The same `repeat(12, 1fr)` as §2.1.** A 216px rail preceded this and was
 * the wrong repair: the argument for it was that the twelve columns exist for a
 * budget that does not apply below the fold, but that is an argument against
 * the fixed BANDS rather than against the columns. Bands are height, columns
 * are alignment; dropping the budget only requires dropping the height.
 *
 * **Height is derived at every level and nothing is reserved.** A row is as
 * tall as its tallest cell, a section as tall as its row, the region as tall as
 * its sections — a form that grows pushes everything below it down.
 */
/**
 * **The stacking layer, which is structural rather than per-element.**
 *
 * Every §9 cell gets these three together, and ornament sits at `z-index: -1`
 * inside it. Nothing else in the region carries a z-index at all: controls,
 * ruled fields, chips, uploaders, textareas and type runs are above ornament
 * because they are IN FLOW, not because each was named.
 *
 * The first implementation of this lifted eleven elements by matching control
 * heights and missed the textarea, the uploader and the three tag chips — a
 * list of things to raise is a list someone has to keep complete, and the frame
 * failed the same way first, as three patches. All eleven came out when it went
 * structural. **Do not add per-element z-index.**
 *
 * - `position: relative` gives the ornament something to position against.
 * - `isolation: isolate` makes the cell a stacking context, so `-1` cannot
 *   escape behind the section's own background or the page's.
 * - `overflow: hidden` keeps the bleed inside the cell that owns it.
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
  tint = null,
}: {
  name: SectionName;
  title: string;
  /** §5.5's base step, or null when the record has no cover to derive from. */
  base: string | null;
  /**
   * How the ten columns right of the label divide. The section picks by the
   * SHAPE of what it holds, not by what it is called — see `CONTENT_SPLITS`.
   */
  shape: ContentShape;
  /** One node per span in the chosen split. */
  children: React.ReactNode;
  /** §5.5's tint step, for §9.2's ornament. Null when there is no cover. */
  tint?: string | null;
}) {
  const split = CONTENT_SPLITS[shape];

  /**
   * **One cell per child, not one per span.**
   *
   * A section declaring `pair` and passing a single child left the second cell
   * empty — and an empty cell is not harmless: it renders as a real box beside
   * the content, takes its columns, and at 390px sat on top of the control next
   * to it and swallowed clicks. `record-detail.spec.ts` caught that as a 30s
   * timeout on a Delete button that was enabled, visible and motionless.
   *
   * So the unused spans collapse into the last cell that has content. The
   * split still governs where the internal edge falls when a section supplies
   * both halves; it no longer invents a box when it does not.
   */
  const given = (Array.isArray(children) ? children : [children]).filter(
    (child) => child !== null && child !== undefined && child !== false,
  );
  const cells =
    given.length >= split.length
      ? split.map((span, index) => ({ span, child: given[index] }))
      : given.map((child, index) => ({
          span:
            index === given.length - 1
              ? split.slice(index).reduce((sum, span) => sum + span, 0)
              : split[index],
          child,
        }));

  return (
    <section
      id={name}
      data-section={name}
      data-shape={shape}
      /*
        **The boundary bleeds; cell padding holds content at 34.** §3 makes the
        distinction load-bearing — full-bleed separates modules, inset separates
        things inside one — and each section is a module. So the rule is on the
        section element, which spans the composition, rather than on the grid.
      */
      style={{ borderTop: `1px solid ${SECTION_RULE}` }}
    >
      <div className="grid" style={{ gridTemplateColumns: GRID_TEMPLATE, gap: 0 }}>
        {/*
          **The label is a span, not a structure**: the first two columns. Its x
          is a column edge rather than an invented one, so it lines up with the
          identity cell above it.
        */}
        <div
          data-cell="label"
          style={{
            gridColumn: `span ${LABEL_SPAN}`,
            padding: CELL_PADDING,
            borderRight: `1px solid ${SECTION_RULE}`,
            ...CELL_LAYER,
          }}
        >
          <div className={LABEL}>{title}</div>

          {/*
            §9.3's bar, under the label inside the span. A mark at the label
            column's x sits on the one line the reader has already learned.

            **Marked on the schema, not the record**: a bar that appeared when a
            record had images and vanished when it did not would make the mark
            encode that fact. A control-only section keeps its bar — it says the
            record's colour reaches that place, not that something is in it.

            That Images renders control-only on most records is TODAY'S DATA,
            not a rule: the collection is unphotographed beyond its covers, and
            the schema carries four image types. When a gatefold is photographed
            the section stops being control-only for that record, and nothing
            here should have assumed otherwise.
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
          The content cells. **A vertical rule on the right of every cell but
          the last**, exactly as §2.1 draws them — the thing a rail structurally
          could not do, because a rail has one edge and a grid has as many as it
          has cells.
        */}
        {cells.map(({ span, child }, index) => (
          <div
            key={index}
            data-cell={`content-${index}`}
            className="min-w-0"
            style={{
              gridColumn: `span ${span}`,
              padding: CELL_PADDING,
              borderRight:
                index === cells.length - 1 ? undefined : `1px solid ${SECTION_RULE}`,
              ...CELL_LAYER,
            }}
          >
            {/*
              §9.2's solid, where the section's type-only cell is. It carries
              `z-index: -1` and nothing else carries anything: the cell
              isolates, so this sits at the bottom of that stacking context and
              every piece of content is above it by being in flow.
            */}
            {/*
              §9.4's full fill — once per region, in the last section's widest
              cell, at the TINT step.

              **Not a mark, so it displaces none**: the section's bar stays and
              §9.4's count of four is unaffected. Base would be wrong twice — a
              second mass at the record's colour, and §5.2's lightness
              derivation depends on the year field being the only base mark
              carrying type.

              **Ground anchors by area where a mark anchors by contrast**, and
              a tint plane at cell scale has forty times a bar's area, which is
              why it can be the region's floor at a step the bars would be
              invisible at.
            */}
            {tint !== null && takesFill(name, index) && (
              <div
                data-ornament="fill"
                aria-hidden="true"
                className="pointer-events-none absolute inset-0"
                style={{ background: tint, zIndex: -1 }}
              />
            )}
            {tint !== null &&
              mayOrnament(name, index) &&
              archetypeFor(name) !== null && (
                <Ornament tint={tint} archetype={archetypeFor(name)!} />
              )}
            {child}
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * The region the sections stack in.
 *
 * **No max-width and no centring of its own.** The section rules bleed to the
 * composition's edge — the viewport up to the 1728 cap, the capped container
 * beyond — and the frame above already establishes that measure.
 */
export function ExtendedGrid({ children }: { children: React.ReactNode }) {
  return <div data-region="extended-grid">{children}</div>;
}
