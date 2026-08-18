import { describe, expect, it } from 'vitest';
import { MAX_TILT_DEGREES, NO_TILT, tiltFor, type Rect } from './tilt';

/**
 * §10b's pulled record is "an object you turn", and the reference this borrows
 * from turns its case ~15-20° off face-on — enough to show it has thickness,
 * never enough to reveal a back. The flip is a separate, deliberate click and
 * keeps its own keyframe.
 *
 * **What is testable is the mapping, not the motion.** Pointer position and the
 * record's rect in, two angles out. The angles reach the compositor through a
 * custom property with no transition, so there is no timing here to test and
 * deliberately no duration in TypeScript.
 */

/** The record settled: a 512px square centred in a 1280×800 viewport. */
const FACE: Rect = { left: 384, top: 144, width: 512, height: 512 };

const centre = { x: FACE.left + FACE.width / 2, y: FACE.top + FACE.height / 2 };

describe('tiltFor — where the pointer points', () => {
  it('is face-on at the centre, on both axes', () => {
    /**
     * Fails against the normalisation in `tiltFor` if either axis carries an
     * offset — a record that is already turned when the pointer is dead centre
     * has no rest position, and every angle after that is measured from a lie.
     */
    expect(tiltFor(centre, FACE)).toEqual({ rotateX: 0, rotateY: 0 });
  });

  it('turns opposite ways at the left and right edges, by equal amounts', () => {
    /**
     * Fails against the `rotateY` term's sign or scaling. Symmetry is what makes
     * it read as an object on an axis rather than a panel being pushed: the same
     * distance either side of centre must give mirrored angles, not merely
     * different ones.
     */
    const left = tiltFor({ x: FACE.left, y: centre.y }, FACE);
    const right = tiltFor({ x: FACE.left + FACE.width, y: centre.y }, FACE);

    expect(left.rotateY).toBeCloseTo(-right.rotateY, 6);
    expect(Math.abs(left.rotateY)).toBeCloseTo(MAX_TILT_DEGREES, 6);
    expect(left.rotateX).toBe(0);
    expect(right.rotateX).toBe(0);
  });

  it('turns opposite ways at the top and bottom edges, by equal amounts', () => {
    /**
     * Fails against the `rotateX` term. Same reasoning as the horizontal case,
     * and it is a separate assertion because a mapping that drives both axes
     * from the same coordinate would pass the test above and fail this one.
     */
    const top = tiltFor({ x: centre.x, y: FACE.top }, FACE);
    const bottom = tiltFor({ x: centre.x, y: FACE.top + FACE.height }, FACE);

    expect(top.rotateX).toBeCloseTo(-bottom.rotateX, 6);
    expect(Math.abs(top.rotateX)).toBeCloseTo(MAX_TILT_DEGREES, 6);
    expect(top.rotateY).toBe(0);
    expect(bottom.rotateY).toBe(0);
  });

  it('leans back at the top, not forward — the sign convention is a decision', () => {
    /**
     * Fails against the `rotateX` sign. In CSS a positive `rotateX` tips the
     * element's top edge AWAY from the viewer. A pointer near the top of the
     * record should tip the top toward the viewer, as tilting a real sleeve to
     * look at it does, so the vertical term is negated where the horizontal one
     * is not. Getting this wrong produces a record that feels hinged the wrong
     * way, which is legible but subtly wrong and easy to ship.
     */
    expect(tiltFor({ x: centre.x, y: FACE.top }, FACE).rotateX).toBeGreaterThan(0);
  });

  it('clamps, so a pointer far outside never turns up the back edge', () => {
    /**
     * Fails against the clamp in `tiltFor`. §10b's tilt must never reveal the
     * back — that is the flip's job, and an unclamped linear mapping would sail
     * past 90° for a pointer anywhere else on the page. The pointer leaves the
     * record constantly (the controls sit right below it), so this is the
     * ordinary case rather than an edge.
     */
    const farAway = tiltFor({ x: -5000, y: -5000 }, FACE);

    expect(Math.abs(farAway.rotateY)).toBeLessThanOrEqual(MAX_TILT_DEGREES);
    expect(Math.abs(farAway.rotateX)).toBeLessThanOrEqual(MAX_TILT_DEGREES);
    expect(MAX_TILT_DEGREES, 'the limit must stay well short of revealing a back').toBeLessThan(
      45,
    );
  });

  it('maps POSITION, not accumulated movement — return to a point, return to its angle', () => {
    /**
     * **The assertion that distinguishes the two designs**, and the reason it is
     * written as a round trip.
     *
     * A single move cannot tell position-mapping from delta-accumulation: both
     * produce an angle, and on a first move from centre both produce the SAME
     * angle. They diverge only over a path. So the pointer goes right, then to a
     * corner, then back to where it started — and an accumulating mapping
     * arrives somewhere else, because it has been adding deltas the whole way.
     *
     * Fails against any future version of `tiltFor` that takes a previous angle
     * or a movement delta as an argument. This project's fixture rule in one
     * line: a fixture where two designs agree cannot tell them apart.
     */
    const start = { x: FACE.left + 100, y: FACE.top + 380 };
    const first = tiltFor(start, FACE);

    tiltFor({ x: FACE.left + FACE.width, y: centre.y }, FACE);
    tiltFor({ x: FACE.left, y: FACE.top }, FACE);
    tiltFor(centre, FACE);

    expect(
      tiltFor(start, FACE),
      'the same pointer position must give the same angle, whatever the path there',
    ).toEqual(first);
  });

  it('is defined for a rect with no area, rather than dividing by zero', () => {
    /**
     * Fails against the normalisation if it divides by `width`/`height`
     * unguarded. A record measured before layout returns a zero-sized rect, and
     * `NaN` in a custom property voids the whole transform silently — the record
     * would sit face-on with no error, which is the shape of both silent no-ops
     * unit 10 found.
     */
    const result = tiltFor({ x: 10, y: 10 }, { left: 0, top: 0, width: 0, height: 0 });

    expect(Number.isFinite(result.rotateX)).toBe(true);
    expect(Number.isFinite(result.rotateY)).toBe(true);
  });
});

describe('the rect it measures against must not be the tilted one', () => {
  it('gives a different angle when the rect grows, which is why the rect must be stable', () => {
    /**
     * **The regression the box exposed, kept as the test that explains it.**
     *
     * `getBoundingClientRect` reports the VISUAL box. Once the record became a
     * box with real depth under `preserve-3d`, a tilted record measured LARGER
     * than an untilted one — 516.8 x 524.5 against 512 x 512, and offset — so
     * feeding that live rect back into the mapping made the angle depend on the
     * angle. The round trip stopped closing: -7.75deg out, -7.730deg back.
     *
     * `tiltFor` is pure and was never wrong; what was wrong was the rect handed
     * to it. This pins the CONSEQUENCE so the reason is not lost: the same
     * pointer over two different rects gives two different angles, therefore the
     * rect must be the record's stable untilted geometry, measured once.
     *
     * Same family as unit 10's Invert measuring an already-inverted element.
     * Both are "the DOM reports what is on screen, not what you laid out".
     */
    const settled: Rect = { left: 384, top: 144, width: 512, height: 512 };
    const whileTilted: Rect = { left: 390.26, top: 114.5, width: 516.84, height: 524.54 };
    const pointer = { x: settled.left + 90, y: settled.top + 380 };

    expect(tiltFor(pointer, whileTilted)).not.toEqual(tiltFor(pointer, settled));
  });
});

describe('the rect must share the pointer’s coordinate system', () => {
  it('drifts by exactly the scroll offset when given a document-relative rect', () => {
    /**
     * **The unit 18 defect, kept as the test that explains it.**
     *
     * `tiltFor` was correct throughout and is not what changed. What was wrong
     * was the rect handed to it: the WebGL renderer walked
     * `offsetLeft`/`offsetTop`, which are DOCUMENT-relative, and paired them
     * with `clientX`/`clientY`, which are VIEWPORT-relative. On a page scrolled
     * by 184px the vertical axis drifted by exactly that much while the
     * horizontal one — which never scrolls on that page — stayed correct. The
     * signature was "tilts down on any pointer move, left/right tracks fine".
     *
     * Measured on screen: the pointer at the record's own visual centre
     * normalised to -0.876 and produced +14° instead of 0, compressing the
     * whole usable range into the bottom tenth of the record.
     *
     * This pins the CONSEQUENCE so the reason survives: the same pointer over
     * two rects that differ only by a scroll offset gives two different angles,
     * therefore the rect must be in the pointer's own coordinate system.
     *
     * Same family as unit 13's Invert measuring an already-inverted element and
     * unit 15's readback: the DOM answers several different questions about
     * "where is this", and they are not interchangeable.
     */
    const scrollY = 184;
    const viewportRelative: Rect = { left: 480, top: 580, width: 420, height: 420 };
    const documentRelative: Rect = { ...viewportRelative, top: viewportRelative.top + scrollY };

    // The pointer at the record's visual centre, in viewport coordinates.
    const centre = {
      x: viewportRelative.left + viewportRelative.width / 2,
      y: viewportRelative.top + viewportRelative.height / 2,
    };

    expect(tiltFor(centre, viewportRelative)).toEqual({ rotateX: 0, rotateY: 0 });

    const drifted = tiltFor(centre, documentRelative);
    expect(drifted.rotateX, 'a document-relative rect tilts a centred pointer').not.toBe(0);
    // The horizontal axis is untouched, which is why the bug looked like a
    // one-axis fault rather than a coordinate-system one.
    expect(drifted.rotateY).toBe(0);
  });
});

describe('NO_TILT', () => {
  it('is face-on, for the reduced-motion reader and the untouched record', () => {
    /**
     * Fails against `NO_TILT`'s declaration if it carries any angle. §10b:
     * "reduced motion disables all of it" — the record is still there and still
     * readable, it simply does not respond to the pointer.
     */
    expect(NO_TILT).toEqual({ rotateX: 0, rotateY: 0 });
  });
});
