import { describe, expect, it } from 'vitest';
import { boundsFor, radiusFor, CANVAS_WIDTH, CANVAS_HEIGHT } from './graph-layout';

/**
 * These exist because the FIRST rendered screenshot was wrong in a way no test
 * would have caught: the header read "7 nodes" while four were visible, the
 * rest having been pushed outside a fixed 900×560 viewBox by the charge force.
 *
 * CLAUDE.md §2 — the probe that found it becomes a test. Verification that does
 * not survive the session did not happen.
 */

describe('boundsFor', () => {
  it('contains a node that settled far outside the nominal canvas', () => {
    /**
     * The exact defect. A node at x=1400 is beyond the 900-wide canvas, so a
     * fixed viewBox clipped it entirely.
     */
    const bounds = boundsFor([
      { x: 450, y: 280 },
      { x: 1400, y: 300 },
    ]);

    expect(bounds.x + bounds.w, 'the right edge is past the far node').toBeGreaterThan(1400);
  });

  it('contains a node at negative coordinates', () => {
    // Charge pushes both ways; the top-left is clipped just as easily.
    const bounds = boundsFor([
      { x: -300, y: -200 },
      { x: 450, y: 280 },
    ]);

    expect(bounds.x).toBeLessThan(-300);
    expect(bounds.y).toBeLessThan(-200);
  });

  it('never zooms past 1:1 for a graph that would fit', () => {
    /**
     * Two adjacent nodes must not be stretched across the whole canvas: an
     * inflated picture of a small collection is the §8.1 failure arrived at
     * from the opposite direction.
     */
    const bounds = boundsFor([
      { x: 440, y: 280 },
      { x: 460, y: 300 },
    ]);

    expect(bounds.w).toBe(CANVAS_WIDTH);
    expect(bounds.h).toBe(CANVAS_HEIGHT);
  });

  it('falls back to the canvas for an empty graph', () => {
    expect(boundsFor([])).toEqual({ x: 0, y: 0, w: CANVAS_WIDTH, h: CANVAS_HEIGHT });
  });

  it('treats a node with no computed position as the origin rather than NaN', () => {
    // `SimulationNodeDatum.x` is optional; a NaN here silently blanks the SVG.
    const bounds = boundsFor([{}, { x: 200, y: 200 }]);

    expect(Number.isNaN(bounds.x)).toBe(false);
    expect(Number.isNaN(bounds.w)).toBe(false);
  });
});

describe('radiusFor', () => {
  it('grows with the owned count', () => {
    expect(radiusFor(9)).toBeGreaterThan(radiusFor(1));
  });

  it('grows by AREA, not radius', () => {
    /**
     * §8.1 says radius scales with `ownedCount`; doing that linearly would draw
     * 9 records at 81 times the area of 1. The square root keeps the visual
     * weight proportional to the count.
     */
    const one = radiusFor(1) - 6;
    const nine = radiusFor(9) - 6;

    expect(nine / one).toBeCloseTo(3, 5);
  });

  it('gives a zero-record node a visible radius', () => {
    // Genre nodes can legitimately reach zero; an invisible dot that still
    // occupies simulation space is the failure §8.1 names for people-as-nodes.
    expect(radiusFor(0)).toBeGreaterThan(0);
  });
});
