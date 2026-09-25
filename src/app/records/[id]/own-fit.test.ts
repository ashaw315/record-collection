import { describe, expect, it } from 'vitest';
import { construction } from './construction';
import { REAL_RECORD_IDS } from './real-records';
import { ownFitViewBox, boundsOf } from './own-fit';

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
      const [, , sw, sh] = scene.viewBox.split(' ').map(Number);
      const [, , ow, oh] = ownFitViewBox(scene).split(' ').map(Number);
      /* A smaller viewBox over the same cell is a LARGER drawing. */
      expect(ow, `${id.slice(0, 8)}: no wider than the union`).toBeLessThanOrEqual(sw + 0.01);
      expect(oh, `${id.slice(0, 8)}: no taller than the union`).toBeLessThanOrEqual(sh + 0.01);
    }
  });
});
