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
 * The five tracks, in order. **Three of the five are spacer tracks** — not
 * padding and not column-gap.
 *
 * Padding is excluded because the section rules must bleed PAST it: §3's
 * distinction is full-bleed separates modules, inset separates things inside
 * one, and each section is a module. A gap is excluded because a spacer track
 * and a gap both applying was a live defect here — the two compose silently and
 * the rail lands at the wrong x.
 */
export const GRID_TRACKS = ['34px', '216px', '34px', '1fr', '34px'] as const;

/** `grid-template-columns`, as authored. `gap: 0` is implied and asserted. */
export const GRID_TEMPLATE = GRID_TRACKS.join(' ');

/** Where the rail starts, and where content starts — the frame's text edge. */
export const RAIL_X = 34;
export const CONTENT_X = 284;

/** §3's hairline, the only rule in the region. It bleeds; the tracks indent. */
export const SECTION_RULE = 'oklch(0.72 0.004 80)';

/** §9.3's bar: one base-step mark in the rail, under the label. */
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

/** The eight sections §9 draws, in the order they render. */
export const SECTIONS = [
  'pressing-detail',
  'acquisition',
  'tags',
  'images',
  'snippet',
  'market',
  'price-history',
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
  /* The frame's journal cell shows the snippet, not an entry. */
  'journal',
]);

/**
 * Apply the predicate directly to any new section. Do NOT infer from cadence,
 * from "edits a frame fact", or from content kind — all three were tried and
 * all three mis-selected.
 */
export function carriesMark(section: SectionName): boolean {
  return MARKED.has(section);
}
