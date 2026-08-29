/**
 * Row statistics for one horizontal band of a screenshot: the spread and the
 * mean of luminance across that band.
 *
 * Extracted from `e2e/wall-scene.spec.ts`, where the same predicate was written
 * out TWICE — once in the paint poll, once in the measuring scan — and both
 * copies carried the same defect. Two copies of a predicate that must agree is
 * one copy too many; this is the single definition, and it is testable without a
 * browser because it is arithmetic on pixel statistics.
 */
export type RowStats = {
  /** max luminance minus min luminance across the band. */
  range: number;
  /** mean luminance across the band. */
  mean: number;
};

/**
 * The sleeve is a solid block: across the middle of the frame its rows vary by
 * ~0. The wall behind it is vertical stripes of spines and rotated text, varying
 * by ~110. Measured on a twelve-row wall.
 */
export const SLEEVE_MAX_RANGE = 12;

/** Above the dark panel below the sleeve, which measures mean 18-36. */
export const SLEEVE_MIN_LUMINANCE = 50;

/**
 * **The bound whose absence cost five weeks and nine sightings.**
 *
 * The sleeve measures `mean≈65`. The WHITE PAGE HEADING above the canvas
 * measures `mean=250` with `range=0` — uniform and bright, which satisfied
 * `range < 12 && mean > 50` perfectly. The predicate could not tell the sleeve
 * from a blank page, and only the scan's start row separated them, by one pixel.
 *
 * `wall-scene.spec.ts:1093` then failed whenever layout rounding moved that row,
 * reporting the sleeve as clipped at the wall's top edge while it sat 111px
 * clear of it.
 *
 * 160 sits well above the sleeve's ~65 and well below white, so it admits a
 * considerably lighter sleeve without admitting page chrome.
 */
export const SLEEVE_MAX_LUMINANCE = 160;

/**
 * True when a row's statistics are those of the pulled sleeve: uniform across
 * the band, and mid-luminance — brighter than the panel, darker than the page.
 */
export function rowIsSleeve({ range, mean }: RowStats): boolean {
  return range < SLEEVE_MAX_RANGE && mean > SLEEVE_MIN_LUMINANCE && mean < SLEEVE_MAX_LUMINANCE;
}
