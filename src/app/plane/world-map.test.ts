import { describe, expect, it } from 'vitest';
import { screenRectToWorld, worldToScreenRect, type ScreenRect } from './world-map';

/**
 * The DOM-rect-to-world-coordinates mapping — the thing A18 named as the
 * renderer's real cost and A19c called the hardest part of this work:
 *
 *   "The record rises out of a spine that is a flex child in a wrapping CSS
 *    row, so the renderer must map a DOM rect into world coordinates and keep
 *    that mapping correct across scroll, resize and re-wrap. That is a number
 *    two systems share."
 *
 * **Every value here is VIEWPORT-relative**, deliberately and stated once:
 * `getBoundingClientRect` is viewport-relative for both the spine and the
 * canvas, so their difference is independent of scroll without any scroll term
 * appearing in the arithmetic. Unit 18's bug was pairing a document-relative
 * measurement with a viewport-relative one; the fix is not to add a correction
 * but to keep everything in one system.
 *
 * The camera is orthographic with the frustum from `squareFrustum`, so world
 * units map linearly to canvas pixels and the mapping is arithmetic rather than
 * a projection.
 */

/** A 420x420 canvas sitting at (480, 580) in the viewport. */
const CANVAS: ScreenRect = { left: 480, top: 580, width: 420, height: 420 };

/** A spine on the wall: narrow, tall, well left of and above the canvas. */
const SPINE: ScreenRect = { left: 120, top: 300, width: 14, height: 160 };

describe('screenRectToWorld — where a spine sits in the scene', () => {
  it('puts a rect centred on the canvas at the world origin', () => {
    /**
     * Fails against the translation terms if either carries an offset. The
     * camera looks at the origin, so a rect at the canvas's own centre must map
     * there — and if it does not, every other position is measured from a lie.
     */
    const centred: ScreenRect = {
      left: CANVAS.left + CANVAS.width / 2 - 10,
      top: CANVAS.top + CANVAS.height / 2 - 10,
      width: 20,
      height: 20,
    };

    const world = screenRectToWorld(centred, CANVAS);

    expect(world.x).toBeCloseTo(0, 6);
    expect(world.y).toBeCloseTo(0, 6);
  });

  it('flips the vertical axis, because screen Y grows down and world Y grows up', () => {
    /**
     * **The axis convention, asserted explicitly** because getting it wrong is
     * unit 18's signature in a new place: one axis right and the other
     * inverted, which reads as "the record flies the wrong way vertically"
     * rather than as a coordinate-system fault.
     *
     * Fails against the `y` term's sign. A spine ABOVE the canvas centre has a
     * smaller screen `top`, and must map to a POSITIVE world y.
     */
    const above: ScreenRect = { ...SPINE, top: CANVAS.top + 40 };
    const below: ScreenRect = { ...SPINE, top: CANVAS.top + CANVAS.height - 200 };

    expect(screenRectToWorld(above, CANVAS).y).toBeGreaterThan(0);
    expect(screenRectToWorld(below, CANVAS).y).toBeLessThan(0);
  });

  it('scales a spine to its real fraction of the canvas', () => {
    /**
     * Fails against the scale terms. A 14px-wide spine on a 420px canvas is
     * 1/30 of the frustum's width — the record must START that size, or the
     * rise begins as a jump from whatever size it happened to be.
     *
     * Width and height are asserted separately because a single shared scale
     * would make a sliver-shaped spine start as a square, which is the wrong
     * shape rather than the wrong size.
     */
    const world = screenRectToWorld(SPINE, CANVAS);

    expect(world.scaleX).toBeCloseTo(14 / 420, 6);
    expect(world.scaleY).toBeCloseTo(160 / 420, 6);
  });

  it('is unchanged by scroll, because both rects move together', () => {
    /**
     * **The fixture unit 18 proved matters**, and the reason it is expressed as
     * two rects moving together rather than as a scroll term.
     *
     * `getBoundingClientRect` is viewport-relative, so scrolling by 400px moves
     * the spine AND the canvas by the same amount and their relationship is
     * untouched. A mapping that ignored scroll and a mapping that handled it
     * correctly agree here — which is exactly why the NEXT test exists.
     */
    const scrolled = 400;
    const spineAfter: ScreenRect = { ...SPINE, top: SPINE.top - scrolled };
    const canvasAfter: ScreenRect = { ...CANVAS, top: CANVAS.top - scrolled };

    expect(screenRectToWorld(spineAfter, canvasAfter)).toEqual(screenRectToWorld(SPINE, CANVAS));
  });

  it('CHANGES when the spine scrolls and the canvas does not', () => {
    /**
     * **The discriminating fixture.** The test above cannot fail: both rects
     * move, so any mapping — including one that silently drops a scroll term —
     * produces the same answer. This one separates them.
     *
     * A spine that scrolls out from under a fixed canvas is a real
     * configuration and it is the one that bit unit 18: two measurements in
     * different frames of reference. Here the arithmetic must notice.
     *
     * Fails against any mapping that uses only the spine's position without
     * relating it to the canvas's.
     */
    const spineOnly: ScreenRect = { ...SPINE, top: SPINE.top - 400 };

    expect(screenRectToWorld(spineOnly, CANVAS)).not.toEqual(screenRectToWorld(SPINE, CANVAS));
  });

  it('maps spines on a second row to different positions than the first', () => {
    /**
     * Fails against the `y` term if it ignores the spine's own top. §10b's wall
     * wraps, so a spine on row two is a real case rather than an edge one, and
     * a mapping that collapsed rows would rise every record from the same
     * height.
     */
    const rowOne: ScreenRect = { ...SPINE, top: 300 };
    const rowTwo: ScreenRect = { ...SPINE, top: 300 + 168 };

    expect(screenRectToWorld(rowTwo, CANVAS).y).toBeLessThan(screenRectToWorld(rowOne, CANVAS).y);
  });

  it('is defined for a zero-sized canvas rather than dividing by zero', () => {
    /**
     * Fails against the division if unguarded. A canvas measured before layout
     * reports 0x0, and `NaN` in a mesh position removes the object from the
     * scene entirely — silently, which is the failure shape this feature keeps
     * meeting.
     */
    const world = screenRectToWorld(SPINE, { left: 0, top: 0, width: 0, height: 0 });

    for (const value of Object.values(world)) expect(Number.isFinite(value)).toBe(true);
  });
});

describe('the round trip — the strongest single assertion', () => {
  it('projects back onto the spine’s own rect', () => {
    /**
     * **If this fails the mapping is wrong regardless of what the animation
     * looks like**, which is the point of asserting it rather than judging the
     * motion. A rise that starts 30px off looks perfectly fine in flight.
     *
     * Fails against either function if they disagree — including the case where
     * both are wrong in the same direction, since the assertion is against the
     * ORIGINAL rect rather than against the other function's idea of it.
     */
    const world = screenRectToWorld(SPINE, CANVAS);
    const back = worldToScreenRect(world, CANVAS);

    expect(back.left).toBeCloseTo(SPINE.left, 4);
    expect(back.top).toBeCloseTo(SPINE.top, 4);
    expect(back.width).toBeCloseTo(SPINE.width, 4);
    expect(back.height).toBeCloseTo(SPINE.height, 4);
  });

  it('round-trips a spine on a scrolled page', () => {
    /**
     * The same assertion under the condition that broke unit 18. Fails against
     * any scroll handling that corrects one axis and not the other — the
     * signature being one axis landing and the other missing.
     */
    const scrolled = 400;
    const spine: ScreenRect = { ...SPINE, top: SPINE.top - scrolled };
    const canvas: ScreenRect = { ...CANVAS, top: CANVAS.top - scrolled };

    const back = worldToScreenRect(screenRectToWorld(spine, canvas), canvas);

    expect(back.left).toBeCloseTo(spine.left, 4);
    expect(back.top).toBeCloseTo(spine.top, 4);
  });

  it('round-trips after a resize changes the canvas', () => {
    /**
     * Fails against any mapping that caches a canvas dimension. A window resize
     * re-wraps the row and moves every spine; a mapping computed against the
     * old canvas would land the record where the slot used to be. The rect is
     * re-measured rather than remembered, and this pins that the arithmetic
     * survives the change.
     */
    const resized: ScreenRect = { left: 300, top: 400, width: 640, height: 640 };
    const back = worldToScreenRect(screenRectToWorld(SPINE, resized), resized);

    expect(back.left).toBeCloseTo(SPINE.left, 4);
    expect(back.top).toBeCloseTo(SPINE.top, 4);
    expect(back.width).toBeCloseTo(SPINE.width, 4);
  });
});
