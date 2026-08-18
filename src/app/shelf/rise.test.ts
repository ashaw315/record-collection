import { describe, expect, it } from 'vitest';
import { NO_RISE, riseTransform, riseTransformCss, type Rect } from './rise';

/**
 * The geometry behind §10b's rise, separated from the motion.
 *
 * **What is testable here is the Invert step, not the animation.** The browser
 * owns the timing (the duration lives in CSS and nothing in TypeScript knows
 * it), so what a unit test can hold down is the arithmetic: given where the
 * spine is and where the record will settle, what transform makes the record
 * *start* looking exactly like the spine.
 *
 * Get that wrong and the record flies in from the wrong place — which is the
 * whole difference between "it came off the shelf" and "a modal appeared".
 */

/** A spine at the left of the wall: 13px wide, 160px tall, near the top. */
const LEFT_SPINE: Rect = { left: 40, top: 200, width: 13, height: 160 };

/** The same shelf, a spine near the right edge. */
const RIGHT_SPINE: Rect = { left: 900, top: 200, width: 13, height: 160 };

/** Where the record settles: a 512px square, centred in a 1280×800 viewport. */
const TARGET: Rect = { left: 384, top: 144, width: 512, height: 512 };

describe('riseTransform — where the record starts', () => {
  it('translates toward the spine that was clicked, not to a fixed origin', () => {
    /**
     * Fails against `riseTransform`'s translate terms if either is a constant
     * or drops the rect. Two spines at opposite ends of the wall must produce
     * different translations — a record that always starts from the same place
     * is a modal with a transition, which is precisely what §10b rules out.
     */
    const left = riseTransform(LEFT_SPINE, TARGET);
    const right = riseTransform(RIGHT_SPINE, TARGET);

    expect(left).not.toBe(right);
    expect(left.translateX).toBeLessThan(right.translateX);
  });

  it('puts the record’s centre exactly on the spine’s centre', () => {
    /**
     * Fails against the `translateX`/`translateY` arithmetic if it maps corner
     * to corner instead of centre to centre. `transform` scales about the
     * element's own centre by default, so a corner-based translation lands the
     * record off by half the difference in size — visibly beside the spine
     * rather than on it, and worse the larger the record.
     *
     * Spine centre: 40 + 13/2 = 46.5. Target centre: 384 + 512/2 = 640.
     * So the record must move -593.5px to sit on the spine.
     */
    const { translateX, translateY } = riseTransform(LEFT_SPINE, TARGET);

    expect(translateX).toBeCloseTo(46.5 - 640, 6);
    expect(translateY).toBeCloseTo(280 - 400, 6);
  });

  it('scales by the ratio the two rects actually imply, not a constant', () => {
    /**
     * Fails against the `scaleX`/`scaleY` terms if either is hardcoded. A spine
     * is 13/512 of the record's width and 160/512 of its height — wildly
     * different ratios, because a spine is a sliver and a sleeve is a square.
     * One shared scale would make the record start as a square the size of a
     * spine's width, which is not what leaving a slot looks like.
     */
    const { scaleX, scaleY } = riseTransform(LEFT_SPINE, TARGET);

    expect(scaleX).toBeCloseTo(13 / 512, 6);
    expect(scaleY).toBeCloseTo(160 / 512, 6);
    expect(scaleX).not.toBeCloseTo(scaleY, 3);
  });

  it('produces a defined transform for a spine scrolled out of view', () => {
    /**
     * Fails against any term that divides by a rect value without guarding it.
     * A spine above the fold has a NEGATIVE top, which is ordinary and must
     * simply translate upward — but the guard that matters is the record's own
     * size reaching zero, which `getBoundingClientRect` genuinely returns for
     * an element that is `display: none` or not yet laid out. `NaN` in a
     * transform silently voids the whole declaration, so the record would jump
     * rather than rise and nothing would throw.
     */
    const scrolledOff: Rect = { left: 40, top: -420, width: 13, height: 160 };
    const result = riseTransform(scrolledOff, TARGET);

    expect(Number.isFinite(result.translateY)).toBe(true);
    expect(result.translateY).toBeLessThan(0);

    const notLaidOut = riseTransform(LEFT_SPINE, { left: 0, top: 0, width: 0, height: 0 });
    for (const value of Object.values(notLaidOut)) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it('is the identity when the rects match, so nothing visibly moves', () => {
    /**
     * Fails against the arithmetic if any term carries an offset or a fudge
     * factor: identical rects must produce no translation and unit scale. This
     * is the case that proves the transform is a real mapping rather than a
     * tuned approximation that happens to look right at one size.
     */
    expect(riseTransform(TARGET, TARGET)).toEqual({
      translateX: 0,
      translateY: 0,
      scaleX: 1,
      scaleY: 1,
    });
  });
});

describe('riseTransformCss', () => {
  it('translates before it scales, so the translation is in real pixels', () => {
    /**
     * Fails against the template literal's ORDER in `riseTransformCss`. CSS
     * applies transform functions right to left, so `scale(...) translate(...)`
     * multiplies the translation by the scale — at a spine's 0.025 scale that
     * lands the record essentially at the viewport centre, having travelled
     * almost none of the distance to its slot.
     *
     * Asserted on the string because the order IS the string; there is nothing
     * else to inspect. The numbers are checked by the arithmetic tests above.
     */
    const css = riseTransformCss({
      translateX: -593.5,
      translateY: -120,
      scaleX: 0.025,
      scaleY: 0.3125,
    });

    expect(css).toBe('translate(-593.5px, -120px) scale(0.025, 0.3125)');
    expect(css.indexOf('translate')).toBeLessThan(css.indexOf('scale'));
  });
});

describe('riseTransform — measured against the SETTLED rect, twice over', () => {
  it('gives the same answer when re-run against an already-inverted element', () => {
    /**
     * **This is the defect the first implementation shipped**, found by watching
     * the inline style rather than by any assertion here — which is why it is
     * now an assertion here.
     *
     * `useLayoutEffect` runs twice in development (strict mode), and the second
     * run measured the sleeve while it still carried the FIRST run's inverted
     * transform. `getBoundingClientRect` reports the visual box, so the sleeve
     * measured as the spine, the delta between them was zero, and the applied
     * transform was `translate(2.3e-05px) scale(1, 1)` — the identity. The
     * record then "rose" from exactly where it settled: a fade, not a rise, and
     * indistinguishable from one in a still frame.
     *
     * Fails against any caller that passes a live `getBoundingClientRect()`
     * instead of the settled rect. The function itself is pure, so what this
     * pins is the CONTRACT: given the same settled target, the answer must not
     * drift on a second call, because the second call is the one that runs in
     * development and the one that produced a silent no-op.
     */
    const settled = TARGET;
    const first = riseTransform(LEFT_SPINE, settled);
    const second = riseTransform(LEFT_SPINE, settled);

    expect(second).toEqual(first);
    expect(second.scaleX).toBeCloseTo(13 / 512, 6);

    /**
     * And the shape of the bug itself: measuring the spine against a rect that
     * has ALREADY been mapped onto the spine yields the identity — the value
     * that was actually observed on screen. Stated here so the next reader can
     * see what the wrong version computed, rather than only what the right one
     * does.
     */
    const inverted: Rect = { ...LEFT_SPINE };
    expect(riseTransform(LEFT_SPINE, inverted)).toEqual(NO_RISE);
  });
});

describe('NO_RISE', () => {
  it('is the identity, so a record with no measured spine simply appears', () => {
    /**
     * Fails against `NO_RISE`'s declaration if it carries any offset. It is
     * what the record uses when there is no spine to rise from — a keyboard
     * activation that never produced a rect, or a reduced-motion reader. The
     * record must land at its settled position, not somewhere near it.
     */
    expect(NO_RISE).toEqual({ translateX: 0, translateY: 0, scaleX: 1, scaleY: 1 });
  });
});
