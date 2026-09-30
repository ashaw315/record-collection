import { BANDS, GRID_FORK, NO_SCROLL_HEIGHT, STILL_MARGIN } from './band-geometry';
import { bandAt, upperRowAt } from './ceiling';
import type { Construction } from './construction';
import { ownFitViewBox } from './own-fit';
import { TITLE_MEASURE } from './title-steps';

/**
 * **§50 and §52 (step 58): the tint field is capped by the construction's
 * ink, at the construction's minimum across the width range.**
 *
 * §50: "its area is at most the construction's ink." The construction's box
 * overstates the drawing two to three times (ink is 30.5% to 50.0% of it), so
 * the cap is what the mark actually paints. §52: taken at the current width
 * the cap inherits every breakpoint the still's cell has, and with the 4 : 1
 * floor it flipped Wired and Bridge between drawn and suppressed across one
 * pixel at 959/960 and 1439/1440. At its minimum "the field is the same at
 * every width and never outweighs the mark at any of them."
 *
 * **Ink is counted at alpha 0.5**, as §52 allows: a sample at each pixel
 * centre of the still's own viewBox, inside the disc or any face. Shadows are
 * paper. The browser's canvas at alpha ≥ 128 gives the same figure to within
 * edge rounding, which `title-ladder-45.spec.ts` holds to half a point.
 */

type Scene = Pick<Construction, 'forms' | 'disc'>;
type Point = readonly [number, number];

/** Even-odd ray casting; the faces are quads, but nothing here needs convexity. */
function inside(polygon: ReadonlyArray<Point>, px: number, py: number): boolean {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** The fraction of the still's viewBox with a form on it, sampled at pixel centres. */
export function inkCoverage(scene: Scene): number {
  const [x0, y0, w, h] = ownFitViewBox(scene).split(' ').map(Number);
  if (w <= 0 || h <= 0) return 0;
  const covered = new Uint8Array(w * h);
  const paint = (minX: number, minY: number, maxX: number, maxY: number, test: (px: number, py: number) => boolean) => {
    const i0 = Math.max(0, Math.floor(minX - x0));
    const i1 = Math.min(w - 1, Math.ceil(maxX - x0));
    const j0 = Math.max(0, Math.floor(minY - y0));
    const j1 = Math.min(h - 1, Math.ceil(maxY - y0));
    for (let j = j0; j <= j1; j += 1) {
      const py = y0 + j + 0.5;
      for (let i = i0; i <= i1; i += 1) {
        if (covered[j * w + i] === 1) continue;
        if (test(x0 + i + 0.5, py)) covered[j * w + i] = 1;
      }
    }
  };
  const { cx, cy, r } = scene.disc;
  paint(cx - r, cy - r, cx + r, cy + r, (px, py) => (px - cx) ** 2 + (py - cy) ** 2 <= r * r);
  for (const form of scene.forms) {
    for (const face of form.faces) {
      const xs = face.points.map((p) => p[0]);
      const ys = face.points.map((p) => p[1]);
      paint(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), (px, py) => inside(face.points, px, py));
    }
  }
  let n = 0;
  for (const c of covered) n += c;
  return n / (w * h);
}

/**
 * The still's inner box at a width: §44's full row below 960 (rows stay
 * §28's 547 there, whatever the window's height), §48's page-less-520 to
 * 1439, and §39's columns from 1440, each less the margins, and the hairline
 * from the fork. From 960 the band takes the window's height (§42).
 */
export function stillInnerBoxAt(width: number, height: number = NO_SCROLL_HEIGHT): { width: number; height: number } {
  if (width < 960) return { width: width - 2 * STILL_MARGIN, height: BANDS.identity - 1 - 2 * STILL_MARGIN };
  const row = upperRowAt({ width, height, geometry: 'identity-520' });
  return { width: row.stillW - 2 * STILL_MARGIN - (width >= GRID_FORK ? 1 : 0), height: bandAt(height) - 1 - 2 * STILL_MARGIN };
}

/**
 * §52: "every width from 480 up". Within a column count the still's cell only
 * grows with the page, so each count is smallest at its first width.
 */
export const COLUMN_COUNT_WIDTHS = [480, 960, 1440, 1680, 1920] as const;

export function minimumInk(scene: Scene): { area: number; width: number; box: { width: number; height: number }; coverage: number } {
  const coverage = inkCoverage(scene);
  const [, , vbW, vbH] = ownFitViewBox(scene).split(' ').map(Number);
  let best: { area: number; width: number; box: { width: number; height: number } } | null = null;
  for (const width of COLUMN_COUNT_WIDTHS) {
    const inner = stillInnerBoxAt(width);
    const k = Math.min(inner.width / vbW, inner.height / vbH);
    const box = { width: vbW * k, height: vbH * k };
    const area = box.width * box.height * coverage;
    if (best === null || area < best.area) best = { area, width, box };
  }
  if (best === null) throw new Error('no column counts to measure');
  return { ...best, coverage };
}

/** §50: the field's height may not exceed the minimum ink over the field's width. */
export function fieldCapFor(scene: Scene): number {
  return minimumInk(scene).area / TITLE_MEASURE;
}
