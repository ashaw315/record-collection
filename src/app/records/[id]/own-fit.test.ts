import { describe, expect, it } from 'vitest';
import { construction } from './construction';
import { REAL_RECORD_IDS } from './real-records';
import { ownFitViewBox, boundsOf } from './own-fit';
import { FOOTPRINT_REACH, footprintPoints } from './footprints';

/**
 * §33: "Each record's drawing is scaled to the smaller of its inner box's
 * width and height over its OWN forms and disc... It is then placed by the
 * hash within whatever slack the binding dimension leaves."
 *
 * **The cap is gone.** §33 wrote "capped at 1.5 times the scale the shared
 * frame gave", and Design has since dropped it: the cap was chosen without
 * measuring, and the measured distribution runs 1.263x to 1.662x with no
 * clustering at the bound.
 */
/** §31's shared frame, kept as the record of what every drawing was once fitted to; the module no longer exports it (step 29g). */
const RETIRED_FRAME = '-140 -186 296 314';

describe('§33: the construction fits its own arrangement', () => {
  it('gives every record a viewBox that bounds its own forms', () => {
    for (const id of REAL_RECORD_IDS) {
      const scene = construction(id);
      const box = ownFitViewBox(scene);
      const [x, y, w, h] = box.split(' ').map(Number);
      const bounds = boundsOf(scene);

      expect(x, `${id.slice(0, 8)}: the box starts at or left of the forms`).toBeLessThanOrEqual(bounds.minX + 0.01);
      expect(y, `${id.slice(0, 8)}: the box starts at or above the forms`).toBeLessThanOrEqual(bounds.minY + 0.01);
      expect(x + w, `${id.slice(0, 8)}: the box reaches past the forms' right`).toBeGreaterThanOrEqual(bounds.maxX - 0.01);
      expect(y + h, `${id.slice(0, 8)}: the box reaches past the forms' foot`).toBeGreaterThanOrEqual(bounds.maxY - 0.01);
    }
  });

  /**
   * **The point of the ruling: a record's box is its OWN, not the union.**
   * If every record still got one box, the per-record fit would be the shared
   * frame under a new name and nothing would gain.
   */
  it('gives different arrangements different boxes', () => {
    const boxes = new Set(REAL_RECORD_IDS.map((id) => ownFitViewBox(construction(id))));
    expect(boxes.size, 'the seventeen do not share one frame').toBeGreaterThan(1);
  });

  /**
   * §5.1: a drawing depends only on its id and on constants. §33 confirms a
   * per-record fit satisfies it, because "nothing is fitted to the
   * collection" — so the same id must give the same box every time, and
   * adding records cannot move it.
   */
  it('depends only on the id', () => {
    for (const id of REAL_RECORD_IDS.slice(0, 5)) {
      expect(ownFitViewBox(construction(id))).toBe(ownFitViewBox(construction(id)));
    }
  });

  /**
   * §33: "What is given up is size as a carrier of the hash: a narrow
   * arrangement no longer draws small." Every record's scale can only rise,
   * because the shared frame bounds the union and each record's own bounds
   * are a subset of it.
   */
  it('never draws a record smaller than the shared frame did', () => {
    for (const id of REAL_RECORD_IDS) {
      const scene = construction(id);
      const [, , sw, sh] = RETIRED_FRAME.split(' ').map(Number);
      const [, , ow, oh] = ownFitViewBox(scene).split(' ').map(Number);
      /* A smaller viewBox over the same cell is a LARGER drawing. */
      expect(ow, `${id.slice(0, 8)}: no wider than the union`).toBeLessThanOrEqual(sw + 0.01);
      expect(oh, `${id.slice(0, 8)}: no taller than the union`).toBeLessThanOrEqual(sh + 0.01);
    }
  });
});

/**
 * **The box must contain what is DRAWN, not only the faces.**
 *
 * `ConstructionStill` draws three footprints under each form, offset from its
 * top face by up to (0.8 × 18, 18) units, down and to the right. A box fitted
 * to the faces alone leaves the broadest footprint outside it, and the outer
 * svg clips to its viewBox -- so the shadow is cut, which §5.1 forbids: "a
 * cropped object reports that something went wrong."
 *
 * §31's 16-unit pad hid this by accident. With the pad gone (step 29g) it
 * surfaced as the construction's bottom edge 1.65px outside its cell at 2000,
 * where the fit is height-bound and the hash aligned the drawing to the foot.
 */
describe('§33 with step 29(g): the box contains the footprints', () => {
  it('reaches past the faces by the broadest footprint’s offset', () => {
    for (const id of REAL_RECORD_IDS) {
      const scene = construction(id);
      const [x, y, w, h] = ownFitViewBox(scene).split(' ').map(Number);
      const right = x + w;
      const bottom = y + h;
      for (const form of scene.forms) {
        const top = form.faces.find((f) => f.kind === 'top');
        if (top === undefined) continue;
        for (const [fx, fy] of footprintPoints(top.points, FOOTPRINT_REACH)) {
          expect(fx, `${id.slice(0, 8)}: a footprint’s x is inside the box`).toBeLessThanOrEqual(right + 0.01);
          expect(fy, `${id.slice(0, 8)}: a footprint’s y is inside the box`).toBeLessThanOrEqual(bottom + 0.01);
        }
      }
    }
  });
});
