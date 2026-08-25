import { describe, expect, it } from 'vitest';
import { viewRegionCentre } from './view-region-centre';

/**
 * **Where a pulled record is aimed, when the wall is SHORTER than the viewport.**
 *
 * §10b: the record comes off the shelf. When the wall is one row at the top of
 * a tall canvas, the record belongs over that row — not floating in the middle
 * of the black field below it.
 *
 * **The condition these tests pin has never executed before.**
 * `WallScene.tsx` sizes the scene surface `max(layout.height, viewportFloor)`,
 * so a collection tall enough to fill the viewport makes those equal and the
 * two heights coincide. They diverge only when the wall is SHORT — and every
 * previous test and every manual QA pass ran against 125 records, where
 * `layout.height` was thousands. Removing the wall seed left four records and
 * executed the padded branch for the first time.
 *
 * So the fixtures here express **"the wall is shorter than the viewport"**
 * rather than any particular width: 879 (the width this was found at) is
 * neither of the two widths the feature was built against, and pinning it would
 * encode the accident rather than the case.
 */

/** One row of spines: 240px sleeve + 8px shelf edge. Shorter than any viewport. */
const SHORT_WALL = 248;
/** Six rows — taller than the viewports below, so the surface is NOT padded. */
const TALL_WALL = 1488;

describe('a wall SHORTER than the viewport', () => {
  /**
   * Fails against the shipped arithmetic, which aims at the centre of the
   * visible slice of the PADDED SURFACE — canvas-y 388 for this case, ~195px
   * below a wall that ends at 248.
   */
  it('aims the record at the wall content, not at the padded surface below it', () => {
    const aim = viewRegionCentre({
      wallContentHeight: SHORT_WALL,
      sceneHeight: 974,
      canvasDocTop: 197,
      scrollY: 0,
      viewportHeight: 974,
      halfSleevePx: 268,
    });

    expect(aim).toBeLessThanOrEqual(SHORT_WALL);
    expect(aim).toBeGreaterThanOrEqual(0);
  });

  /**
   * Fails against an implementation that clamps to the content but ignores
   * where the content's centre is — the record should sit ON the row, which for
   * a one-row wall means the row's own middle.
   */
  it('centres on the wall content when it fits', () => {
    const aim = viewRegionCentre({
      wallContentHeight: SHORT_WALL,
      sceneHeight: 974,
      canvasDocTop: 197,
      scrollY: 0,
      viewportHeight: 974,
      halfSleevePx: 60,
    });

    expect(aim).toBeCloseTo(SHORT_WALL / 2, 0);
  });

  /**
   * **The phone case, and it is the same bug rather than a second one.**
   *
   * Measured before the fix: at 390×844 with four records the record landed
   * 107px below the shelf — smaller than desktop's 195 only because a shorter
   * viewport pads less. Nothing protected mobile; the 125-record fixture did.
   */
  it('does the same on a phone-sized viewport', () => {
    const aim = viewRegionCentre({
      wallContentHeight: SHORT_WALL,
      sceneHeight: 844,
      canvasDocTop: 197,
      scrollY: 0,
      viewportHeight: 844,
      halfSleevePx: 232,
    });

    expect(aim).toBeLessThanOrEqual(SHORT_WALL);
  });
});

describe('a wall TALLER than the viewport — the behaviour that already worked', () => {
  /**
   * **The regression guard, and the reason the fix cannot simply always use the
   * content centre.**
   *
   * On a real collection the wall is thousands of pixels tall and scrolls. The
   * record must follow the READER — the centre of what they are looking at —
   * because the content centre would be far off-screen. This is the case 125
   * records exercised and the one manual QA approved.
   */
  it('follows the visible region when the wall is taller than the view', () => {
    const aim = viewRegionCentre({
      wallContentHeight: TALL_WALL,
      sceneHeight: TALL_WALL,
      canvasDocTop: 197,
      scrollY: 0,
      viewportHeight: 974,
      halfSleevePx: 200,
    });

    // The visible slice runs page-y 197..974 -> canvas-y 0..777, centre ~388.
    expect(aim).toBeCloseTo(388.5, 0);
  });

  /**
   * Fails against an implementation that ignores scroll — the record would
   * appear where the reader was rather than where they are.
   */
  it('moves with the scroll on a tall wall', () => {
    const atTop = viewRegionCentre({
      wallContentHeight: TALL_WALL, sceneHeight: TALL_WALL, canvasDocTop: 197,
      scrollY: 0, viewportHeight: 974, halfSleevePx: 200,
    });
    const scrolled = viewRegionCentre({
      wallContentHeight: TALL_WALL, sceneHeight: TALL_WALL, canvasDocTop: 197,
      scrollY: 600, viewportHeight: 974, halfSleevePx: 200,
    });

    expect(scrolled).toBeGreaterThan(atTop);
  });
});

describe('the sleeve still has to fit', () => {
  /**
   * Fails against a fix that centres on content and forgets the clamp: a record
   * taller than the region it is centred in gets clipped, which is the ORIGINAL
   * defect this arithmetic was built to solve (see `pulled-destination.ts`).
   */
  it('a sleeve too tall for a short wall is centred rather than pinned to an edge', () => {
    const aim = viewRegionCentre({
      wallContentHeight: SHORT_WALL,
      sceneHeight: 974,
      canvasDocTop: 197,
      scrollY: 0,
      viewportHeight: 974,
      // Half-sleeve larger than the whole wall content: it cannot fit.
      halfSleevePx: 400,
    });

    expect(aim).toBeCloseTo(SHORT_WALL / 2, 0);
  });
});
