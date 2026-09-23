/**
 * §9.1 — the extended grid: the structure for everything below the fold.
 *
 * **Above the fold twelve columns hold because every cell has a fixed height.
 * Here nothing does**, so the structure is a vertical line rather than a set of
 * horizontal ones: every label starts at the same x on every section, and a
 * reader scrolling past eight sections of wildly different heights sees one
 * edge that never moves. That is why a section can be 60px or 600px without the
 * region coming apart.
 *
 * Nothing here is a band. Height is content-derived at every level (§8).
 *
 * **Not `server-only`.** This is geometry — numbers and a predicate over a
 * fixed union, no data and no server reach — and the E2E imports it so the
 * rendered measurements are checked against the same constants the components
 * use rather than against copies typed into a spec.
 */

/**
 * **Twelve columns, the same `repeat(12, 1fr)` as §2.1** — gap 0, full bleed,
 * 34px padding inside every cell, and row heights derived from content.
 *
 * This replaced a 216px label rail, which was the wrong repair. The argument
 * for the rail was that the twelve columns exist for a budget that does not
 * apply below the fold — but that is an argument against the fixed BANDS, not
 * against the columns. **Bands are height and columns are alignment; dropping
 * the budget only requires dropping the height.** A rail aligned to nothing
 * above it made the page a grid with a document stapled under it.
 */
/**
 * **§18: fixed columns, not fractions.** "The grid is fixed, so the fork is
 * 1440 and needs no new figure: the bands are `repeat(12, 120px)`, not
 * fractions." A fractional grid asked a fixed composition to be a fluid one,
 * which is what the 93px identity cell was reporting. The single-column fork
 * below 1440 is a stylesheet in `RecordPage8a`, so it applies to these
 * sections and to the bands alike.
 */
export const GRID_TEMPLATE = 'repeat(12, 120px)';

/** 34px inside every cell, holding content while the section rule bleeds past. */
export const CELL_PADDING = 34;

/**
 * **The label is a span, not a structure: the first two columns of every
 * section.**
 *
 * Same reading as the rail gave — a label on the left, content to its right —
 * but its x is now a column edge rather than an invented one, so it lines up
 * with the identity cell above it. §9.3's bar sits under the label inside this
 * span, which is what keeps the colour ruling unchanged.
 */
export const LABEL_SPAN = 2;

/**
 * **Three content splits and no more**, which is what stops each section
 * inventing its own. The ten columns right of the label divide 10, 5+5, or 6+4,
 * and the section picks by the SHAPE of what it holds:
 *
 * - `one` — one continuous thing: tags, thumbnails.
 * - `pair` — two comparable things: pressing pairs, source/date, figure/action,
 *   series/rows. Label-value pairs and list rows are the same object, and a
 *   form takes the same split as the pairs it edits.
 * - `body` — a body with an action beside it: snippet, journal.
 *
 * **A section needing a fourth split is a section whose content has not been
 * identified yet.** If you meet one, report it rather than inventing a span —
 * a fourth pattern is the rule proliferating, which is the thing three splits
 * exist to prevent.
 */
export const CONTENT_SPLITS = {
  one: [10],
  pair: [5, 5],
  body: [6, 4],
} as const;

export type ContentShape = keyof typeof CONTENT_SPLITS;

/** Every split fills the ten columns right of the label. */
export const CONTENT_COLUMNS = 12 - LABEL_SPAN;

/**
 * §3's hairline. Two uses below the fold, and the distinction is load-bearing:
 *
 * - **Section boundaries bleed** to the composition's edge while cell padding
 *   holds content at 34px — §3 makes full-bleed separate modules and inset
 *   separate things within one, and each section is a module.
 * - **Cell verticals** sit on the right of every cell but the last, exactly as
 *   §2.1 draws them. These are what a rail structurally could not do: a rail
 *   has one edge, and a grid has as many as it has cells.
 */
export const SECTION_RULE = 'oklch(0.72 0.004 80)';

/** §9.3's bar: one base-step mark in the label span, under the label. */
export const MARK_WIDTH = 44;
export const MARK_HEIGHT = 10;

/**
 * §9.2's control geometry. Everything here is `box-sizing: border-box`, so
 * authored heights are rendered heights.
 *
 * 44 is load-bearing twice: the hit-target floor, and 4× the 11px label, which
 * puts the control's height on the type scale rather than beside it.
 */
export const CONTROL_HEIGHT = 44;
export const FIELD_HEIGHT = 34;
export const CHIP_HEIGHT = 30;

/**
 * **A67 wins over §9.2's original 13px, and 16 is not on the type scale.**
 *
 * A correctness rule with a named browser failure — Safari zooms the viewport
 * when a focused input is under 16px — outranks a type-system claim. Recorded
 * as the scale amendment it is, scoped to *the typed line of an input and
 * nothing else*: not labels, not prose, not the field's own label, not
 * read-only data in a field-shaped box. The scope is text the user can put a
 * cursor in, which is the scope of the browser behaviour forcing it.
 *
 * Geometry is unaffected: 16px at 1.9 is a 30.4px line inside a 34px
 * border-box field with a 1px bottom border.
 */
export const TYPED_SIZE = 16;
export const TYPED_LEADING = 1.9;

/**
 * The eight sections §9 draws, in the order they render.
 *
 * **§26 reorders them, and it is a page change rather than a layout one.**
 * Its five rows are Pressing detail · Acquisition / Tags / Market ·
 * Price history · Images / About · Journal, so Market moves up beside
 * Acquisition and Tags, and Images and About move below Price history.
 * The build's earlier order put Images and About before Market and Price
 * history, on §10b's reading that the images describe the object, the
 * snippet the music and the journal living with it — outward-in.
 *
 * §26 supersedes that: the three tight columns of row 2 are the facts a
 * record carries, the full-width strip is its history, and the two halves
 * are what was made of it. §26's groupings list and its drawing agree, so
 * this is not the drawing-governs question §28 settles — both say the same
 * thing, and the build had neither.
 */
export const SECTIONS = [
  'pressing-detail',
  'acquisition',
  'tags',
  'market',
  'price-history',
  'images',
  'snippet',
  'journal',
] as const;

export type SectionName = (typeof SECTIONS)[number];

/**
 * §9.3 — **a section carries the mark when it holds a fact that appears nowhere
 * above the fold**, evaluated against the SCHEMA rather than against the record.
 *
 * **Per-record evaluation would make the mark encode data.** A bar that appears
 * when a record has images and vanishes when it does not is an indicator of
 * that fact, and nothing on this page encodes anything — §4 refuses a third 72
 * for this reason, §5.3 refuses to drop the coverless record's marks.
 *
 * So Images, Journal and Price history are marked on all seventeen records,
 * including the sixteen where Images and Journal render control-only. A mark
 * beside a control-only section is not a mark beside nothing: that section is
 * still where this record's images go.
 *
 * **No minimum count, and none is implemented.** The repetition the floor
 * exemption rests on is POSITIONAL, not numerical: on 16 of 17 records the
 * marked set is Images and Journal alone, and two marks at an x the reader has
 * met in eight labels are the same event as four. The drawing's four-of-eight
 * is the richest record only.
 */
const MARKED: ReadonlySet<SectionName> = new Set<SectionName>([
  /* Plant, weight and colour are drawn in no frame cell. */
  'pressing-detail',
  /* The frame shows a count, never the images. */
  'images',
  /* The frame shows one figure, never the series. */
  'price-history',
  /*
    **The frame has no journal cell at all now**, so it shows no entry. The
    earlier ground — "the frame's journal cell shows the snippet, not an
    entry" — was true of neither half: the cell drew a journal ENTRY above the
    owner's NOTE, and never the snippet.
  */
  'journal',
  /**
   * **Snippet was unmarked on a duplication that does not exist.**
   *
   * §9.4's ground was "its text is exactly what the frame's journal cell
   * draws". The frame drew `notes` under an `About` rule — the owner's own
   * text — while the snippet is §10b's GENERATED text in a separate column,
   * and the frame has never drawn it.
   *
   * So the predicate was applied correctly to a false fact about the build.
   * Nothing in the reasoning failed: the rule was right, the application was
   * right, the input was wrong. Freshly applied, the snippet is a kind of fact
   * that appears nowhere above the fold, so it is marked — and would have been
   * before the frame's journal cell was removed.
   */
  'snippet',
]);

/**
 * Apply the predicate directly to any new section. Do NOT infer from cadence,
 * from "edits a frame fact", or from content kind — all three were tried and
 * all three mis-selected.
 */
export function carriesMark(section: SectionName): boolean {
  return MARKED.has(section);
}

/**
 * §28's touch floor, as the padding a control needs to reach it.
 *
 * "§9.3's 44px hit floor now covers every control on the page, the 11px
 * labels included. **The hit area is padded out to 44 while the drawn type
 * stays the same size.**" So a 34px field keeps its 34px box and gains 5px of
 * hit area above and below; a 30px chip gains 7. A control already at the
 * floor gains nothing — padding a 44px button to 54 would push the rows apart
 * for no one.
 *
 * Vertical only, and split evenly, so the drawn box does not move: the
 * ruled field's underline is a mark at a position §9.3 fixes, and growing
 * the hit area must not shift it.
 */
export function touchPadding(drawnHeight: number): number {
  return Math.max(0, (CONTROL_HEIGHT - drawnHeight) / 2);
}
