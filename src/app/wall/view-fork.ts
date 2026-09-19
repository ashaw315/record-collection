import { ARROW_LANE, LANDED_SIZE, LANDING_PAD } from './landing';
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
 * **The fork is the landing's width, not the fixture's (§11.26).** §11.24
 * derived it from the smallest fixture — one shelf of twenty, 442px — which
 * was the right method and the wrong subject: the fork exists to separate
 * the width where the pull works from the width where a tap goes to the
 * record screen instead, so it derives from the pull. The fixture alone left
 * a band from 1044 to about 1280 where the wall was a fixture and the pull
 * had nowhere to land — the failure the fork was written to prevent,
 * surviving inside it. One constant either way: the larger of the fixture
 * and the landing (its two arrow lanes and the 560 cover), beside §11.13's
 * rail and §11.9's facts column, with the region's pad. Derived here rather
 * than written down, so a change to either moves it.
 */
export const RAIL_WIDTH = 148;
export const FACTS_WIDTH = 420;

let fixture: number | null = null;

/** The smallest fixture on screen: one shelf of twenty, every face. */
export function fixtureWidth(): number {
  if (fixture !== null) return fixture;
  const xs = unitPieces(PER_SHELF).flatMap((piece) => piece.faces.flatMap((face) => face.points.map(([x]) => x)));
  fixture = Math.max(...xs) - Math.min(...xs);
  return fixture;
}

/** The landing on screen: the cover with an arrow lane each side. */
export function landingWidth(): number {
  return ARROW_LANE + LANDED_SIZE + ARROW_LANE;
}

export function nearViewMinWidth(): number {
  return Math.ceil(RAIL_WIDTH + FACTS_WIDTH + Math.max(fixtureWidth(), landingWidth()) + LANDING_PAD);
}

/** The viewport's width in px, against the fork. */
export function isFarView(viewportPx: number): boolean {
  return viewportPx < nearViewMinWidth();
}
