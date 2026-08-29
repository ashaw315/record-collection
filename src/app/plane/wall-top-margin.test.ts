import { describe, expect, it } from 'vitest';
import { SPINE_HEIGHT } from '../shelf/spine';
import { layoutWall, WALL_EDGE_MARGIN, WALL_TOP_MARGIN } from './wall-layout';

const spines = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `t-${i}`, width: 20 }));

/**
 * **A record whose top edge touches the frame reads as cut off.**
 *
 * Adam, at 100% zoom on a full screen: "the tops are cut off entirely". Measured
 * afterwards, nothing was actually clipped — the spines render their full 240px,
 * starting at the canvas's very first pixel. **Zero margin is the defect**, not
 * a missing pixel: the eye reads a shape touching the frame edge as continuing
 * past it, which is exactly what the horizontal `WALL_EDGE_MARGIN` already
 * exists to prevent.
 *
 * That constant's comment is the argument for this one, unchanged: "QA saw the
 * leftmost spines cut mid-word and the same at the right: the wall bled off both
 * edges... A real shelf has ends." A shelf has a top too.
 */
describe('the wall does not begin on the frame edge', () => {
  it('offsets the first row so its spines do not touch the top', () => {
    const layout = layoutWall({ spines: spines(5), viewportWidth: 1280 });
    const firstRowTop = Math.min(...layout.placed.map((p) => p.y));

    expect(firstRowTop, 'the first row starts below the frame').toBeGreaterThan(0);
    expect(firstRowTop).toBe(WALL_TOP_MARGIN);
  });

  /**
   * Fails against a layout that adds the margin to the rows but not to the
   * wall's own height — which would push the last row's shelf off the bottom.
   */
  it('grows the wall by the margin rather than eating into it', () => {
    const withMargin = layoutWall({ spines: spines(5), viewportWidth: 1280 });
    const contentHeight = Math.max(...withMargin.placed.map((p) => p.y)) + SPINE_HEIGHT;

    expect(
      withMargin.height,
      'the wall is tall enough for the offset content plus its shelf',
    ).toBeGreaterThanOrEqual(contentHeight);
  });

  it('applies to every row, not only when the wall wraps', () => {
    const many = layoutWall({ spines: spines(200), viewportWidth: 1280 });
    const firstRowTop = Math.min(...many.placed.map((p) => p.y));
    expect(firstRowTop).toBe(WALL_TOP_MARGIN);
  });

  /**
   * The vertical margin is its own constant rather than reusing the horizontal
   * one: they answer different questions (a shelf's ends versus the space above
   * the records), and tying them would make one unadjustable without the other.
   */
  it('is a smaller gap than the wall\'s ends, and stated separately', () => {
    expect(WALL_TOP_MARGIN).toBeGreaterThan(0);
    expect(WALL_TOP_MARGIN).toBeLessThanOrEqual(WALL_EDGE_MARGIN);
  });
});
