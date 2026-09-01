import { describe, expect, it } from 'vitest';
import { motionSample, motionTable } from './motion-sample';

/**
 * **THE WHOLE MOTION, VERIFIED TOGETHER RATHER THAN PROPERTY BY PROPERTY.**
 *
 * Adam, after the third regression in this animation: *"every one of them was a
 * property out of step with the others, and every one was found by looking at a
 * screenshot and describing what looked wrong."*
 *
 *   - the blur snapped to full while the record had not moved;
 *   - the record travelled BACKWARDS on a one-row wall while its size held;
 *   - the record slid to centre while still edge-on.
 *
 * Each was invisible to the tests because each property was asserted alone, and
 * each was correct alone. **The defect was always in the relationship.**
 *
 * The two groups below are the design: the record's own motion is ONE movement
 * and must not come apart; the backdrop tracks the rise LINEARLY and is supposed
 * to differ from it — `wallDim`'s own reasoning is that an eased dim arrives
 * ahead of the record.
 */
describe('the record moves as one object', () => {
  /**
   * **The regression this was built for.** Position was lerped inline in
   * `WallScene` with a hardcoded cubic ease-out while `risePose` used
   * ease-in-out, so at t=0.15 the record had travelled 39% of the way to centre
   * having turned 1.3% — sliding to the middle still edge-on.
   *
   * Fails against that split at every sampled point between the endpoints.
   */
  it('advances travel, turn and depth together at every step', () => {
    for (let i = 0; i <= 20; i += 1) {
      const t = i / 20;
      const s = motionSample({ t });
      const turn = 1 - s.rotationY / (Math.PI / 2);

      const values = [s.travel, turn, s.depth];
      const spread = Math.max(...values) - Math.min(...values);
      expect(spread, `at t=${t.toFixed(2)} the record's own properties diverge`).toBeLessThan(
        0.02,
      );
    }
  });

  it('advances them together on the way back too', () => {
    for (let i = 0; i <= 20; i += 1) {
      const t = i / 20;
      const s = motionSample({ t, returning: true });
      const turn = 1 - s.rotationY / (Math.PI / 2);

      const spread = Math.max(s.travel, turn, s.depth) - Math.min(s.travel, turn, s.depth);
      expect(spread, `returning at t=${t.toFixed(2)}`).toBeLessThan(0.02);
    }
  });

  /**
   * Scale is in the group but starts at `startScale` 0.08 rather than 0 — a
   * spine is a real object at a real size, and starting from nothing would read
   * as the record materialising. So it tracks the others' SHAPE without sharing
   * their origin.
   */
  it('scales in step with the rest, allowing for its non-zero start', () => {
    for (let i = 0; i <= 20; i += 1) {
      const t = i / 20;
      const s = motionSample({ t });
      const normalised = (s.scale - 0.08) / (1 - 0.08);
      expect(Math.abs(normalised - s.travel), `at t=${t.toFixed(2)}`).toBeLessThan(0.02);
    }
  });
});

/**
 * **THIS BLOCK IS WHY THE TEST IS NOT "ASSERT EVERYTHING AGREES".**
 *
 * A test that required every column to advance together would be worse than no
 * test: someone would see `blur` and `dim` diverging from the eased group, call
 * it the bug, and ease them — reintroducing exactly the front-loading
 * `wallDim`'s reasoning exists to prevent, with a green suite confirming it.
 *
 * So the divergence that is DESIGNED is asserted as firmly as the agreement
 * that is required. Two groups, two rules, both stated.
 */
describe('the backdrop tracks the rise linearly, and that difference is the design', () => {
  /**
   * `wallDim` is linear deliberately: *"a cubic ease-out is 39% dimmed at 15%
   * progress and would put the record's arrival against an already-dark wall."*
   * The same argument was applied to the blur. So these SHOULD differ from the
   * eased group, and the test states that rather than leaving it to be rederived.
   */
  it('dims and blurs in proportion to raw progress, not to the eased curve', () => {
    for (const t of [0.15, 0.3, 0.5, 0.7]) {
      const s = motionSample({ t });
      expect(s.blurMix, `blur at t=${t}`).toBeCloseTo(t, 6);
      // dim runs 1 -> floor linearly.
      const dimmed = (1 - s.dim) / (1 - 0.1);
      expect(dimmed, `dim at t=${t}`).toBeCloseTo(t, 6);
    }
  });

  /**
   * **The blur clears EARLY on the return** — an asymmetry about attention
   * rather than about the object, which is why it is the opposite of the
   * durations' answer and still correct.
   */
  it('clears the blur before the record is home', () => {
    expect(motionSample({ t: 0.5, returning: true }).blurMix).toBe(0);
    expect(motionSample({ t: 0.1, returning: true }).blurMix).toBeGreaterThan(0);
  });
});

describe('the table', () => {
  it('prints every driven property as a scannable grid', () => {
    const table = motionTable({ steps: 4 });
    expect(table).toContain('travel');
    expect(table).toContain('turn');
    expect(table).toContain('blur');
    expect(table).toContain('dim');
    /* Header plus one row per step, inclusive. */
    expect(table.split('\n')).toHaveLength(6);
  });
});
