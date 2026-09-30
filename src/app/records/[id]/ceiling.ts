import { BANDS, GRID_FORK, NO_SCROLL_HEIGHT, STILL_MARGIN } from './band-geometry';
import type { Construction } from './construction';
import { ownFitViewBox } from './own-fit';
import { columnsFor, upperSpansAt } from './region-rows';

/**
 * **§30's ceiling, as arithmetic on an arrangement's aspect.**
 *
 * "Empty width in the upper band is always narrower than one upper cell": the
 * construction's own empty width once its drawing is bound by the band's
 * height, plus the width beside the cover's square. Width that carries
 * nothing -- §47: the 480 of air at eight columns carries §37's triangle and
 * is not counted, and no cell here is air.
 *
 * Written so §46 can measure it across the id space: an arrangement is legal
 * or illegal everywhere, from its aspect and the page's constants alone.
 * `layout-sweep.spec.ts` reads the same terms off the rendered page on one
 * record; `floor-ceiling-measure.spec.ts` on the seventeen.
 */
export const CEILING = 480;

export type Geometry = 'built' | 'identity-480' | 'identity-520';

/** The band's height at a viewport height: §40/§42, 547/900 of it and never less than 547. */
export function bandAt(height: number): number {
  return Math.max(BANDS.identity, (BANDS.identity / 900) * height);
}

/**
 * The first row's construction cell and the cover cell, by width.
 *
 * - 960 to 1439, built (§41): half the page each.
 * - 960 to 1439, §47's geometry: the identity holds 480 and the construction
 *   takes the rest of the first row; the cover's row splits at 480 too, the
 *   air (uncounted) on the left and the sleeve the rest.
 * - 1440 up (§30, §39): the columns -- 4/4/4 at twelve, 4/5/5 at fourteen,
 *   4/6/6 at sixteen -- growing between count changes.
 */
export function upperRowAt({ width, height, geometry, columns }: { width: number; height: number; geometry: Geometry; /** §30's derivation past the built cap, for measuring eighteen and twenty columns (§48). */ columns?: number }): { stillW: number; sleeveW: number; band: number; innerH: number } {
  const band = bandAt(height);
  /* The cell's inner box: the band less its bottom rule and the still's margin. */
  const innerH = band - 1 - 2 * STILL_MARGIN;
  if (width < GRID_FORK) {
    /* §47 measured 480; §48 rules 520, the cover row split at the same width, the air uncounted. */
    if (geometry === 'identity-480') return { stillW: width - 480, sleeveW: width - 480, band, innerH };
    if (geometry === 'identity-520') return { stillW: width - 520, sleeveW: width - 520, band, innerH };
    return { stillW: width / 2, sleeveW: width / 2, band, innerH };
  }
  const count = columns ?? columnsFor(width);
  const col = width / count;
  /* §30: the identity keeps four; the construction and the cover take the rest between them. */
  const still = columns === undefined ? upperSpansAt(width).still : (count - 4) / 2;
  return { stillW: col * still, sleeveW: col * still, band, innerH };
}

/**
 * The construction cell's inner width: its column less the still's 24px
 * margin a side, and above §18's fork its 1px hairline -- there the vertical
 * is drawn on the still; below it, on the identity. Calibrated against eight
 * rendered readings (29 Sep): exactly 1px high at every width from 1440 up
 * and exact at 1439 until this term.
 */
function stillInnerWidth(stillW: number, width: number): number {
  return stillW - 2 * STILL_MARGIN - (width >= GRID_FORK ? 1 : 0);
}

/** The own-fit drawing's aspect, width over height, of a scene. */
export function aspectOfScene(scene: Pick<Construction, 'forms' | 'disc'>): number {
  const [, , w, h] = ownFitViewBox(scene).split(' ').map(Number);
  return w / h;
}

/** The layout sweep's widths from 960 to 1920: every 6px and each fork ±1. */
export function sweepWidths(from = 960, to = 1920): number[] {
  const forks = [960, 1440, 1680, 1920];
  const widths = new Set<number>();
  for (let w = from; w <= to; w += 6) widths.add(w);
  for (const f of forks) for (const d of [-1, 0, 1]) if (f + d >= from && f + d <= to) widths.add(f + d);
  return [...widths].sort((a, b) => a - b);
}

/**
 * The empty width the upper band shows for an arrangement of this aspect at
 * this window: the construction's inner box less its drawing when the drawing
 * is bound by height. Nothing else in the band carries nothing (§48).
 */
export function emptyWidthAt({ aspect, width, height, geometry, columns }: { aspect: number; width: number; height: number; geometry: Geometry; columns?: number }): number {
  const row = upperRowAt({ width, height, geometry, columns });
  const innerW = stillInnerWidth(row.stillW, width);
  const drawnW = row.innerH * aspect;
  /*
    §48: the strip beside the cover's square is NOT in the sum. It carries the
    sleeve bar and the sleeve block edge to edge (sampled at 1439 × 900 on 29
    Sep, nine points, none paper), and §30 bounds only width that carries
    nothing. Steps 39 and 54 counted it because the sweep took the width
    beside the square as empty whatever painted there.
  */
  return drawnW < innerW ? innerW - drawnW : 0;
}

/**
 * The least aspect at which no width in the set shows more than the ceiling:
 * at each width the bound is (innerW − CEILING) / innerH, and the envelope is
 * the largest of them, with the widths that set it.
 */
export function ceilingEnvelope({ widths, height, geometry, bound = CEILING }: { widths: readonly number[]; height: number; geometry: Geometry; bound?: number }): { minAspect: number; bindingWidths: number[] } {
  let minAspect = 0;
  const at: Array<{ width: number; need: number }> = [];
  for (const width of widths) {
    const row = upperRowAt({ width, height, geometry });
    const innerW = stillInnerWidth(row.stillW, width);
    const need = (innerW - bound) / row.innerH;
    at.push({ width, need });
    if (need > minAspect) minAspect = need;
  }
  const bindingWidths = at.filter((x) => Math.abs(x.need - minAspect) < 1e-6).map((x) => x.width);
  return { minAspect, bindingWidths };
}

/**
 * **§46's envelope: the least aspect legal at every width, at the reference
 * height where the band is at its floor.** A constant of the page's geometry,
 * so a drawing depends only on its id and on constants (§5.1). With the strip
 * counted it was 0.7329 and rejected 5.52% of 5,000 seeded ids; without it
 * (§48) it is 0.3845 against the half-page geometry and rejects none, and
 * 0.7851 against the identity at 520 (§48, step 56), rejecting 11.64% of
 * 5,000 seeded first arrangements -- under §46's 13.8% line, so the identity
 * does not widen. Derived against the first-row geometry §48 rules
 * (`GUARD_GEOMETRY`).
 */
export const GUARD_GEOMETRY: Geometry = 'identity-520';
export const CEILING_ENVELOPE = ceilingEnvelope({ widths: sweepWidths(), height: NO_SCROLL_HEIGHT, geometry: GUARD_GEOMETRY }).minAspect;
