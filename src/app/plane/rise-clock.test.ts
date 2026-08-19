import { describe, expect, it } from 'vitest';
import { riseProgress, shouldStartClock } from './rise-clock';

/**
 * When the rise's clock starts, and why it is not simply "the first frame".
 *
 * **The frame log is the only instrument that has answered a question about
 * this animation correctly**, and this is it, kept as a test rather than a
 * scratch probe. Screenshot sampling reported the box SHRINKING — the opposite
 * of the defect — because a screenshot round trip costs ~100ms and never saw
 * the first half of a 620ms rise at all.
 *
 * What the log showed, on `/`:
 *
 *   frame 1  progress 0      elapsed 0ms
 *   frame 2  progress 0.188  elapsed 117ms     <- seven-frame stall
 *   frame 3  progress 0.242  elapsed 150ms
 *   ...      thereafter a clean 16.7ms apart
 *
 * 117ms into a 620ms ease-out is 51% risen. The half where the record is
 * spine-shaped and visibly leaving the wall was never drawn.
 *
 * **Diagnosed before fixing, because "delay the start" and "warm the pipeline"
 * are different answers.** Per-render timings: first draw 45.4ms, every
 * subsequent draw 0.4-0.9ms. That is shader compilation and pipeline setup,
 * which happen on the first `render()` rather than at construction — plus React
 * committing the overlay, scrim and two panels in the same frame. Neither is
 * the animation being slow, so delaying the start would only move the stall.
 *
 * The clock therefore starts on the frame AFTER the pipeline is warm.
 */

describe('shouldStartClock', () => {
  it('does not start on the frame that pays for the first draw', () => {
    /**
     * The whole point. Starting the clock on the warm-up frame is what produced
     * a rise already half over when it became visible.
     *
     * Fails against `shouldStartClock` if it returns true on the first call.
     */
    expect(shouldStartClock({ framesDrawn: 0 })).toBe(false);
  });

  it('starts once a frame has been drawn, and not later than that', () => {
    /**
     * The other half, and the one an over-correction would break: waiting for
     * several warm frames would delay the rise visibly, which is the "delay the
     * start" answer this diagnosis rejected. One drawn frame is what makes the
     * pipeline warm.
     */
    expect(shouldStartClock({ framesDrawn: 1 })).toBe(true);
    expect(shouldStartClock({ framesDrawn: 5 })).toBe(true);
  });
});

describe('riseProgress', () => {
  it('is 0 on the frame the clock starts', () => {
    /**
     * **The property the whole fix exists for**: the first frame anyone sees is
     * at progress 0, spine-shaped, at the slot.
     */
    expect(riseProgress({ now: 1000, startedAt: 1000, durationMs: 620 })).toBe(0);
  });

  it('reaches 1 exactly at the duration and never exceeds it', () => {
    expect(riseProgress({ now: 1620, startedAt: 1000, durationMs: 620 })).toBe(1);
    expect(riseProgress({ now: 9999, startedAt: 1000, durationMs: 620 })).toBe(1);
  });

  it('is monotonic across the whole rise, with no step at the start', () => {
    /**
     * Swept rather than sampled at the ends. The defect being fixed was a JUMP
     * near the start — 0 to 0.188 between two frames — which two endpoint
     * assertions would both pass while missing entirely. Unit 17's finding, in
     * the time axis.
     */
    const steps = Array.from({ length: 40 }, (_, i) =>
      riseProgress({ now: 1000 + i * 16, startedAt: 1000, durationMs: 620 }),
    );

    for (let i = 1; i < steps.length; i += 1) {
      expect(steps[i]).toBeGreaterThanOrEqual(steps[i - 1]);
      // No frame may advance more than one frame's worth of the rise.
      expect(steps[i] - steps[i - 1], `step ${i} jumped`).toBeLessThan(0.05);
    }
  });

  it('treats a zero duration as finished rather than dividing by zero', () => {
    expect(riseProgress({ now: 1000, startedAt: 1000, durationMs: 0 })).toBe(1);
  });
});
