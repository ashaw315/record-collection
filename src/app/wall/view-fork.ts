import { LANDING_PAD } from './landing';
import { PER_SHELF, unitPieces } from './unit';

/**
 * **The narrow shelf is the far view (§11.24), and the fork is measured.**
 *
 * §11.1 leaves the label as the only channel that identifies, and the label
 * needs its face at 1:1 — so the near view cannot shrink, and at 390px it
 * holds about two seats, which is not a fixture. The far view has no width
 * floor at all: its labels are absent rather than shrunk, and it is the
 * collection as an object, the one thing a narrow screen can still show.
 *
 * The fork is the width where the near view stops being a fixture. The
 * smallest fixture is one shelf of twenty (442px on screen, §11.10's unit),
 * and the near view shows it beside §11.13's rail and §11.9's facts column
 * with the region's pad: 148 + 420 + 442 + 34. Below that the pulled state
 * does not exist to be presented either way — which is where §11.8's
 * withdrawn fork actually was. Derived here rather than written down, so a
 * change to the fixture moves it.
 */
export const RAIL_WIDTH = 148;
export const FACTS_WIDTH = 420;

let cached: number | null = null;

export function nearViewMinWidth(): number {
  if (cached !== null) return cached;
  const xs = unitPieces(PER_SHELF).flatMap((piece) => piece.faces.flatMap((face) => face.points.map(([x]) => x)));
  cached = Math.ceil(RAIL_WIDTH + FACTS_WIDTH + (Math.max(...xs) - Math.min(...xs)) + LANDING_PAD);
  return cached;
}

/** The viewport's width in px, against the fork. */
export function isFarView(viewportPx: number): boolean {
  return viewportPx < nearViewMinWidth();
}
