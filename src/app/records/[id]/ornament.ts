import { CONTENT_SPLITS, type ContentShape } from './extended-grid';

/**
 * §9.2 — how an ornament gets a box when the box is not known until render.
 *
 * **The frame's ornament rules assume a geometry this region does not have.**
 * Every mark above the fold sits in a cell of stated height; below it a cell is
 * 40px on one record and 300px on another. So ornament here is **sized by width
 * and gated by height**, because width is the one dimension the region
 * inherited as fixed — twelve columns at 120px are known before any content
 * renders, and heights are not.
 *
 * **No ornament is ever measured against a height it cannot know.**
 */

/**
 * **The size term is RELATIVE: 0.62 × the section's height.**
 *
 * The withdrawn rule said half a column — which is a WIDTH, and in cells eleven
 * times wider than tall the dimension carrying presence is height. That is the
 * granularity finding one level out: the rule named a width and the reason was
 * about presence.
 *
 * A prior correction in the same term is why the rule is relative at all: at a
 * fixed 120px a solid is 127px tall, and once the gate and the clearance are
 * both applied there is exactly ONE cell in the region it can legally occupy.
 * A rule permitting one position is not a rule about where ornament goes.
 */
export const SIZE_RATIO = 0.62;

/**
 * **0.62 is a rounding margin, not a maximum.**
 *
 * 0.65 passes a two-thirds gate too. The reason for 0.62 is that cell heights
 * are sub-pixel and the solid's height is an integer, so a value near the
 * ceiling crosses it on some cells and not others — and a gate that fails by
 * rounding is the coincidence-standing-for-margin defect the title band and the
 * year field each produced once. Stated rather than left as a bare number.
 */
export const GATE_MARGIN_NOTE = 'see SIZE_RATIO';

/**
 * **The same solid expressed against the box that clips it.**
 *
 * §9.2 states both: the size is 0.62 of the SECTION, because that is the height
 * a build has before the cells lay out; and the same solid is 0.627 of its
 * CELL, because a cell is about 1.2px shorter — the section carries the 1px
 * border-top and its cells resolve sub-pixel.
 *
 * A CSS percentage height resolves against the cell, so this is the number to
 * author. Derived from the section ratio rather than typed, so the two cannot
 * drift apart: they are one rule seen from two boxes.
 */
export const CELL_SIZE_RATIO = 0.627;

/** The gap between a section and its cell, from §9.2's 126.4 against 127. */
export const SECTION_CELL_DELTA = 1.2;

/** The projection, unchanged: a solid is 1.06 times as tall as it is wide. */
export const SOLID_ASPECT = 1.06;

/**
 * **Height is the primary term and width is derived from it.**
 *
 * The opposite of the withdrawn rule, and the reason the ruled value survives a
 * round trip: the first implementation of this computed height, derived width,
 * then RE-DERIVED height from that width — inflating every solid by a pixel and
 * drawing 0.63 where the rule says 0.62. Width is returned from the same height
 * that is returned, never recomputed from the width.
 *
 * **Measured against the SECTION**, because that is the height a build has
 * before the cells lay out. A cell is about 1.2px shorter — the section carries
 * the 1px border-top and its cells resolve sub-pixel — so the same solid is
 * 0.627 of its cell. Both numbers are in §9.2 and neither contradicts the
 * other; the gate's ceiling is checked against the cell, which is the box that
 * clips the solid.
 */
export function solidSize(sectionHeight: number): { width: number; height: number } {
  const height = Math.round(sectionHeight * SIZE_RATIO);

  return { height, width: Math.round(height / SOLID_ASPECT) };
}

/**
 * **The gate is a ratio on VISIBLE height**: a solid renders only where the
 * part inside the cell is at most two-thirds of the cell's height.
 *
 * **It is no longer load-bearing, and a test must not claim it discriminates.**
 * Under a height-relative size it binds at a single value by construction — the
 * visible height is 0.62 of the section by definition, 0.627 of the cell. It is
 * kept as a guard against a future size change, not as a filter that fires.
 *
 * Visible rather than total, because the bottom bleed is deliberate — an
 * earlier version gated the cell at 1.5× the solid's whole box, which no
 * one-column solid can satisfy (a 127px box needs a 190px cell; the tallest
 * non-control cell in the region is 175px), so the rule as written permitted
 * zero positions while the drawing showed two.
 *
 * The ratio is also the right thing to measure: the gate exists so ornament
 * does not dominate the cell it decorates, which is a proportion rather than a
 * clearance.
 */
export const GATE_RATIO = 2 / 3;

/**
 * **The clearance is a DISTANCE, not cell membership** — half a column, the
 * same unit the solid is sized in.
 *
 * An earlier version said "never in the same cell as a control", which is
 * coarser than its own reason: a cell can be 600px wide and hold a 44px button,
 * so cell membership bars a solid 200px clear of the thing it protects. The
 * reason is that a solid behind or beside a picker or a submit is decoration
 * competing with a hit target, and §9.3's controls are the one thing in this
 * region a reader must find first.
 *
 * **Still half a column, even though the SIZE is no longer stated in columns.**
 * The clearance is about the space around a hit target, which is a horizontal
 * distance in a band eleven times wider than tall — so the unit that was wrong
 * for the size is right here. The size moved to height because presence is
 * vertical; the clearance stays a width because competition is horizontal.
 */
export const CONTROL_CLEARANCE = 60;

/**
 * Whether a solid may render in a cell of this height.
 *
 * **One test, one number, applied per cell at render** — not a whitelist of
 * sections with a content floor, which is the enumeration defect §9.4 records:
 * a section's height varies by record, so a rule naming sections decides on the
 * schema what only the record can answer.
 *
 * Suppression is safe here where §5.4 forbids it above the fold, because
 * **ornament carries no data**: a record whose cell is one line short simply
 * has no solid there.
 */
export function gatePasses(sectionHeight: number, cellHeight: number): boolean {
  if (cellHeight <= 0 || sectionHeight <= 0) return false;

  const { height } = solidSize(sectionHeight);

  /* The solid sits against the bottom, so what is visible is what fits. */
  return Math.min(height, cellHeight) / cellHeight <= GATE_RATIO;
}

/**
 * The visible fraction — what the drawn ratios ARE.
 *
 * Clamped at 1: a cell shorter than the solid shows all of it, not more.
 */
export function visibleRatio(sectionHeight: number, cellHeight: number): number {
  if (cellHeight <= 0) return Number.POSITIVE_INFINITY;

  const { height } = solidSize(sectionHeight);

  return Math.min(height, cellHeight) / cellHeight;
}

/**
 * **One solid per section, only in cells holding type alone.**
 *
 * A ruled input fails the clearance at any distance, because the field spans
 * its cell's full inner width — so Acquisition carries no solid **by
 * construction rather than by placement**, which is where the first version of
 * the drawing put one, painting over 120px of the Date field's underline. The
 * uploader and the textarea fail the same way by filling their cells, and Tags
 * is excluded by its add chip.
 *
 * Expressed as which CELL of a section may hold one, so the answer is a
 * position rather than a boolean — a section whose second cell holds a control
 * can still ornament its first.
 */
const ORNAMENTED: Partial<Record<string, number>> = {
  /* The pairs. */
  'pressing-detail': 1,
  /* The figure. */
  market: 0,
  /* The prose. */
  snippet: 0,
  /* The series. */
  'price-history': 0,
};

export function ornamentCell(section: string): number | null {
  return ORNAMENTED[section] ?? null;
}

/** Whether this cell of this section may hold a solid at all. */
export function mayOrnament(section: string, cellIndex: number): boolean {
  return ornamentCell(section) === cellIndex;
}

/**
 * The sections that carry a solid. Four, and they are the cells holding only
 * type — not a list chosen first and justified after.
 */
export const ORNAMENTED_SECTIONS = Object.keys(ORNAMENTED);

/** A span's width at a viewport, for the clearance check. */
export function spanWidth(shape: ContentShape, index: number, viewport: number): number {
  return (CONTENT_SPLITS[shape][index] * viewport) / 12;
}
