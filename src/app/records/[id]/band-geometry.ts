/**
 * 8a §2.1 — the record detail's three fixed bands and twelve columns.
 *
 * **The total is the bet.** 53 + 500 + 300 + 47 = 900 is the whole no-scroll
 * claim at 1440 × 900, and it is spent: an empty module changes nothing about
 * the geometry, because the lower band is 300px whether five cells carry text
 * or one does. That is what makes §6 a question about MARKS rather than about
 * reflow.
 *
 * **Heights are fixed, not content-derived.** A band that grew with its content
 * would make the no-scroll claim depend on the record, and the sparse case is
 * the normal case — 16 of 17 records have no journal.
 *
 * **Every band and cell carries its own border, so `box-sizing: border-box` is
 * load-bearing rather than hygiene.** The design's own fix found this: the
 * identity band's rule rendered OUTSIDE its declared 500px, so the arithmetic
 * was right while the rendering was not. With no slack in 900px, a border
 * outside the box breaks the budget silently — which is why the E2E asserts the
 * RENDERED heights and their sum, not these declared numbers.
 */

/** The viewport the composition is drawn for and must not exceed. */
export const NO_SCROLL_HEIGHT = 900;

/**
 * **The grid caps at 1728 and centres; paper bleeds beyond it.**
 *
 * 8a was drawn at 1440 and §2.1's full-bleed sentence is now scoped to this
 * cap. Below it the grid is unchanged — twelve columns across the viewport,
 * no page margin. Above it the bleed becomes margin.
 *
 * **The cap bounds the degradation; it does not remove it.** At 1728 the
 * identity cell is 576px against a fixed 412px measure, the diagonals have
 * flattened as far as the cap allows, and the cover has already dropped from
 * 83% of the artwork visible. The page at 1728 is partway degraded on all three
 * axes and stays there — that is the chosen worst case rather than a fix, and
 * reading the cap as having solved it is the mistake to avoid.
 */
export const MAX_GRID_WIDTH = 1728;

/**
 * The four bands.
 *
 * `nav` is 53 because the built `AppHeader` measures 53. 8a's drawing showed
 * 56, and the file says a spec that restates a measurable component's height
 * wrongly is worse than one that omits it — so the three pixels went to the
 * tail, the only band with nothing drawn in it.
 *
 * `identity` and `record` keep their drawn heights exactly: §7's open questions
 * — the 72 title's measure, the journal cell's capacity — are measured against
 * them, so they must not absorb adjustments made elsewhere.
 *
 * The tail is paper, not a footer.
 */
export const BANDS = {
  nav: 53,
  identity: 500,
  record: 300,
  tail: 47,
} as const;

export const BAND_TOTAL = BANDS.nav + BANDS.identity + BANDS.record + BANDS.tail;

/**
 * Upper band: 4 / 3 / 5 — identity, the rendered still, the sleeve.
 *
 * **On the grid rather than on the raster.** Measured off 8a's raster the
 * dividers fall at 451 and 888 against the grid's 480 and 840; the identity
 * cell gains 29px and the figures cell loses 51. §2.1 states the rounding
 * rather than hiding it, because it is visible — and the proportions the
 * composition is doing survive it.
 */
export const IDENTITY_SPANS = [4, 3, 5] as const;

/**
 * Lower band: 3 / 2 / 2 / 2 / 3 — provenance, matrix, release year, market,
 * journal-and-about.
 *
 * Widest at both ends with the two narrow interior cells flanking the figures:
 * that is the proportion, and it survives the rounding from the raster's
 * 310 / 262 / 291 / 259 / 318.
 */
export const LOWER_SPANS = [3, 2, 2, 2, 3] as const;

/** One column, at a given viewport. The page bleeds — there is no container. */
export function columnWidth(viewport: number): number {
  return viewport / 12;
}

/** What a span of columns measures at a given viewport. */
export function spanWidth(span: number, viewport: number): number {
  return span * columnWidth(viewport);
}
