/**
 * 8a §2.1 — the record detail's three fixed bands and twelve columns.
 *
 * **The total is the bet.** 53 + 547 + 300 = 900 is the whole no-scroll claim
 * at 1440 × 900, and it is spent: an empty module changes nothing about the
 * geometry, because the lower band is 300px whether five cells carry text or
 * one does. That is what makes §6 a question about MARKS rather than about
 * reflow.
 *
 * **The total alone cannot detect a reallocation.** The identity band took the
 * tail's 47px and the sum stayed exactly 900 — so `BAND_TOTAL === 900` passes
 * on both the old bands and the new. The per-band assertions in
 * `band-geometry.test.ts` are what that case exists for.
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
 * **§18's fork, and it needs no new figure: twelve columns of 120.**
 *
 * "The grid is fixed, so the fork is 1440 and needs no new figure: the bands
 * are `repeat(12, 120px)`, not fractions." The page has never reflowed — §7
 * specifies nothing below 1440 — so a fluid `1fr` grid was asking a fixed
 * composition to be a fluid one, and what the 93px identity cell reported was
 * that question rather than a layout to be repaired.
 *
 * Above the fork the columns stay 120 and the composition is centred; below
 * it the twelve become one.
 */
export const GRID_COLUMN = 120;
export const GRID_COLUMNS = 12;
export const GRID_FORK = GRID_COLUMN * GRID_COLUMNS;

/**
 * **§18's floor for the content track, which is §4.2's measure.**
 *
 * "The track's floor and the type's measure are the same number because they
 * are the same decision." A track narrower than its own measure is not a
 * squeezed composition but a different one — the earlier collapse-to-min-content
 * attempt wrapped titles at 196 and `identity-cell.spec.ts` caught it.
 *
 * Full measure holds down to `CONTENT_MEASURE + 2 × CELL_PADDING` = 480; below
 * that the measure itself yields to the column's inner width, which is §4.2's
 * give order's fourth term and reaches 322 at 390.
 */
export const CONTENT_MEASURE = 412;

/**
 * The bands. **53 · 547 · 300, and no tail.**
 *
 * `nav` is 53 because the built `AppHeader` measures 53. 8a's drawing showed
 * 56, and the file says a spec that restates a measurable component's height
 * wrongly is worse than one that omits it.
 *
 * **The identity band took the tail, because the give had to ADD height rather
 * than reallocate it.** 140px of reserve could not absorb 203px of title
 * growth: no rearrangement inside a 500px band closes a 63px shortfall, so the
 * band grew and the only band that could pay was the one drawing nothing.
 *
 * **So the fold is now a composition edge.** With a tail the screen closed on
 * empty paper; it now closes on the record band's own rule — the edge every
 * other band ends on — and nothing may straddle 900.
 *
 * `tail` stays in the type rather than being deleted: it is 0 because it was
 * SPENT, and a removed key would read as a band that never existed. It is also
 * what `record-page-8a.spec.ts` measures 8a's own height against.
 */
export const BANDS = {
  nav: 53,
  identity: 547,
  record: 300,
  tail: 0,
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
/**
 * **§23: 4 / 4 / 4.** The construction takes the fourth column from the cover.
 *
 * §2.1 snapped the upper dividers from 451 and 888 to 480 and 840, and named
 * the identity cell's gain of 29 and the figures cell's loss of 51 — but the
 * construction cell went from a drawn 437 to 360, 18% narrower, and nothing
 * named it. Then the band grew to 547 when the tail moved in. 0.97 in the
 * drawing became 0.658 in the build, and §17 through §22 tried to make the
 * drawing fit a cell the file had introduced one section earlier.
 *
 * Every cell now moves toward the drawing: identity 480 against a drawn 451,
 * construction 480 against 437. The identity cell cannot give the column —
 * its 412 measure needs the 480 (§4, §18) — so the cover does, and its
 * geometry is ruled in `cover-geometry.ts` rather than left to the span.
 */
export const IDENTITY_SPANS = [4, 4, 4] as const;

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
