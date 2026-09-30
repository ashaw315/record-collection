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

export type Geometry = 'built' | 'identity-480';

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
export function upperRowAt({ width, height, geometry }: { width: number; height: number; geometry: Geometry }): { stillW: number; sleeveW: number; band: number; innerH: number } {
  const band = bandAt(height);
  /* The cell's inner box: the band less its bottom rule and the still's margin. */
  const innerH = band - 1 - 2 * STILL_MARGIN;
  if (width < GRID_FORK) {
    if (geometry === 'identity-480') return { stillW: width - 480, sleeveW: width - 480, band, innerH };
    return { stillW: width / 2, sleeveW: width / 2, band, innerH };
  }
  const col = width / columnsFor(width);
  const spans = upperSpansAt(width);
  return { stillW: col * spans.still, sleeveW: col * spans.sleeve, band, innerH };
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
 * is bound by height, plus the cover cell beyond its square.
 */
export function emptyWidthAt({ aspect, width, height, geometry }: { aspect: number; width: number; height: number; geometry: Geometry }): number {
  const row = upperRowAt({ width, height, geometry });
  const innerW = stillInnerWidth(row.stillW, width);
  const drawnW = row.innerH * aspect;
  const constructionEmpty = drawnW < innerW ? innerW - drawnW : 0;
  const square = Math.min(row.sleeveW, row.band - 1);
  const coverBeside = row.sleeveW - square;
  return constructionEmpty + coverBeside;
}

/**
 * The least aspect at which no width in the set shows more than the ceiling:
 * at each width the bound is (innerW + beside − CEILING) / innerH, and the
 * envelope is the largest of them, with the widths that set it.
 */
export function ceilingEnvelope({ widths, height, geometry, bound = CEILING }: { widths: readonly number[]; height: number; geometry: Geometry; bound?: number }): { minAspect: number; bindingWidths: number[] } {
  let minAspect = 0;
  const at: Array<{ width: number; need: number }> = [];
  for (const width of widths) {
    const row = upperRowAt({ width, height, geometry });
    const innerW = stillInnerWidth(row.stillW, width);
    const square = Math.min(row.sleeveW, row.band - 1);
    const beside = row.sleeveW - square;
    const need = (innerW + beside - bound) / row.innerH;
    at.push({ width, need });
    if (need > minAspect) minAspect = need;
  }
  const bindingWidths = at.filter((x) => Math.abs(x.need - minAspect) < 1e-6).map((x) => x.width);
  return { minAspect, bindingWidths };
}

/**
 * **§46's envelope: the least aspect legal at every width, at the reference
 * height where the band is at its floor.** A constant of the page's geometry,
 * so a drawing depends only on its id and on constants (§5.1). Measured
 * over 5,000 seeded ids on 29 Sep: 0.7329, binding at 1439 and 1920,
 * rejecting 5.52%.
 */
export const CEILING_ENVELOPE = ceilingEnvelope({ widths: sweepWidths(), height: NO_SCROLL_HEIGHT, geometry: 'built' }).minAspect;
