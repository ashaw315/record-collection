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

/** Half a column at the 1440 reference width. */
export const SOLID_WIDTH = 60;

/**
 * Height follows from width by the projection, not from the cell.
 *
 * **Half a column rather than a full one**, and that was a correction rather
 * than a preference: at 120px a solid is 127px tall, and once the gate and the
 * control clearance are both applied there is exactly ONE cell in the region it
 * can legally occupy. A rule permitting one position is not a rule about where
 * ornament goes. At 60px the solid is 64px and the region has four.
 */
export const SOLID_ASPECT = 1.06;
export const SOLID_HEIGHT = Math.round(SOLID_WIDTH * SOLID_ASPECT);

/**
 * **The gate is a ratio on VISIBLE height**: a solid renders only where the
 * part inside the cell is at most two-thirds of the cell's height.
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
 */
export const CONTROL_CLEARANCE = SOLID_WIDTH;

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
export function gatePasses(cellHeight: number): boolean {
  if (cellHeight <= 0) return false;

  /* The solid sits against the bottom, so what is visible is what fits. */
  const visible = Math.min(SOLID_HEIGHT, cellHeight);

  return visible / cellHeight <= GATE_RATIO;
}

/** The visible fraction, for tests and for the drawn ratios below. */
export function visibleRatio(cellHeight: number): number {
  if (cellHeight <= 0) return Number.POSITIVE_INFINITY;
  return Math.min(SOLID_HEIGHT, cellHeight) / cellHeight;
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
