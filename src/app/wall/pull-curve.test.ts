import { describe, expect, it } from 'vitest';
import { PULL_DURATION_MS, pullEase, pullPose } from './pull-curve';

/**
 * **The drawing's five frames are the fixture.** They share one viewBox, so the
 * pulled record's width is measurable at each sample — and those measurements
 * are what these assertions check the curve against, rather than a curve chosen
 * and then asserted to be itself.
 *
 * Measured from `The Wall 5b` §3, pulled-record polygon width per frame:
 *
 *     t=0     17.0    0.0% of travel
 *     t=0.25  74.3   57.9%
 *     t=0.5  103.6   87.5%
 *     t=0.75 114.5   98.5%
 *     t=1    116.0  100.0%
 */
const FRAME_WIDTHS = [17.0, 74.3, 103.6, 114.5, 116.0] as const;
const SEATED = FRAME_WIDTHS[0];
const FINAL = FRAME_WIDTHS[4];

/** What fraction of the total travel each drawn frame represents. */
const drawnTravel = (width: number) => (width - SEATED) / (FINAL - SEATED);

describe('the curve is the one the frames were drawn from', () => {
  it('matches every drawn frame to within a tenth of a percent', () => {
    /*
      The load-bearing test. If the implementation drifts to ease-in-out, or to
      a quad, or to a spring, this fails at t=0.25 by ten percentage points —
      the frames pin the curve rather than merely illustrating it.
    */
    const samples = [0, 0.25, 0.5, 0.75, 1];

    for (const [index, t] of samples.entries()) {
      expect(pullEase(t) * 100, `t=${t} against the drawn frame`).toBeCloseTo(
        drawnTravel(FRAME_WIDTHS[index]) * 100,
        0,
      );
    }
  });

  it('is 88% of the way at halfway, which is the property to watch', () => {
    /**
     * §3: the record reaches 88% of final size at the halfway point and 98% at
     * three-quarters, so **the last third of the duration is almost entirely
     * settling**. Pinned here so the figure is checkable rather than recalled —
     * if the built pull reads as lag, this is the number that says the curve is
     * the suspect and not the duration.
     */
    expect(pullEase(0.5) * 100).toBeCloseTo(87.5, 1);
    expect(pullEase(0.75) * 100).toBeCloseTo(98.4, 1);
  });

  it('starts at rest and ends arrived', () => {
    expect(pullEase(0)).toBe(0);
    expect(pullEase(1)).toBe(1);
  });

  it('clamps rather than extrapolating', () => {
    // A progress outside 0..1 is a caller bug; easing it anyway produces a
    // record that overshoots its own slot on the way back.
    expect(pullEase(-0.5)).toBe(0);
    expect(pullEase(1.5)).toBe(1);
  });

  it('never reverses', () => {
    let previous = -1;
    for (let t = 0; t <= 1.0001; t += 0.01) {
      const value = pullEase(t);
      expect(value, `t=${t.toFixed(2)}`).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });
});

describe('one curve drives all three properties', () => {
  /**
   * **The decision, asserted rather than described.** Separate curves would let
   * the record finish arriving before it finishes growing, and the gesture's
   * claim is that one object is moving. So scale and shear must be derivable
   * from the same eased value at every sample — if either is ever computed from
   * its own curve, these diverge.
   */
  it('derives scale and shear from the same eased value', () => {
    for (const t of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
      const pose = pullPose(t, SEATED, FINAL);

      expect(pose.eased, `t=${t}`).toBeCloseTo(pullEase(t), 10);
      expect(pose.scale, `scale at t=${t}`).toBeCloseTo(
        SEATED + (FINAL - SEATED) * pullEase(t),
        10,
      );
      /* The shear is the SAME curve inverted, not a second one. */
      expect(pose.shear, `shear at t=${t}`).toBeCloseTo(1 - pullEase(t), 10);
    }
  });

  it('resolves the shear to exactly zero when the record has arrived', () => {
    // Front-facing is a state, not an approximation: a residual shear at rest
    // is a record that never finished turning, which is the read this gesture
    // exists to avoid.
    expect(pullPose(1, SEATED, FINAL).shear).toBe(0);
  });

  it('carries full shear while the record is still seated', () => {
    expect(pullPose(0, SEATED, FINAL).shear).toBe(1);
    expect(pullPose(0, SEATED, FINAL).scale).toBe(SEATED);
  });

  /**
   * The frames are samples in TIME, not in arc — so the visual spacing between
   * them is uneven by design, and an implementation that spaced them evenly
   * would be animating a different gesture at the same duration.
   */
  it('spaces the drawn samples unevenly, front-loaded', () => {
    const steps = [0, 0.25, 0.5, 0.75, 1].map(pullEase);
    const deltas = steps.slice(1).map((value, index) => value - steps[index]);

    expect(deltas[0], 'the first quarter moves furthest').toBeGreaterThan(deltas[1]);
    expect(deltas[1]).toBeGreaterThan(deltas[2]);
    expect(deltas[2]).toBeGreaterThan(deltas[3]);
  });
});

describe('the duration is the length of the gesture you can see', () => {
  it('is 1000ms', () => {
    /*
      Was 1400. The first rendering that could measure the gesture found the
      last 467ms carried 3.7% of the travel — at 1050ms and at 1400ms the
      record is not distinguishable by eye. 1400 was never wrong against any
      instrument, because until the pull was built no instrument existed.
    */
    expect(PULL_DURATION_MS).toBe(1000);
  });

  it('spends about two thirds of itself on the visible gesture', () => {
    /**
     * **The dead tail is a property of the CURVE, not of the duration**, which
     * is why shortening the duration does not remove it and why 1400 looked
     * reasonable for so long. A cubic ease-out reaches 97% of travel at
     * t = 0.68, so whatever the duration, the last ~32% of it is hold.
     *
     * At 1400ms that was a ~950ms gesture with 450ms of hold; at 1000ms it is
     * a ~680ms gesture with 320ms. The proportion is unchanged — the duration
     * now describes something perceivable.
     */
    const perceivedEnd = 0.68;
    expect(pullEase(perceivedEnd) * 100).toBeCloseTo(96.7, 1);

    const visibleMs = PULL_DURATION_MS * perceivedEnd;
    expect(visibleMs).toBeCloseTo(680, 0);
    expect(PULL_DURATION_MS - visibleMs).toBeCloseTo(320, 0);
  });
});
