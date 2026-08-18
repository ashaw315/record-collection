import { describe, expect, it } from 'vitest';
import { CHROME_STAGES, chromeStage, type ChromeStage } from './chrome';

/**
 * §10b's rise is a claim about continuity: "it was on the shelf a moment ago
 * and now it is in your hands … a record that fades in centred is a modal
 * wearing a sleeve, and the difference is felt immediately."
 *
 * Unit 10 shipped a rise whose CHROME did not participate. At 15% through the
 * motion the backdrop was already at full dark and the control row already at
 * final size, while the sleeve was still `scale(0.51, 0.65)` and 190px from
 * where it would land — so the record rose out of the shelf into a modal that
 * had already announced itself.
 *
 * **What is testable here is the single source, not the motion.** The durations
 * and easings live in the stylesheet, deliberately and per unit 10's finding
 * that a number needed in two places is a design defect. What a unit test CAN
 * hold down is that the backdrop, the controls and the record all read ONE
 * value — because three independent flags is exactly how they would come apart,
 * and the symptom would be a frame that looks like the defect this unit exists
 * to fix.
 */

describe('chromeStage', () => {
  it('is "settling" while the record is out and not going back', () => {
    /**
     * Fails against `chromeStage`'s return for the resting case. This is the
     * ordinary state: the record has risen and everything around it has caught
     * up. If this returned "rising" the chrome would never resolve.
     */
    expect(chromeStage({ returning: false })).toBe('settling');
  });

  it('is "returning" the moment the record starts going back', () => {
    /**
     * Fails against the `returning` branch. The return is the half that has
     * snapped twice in this project's history, and it is the half where the
     * chrome must lead rather than lag: a backdrop still at full dark when the
     * record is already back in its slot is the same defect in reverse.
     */
    expect(chromeStage({ returning: true })).toBe('returning');
  });

  it('never returns a stage the stylesheet does not define', () => {
    /**
     * Fails against `chromeStage` if it ever grows a branch returning a string
     * with no rule behind it — a silent no-op, because an unknown stage
     * attribute matches no selector and simply leaves the chrome at its
     * default. That is the failure mode unit 10 met twice: nothing throws, and
     * the motion is just quietly absent.
     *
     * `CHROME_STAGES` is what the stylesheet is written against, so this
     * asserts the two agree by construction rather than by inspection.
     */
    for (const returning of [true, false]) {
      const stage = chromeStage({ returning });
      expect(CHROME_STAGES).toContain(stage);
    }
  });

  it('gives one answer per input, so the parts cannot disagree', () => {
    /**
     * **The point of the module**, and it fails against any future version that
     * takes a second argument or reads anything but its input.
     *
     * The backdrop, the controls and the record all render from this one call.
     * Were each to compute its own state — three booleans, three effects — they
     * could desynchronise, and the observable symptom would be a backdrop
     * resolving ahead of the sleeve: precisely the frame this unit was opened
     * to remove, arriving by a different cause. Two causes for one observation
     * is the trap NOTES names.
     */
    const first = chromeStage({ returning: false });
    const second = chromeStage({ returning: false });
    expect(second).toBe(first);

    const stages = new Set<ChromeStage>([
      chromeStage({ returning: false }),
      chromeStage({ returning: true }),
    ]);
    expect(stages.size, 'each state must be distinguishable in the stylesheet').toBe(2);
  });
});
