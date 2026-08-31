import { describe, expect, it } from 'vitest';
import {
  RISE_DEFAULT_MS,
  RETURN_DEFAULT_MS,
  RETURN_SETTLES_BY_DEFAULT,
  easeRise,
  easeReturn,
  easeReturnSettled,
} from './motion-tuning';

const velocityAt = (f: (t: number) => number, t: number) => (f(t) - f(t - 0.05)) / 0.05;

/**
 * **The pull and the return are different motions, and the numbers say so.**
 *
 * Adam: *"Reaching for something is deliberate, putting it back is casual, and
 * the same duration both ways reads as mechanical."* They shared `RISE_MS = 620`
 * and differed only in curve.
 */
describe('the pull and the return are tuned separately', () => {
  /**
   * **These assertions used to require the return to be FASTER, and that was
   * wrong.** The reasoning was mine — "reaching for something is deliberate,
   * putting it back is casual" — and Adam overturned it by watching the loop:
   * *"A record going back into a slot at speed reads as dropped rather than
   * replaced, and the slowness is what makes it feel handled."*
   *
   * Per CLAUDE.md §2 the change is stated rather than made quietly: the old
   * tests were not wrong about the code, they encoded a judgement that looking
   * overruled. What survives is the property that actually matters — the two
   * durations are separate values, so a change to one has to say whether it
   * means the other.
   */
  it('keeps the two durations as separate constants', () => {
    expect(RISE_DEFAULT_MS).toBeGreaterThan(0);
    expect(RETURN_DEFAULT_MS).toBeGreaterThan(0);
  });

  it('runs both slowly enough to read as handled rather than flicked', () => {
    // The 620ms both motions once shared read as mechanical at this scale.
    expect(RISE_DEFAULT_MS).toBeGreaterThan(1000);
    expect(RETURN_DEFAULT_MS).toBeGreaterThan(1000);
  });

  /**
   * Equal by judgement rather than by definition — but far enough apart from
   * "one is a fraction of the other" that a reintroduced asymmetry is visible
   * here rather than only on screen.
   */
  it('returns at the same pace it rises', () => {
    expect(RETURN_DEFAULT_MS).toBe(RISE_DEFAULT_MS);
  });

  /**
   * **The settled return is the shipping choice, not merely an option.** It was
   * behind a harness toggle defaulting to off; watching decided it.
   */
  it('ships the settled return', () => {
    expect(RETURN_SETTLES_BY_DEFAULT).toBe(true);
  });
});

describe('the curves do what their names claim', () => {
  it('runs 0 to 1 without overshooting, on all three', () => {
    for (const ease of [easeRise, easeReturn, easeReturnSettled]) {
      expect(ease(0)).toBeCloseTo(0, 6);
      expect(ease(1)).toBeCloseTo(1, 6);
      for (let t = 0; t <= 1; t += 0.05) {
        expect(ease(t)).toBeGreaterThanOrEqual(-1e-9);
        expect(ease(t)).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });

  it('never goes backwards, so the record cannot reverse mid-motion', () => {
    for (const ease of [easeRise, easeReturn, easeReturnSettled]) {
      let previous = -Infinity;
      for (let t = 0; t <= 1; t += 0.02) {
        const value = ease(t);
        expect(value).toBeGreaterThanOrEqual(previous - 1e-9);
        previous = value;
      }
    }
  });

  it('has the rise decelerating into its settle', () => {
    expect(velocityAt(easeRise, 1)).toBeLessThan(velocityAt(easeRise, 0.3));
    expect(velocityAt(easeRise, 1)).toBeLessThan(0.2);
  });

  /**
   * **The plain return arrives at full speed** — velocity 1.9 at the last frame
   * against the rise's 0.01. That is the "stopping dead" Adam described, and it
   * is deliberate: a record dropped into a slot does arrive with speed.
   */
  it('has the plain return still accelerating at the end', () => {
    expect(velocityAt(easeReturn, 1)).toBeGreaterThan(1.5);
  });

  /**
   * **The settled variant is the alternative to look at**, decelerating over the
   * last stretch so the record arrives rather than lands. Fails against a curve
   * that merely renames the plain one.
   */
  it('has the settled return decelerating at the end', () => {
    expect(
      velocityAt(easeReturnSettled, 1),
      'the tail eases',
    ).toBeLessThan(velocityAt(easeReturn, 1));
    expect(velocityAt(easeReturnSettled, 1)).toBeLessThan(1);
  });

  it('keeps the settled return brisk through the middle', () => {
    // It should not become an ease-out in disguise: still slow off the mark.
    expect(easeReturnSettled(0.25)).toBeLessThan(0.2);
  });
});
