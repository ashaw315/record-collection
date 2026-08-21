import { describe, expect, it } from 'vitest';
import {
  FLANKING_MIN_WIDTH,
  READABLE_RECORD_MIN,
  recordLayout,
  recordWidthWhenFlanked,
} from './record-layout';
import { FACTS_PANEL_WIDTH, ACTIONS_PANEL_WIDTH } from './panel-dimensions';

/**
 * The §10b, A32 layout fork: panels beside the record, or a summary beneath it.
 * The threshold is a measurement, and these pin that it actually leaves the
 * record its readable size — a breakpoint that fits the panels but crushes the
 * record would satisfy a naive check and defeat the point.
 */

describe('recordLayout', () => {
  it('stacks below the threshold and flanks at or above it', () => {
    expect(recordLayout(FLANKING_MIN_WIDTH - 1)).toBe('stacked');
    expect(recordLayout(FLANKING_MIN_WIDTH)).toBe('flanked');
    expect(recordLayout(FLANKING_MIN_WIDTH + 1)).toBe('flanked');
  });

  it('stacks a phone and flanks a desktop', () => {
    expect(recordLayout(390)).toBe('stacked');
    expect(recordLayout(1280)).toBe('flanked');
  });

  /**
   * **The threshold must leave the record its readable minimum**, or the fork is
   * decorative: it would swap a stacked layout for a flanked one in which the
   * record is a stamp, which is worse than the thing it replaced.
   *
   * Fails against a `FLANKING_MIN_WIDTH` set below the real requirement — e.g.
   * Tailwind's `md` (768), where the flanked record is only 282px.
   */
  it('leaves the flanked record at least its readable minimum', () => {
    expect(recordWidthWhenFlanked(FLANKING_MIN_WIDTH)).toBeGreaterThanOrEqual(
      READABLE_RECORD_MIN,
    );
  });

  /**
   * **And `md` (768) would NOT** — asserted so the choice of a measured
   * threshold over an inherited one is a test rather than a comment. 768 fits
   * the panels arithmetically and crushes the record, which is exactly the trap
   * a screen-size label walks into.
   */
  it('rejects Tailwind md as too narrow for the flanking layout', () => {
    const atMd = recordWidthWhenFlanked(768);
    expect(atMd, `at 768px the flanked record is ${atMd}px`).toBeLessThan(READABLE_RECORD_MIN);
  });

  it('the threshold is not a Tailwind breakpoint', () => {
    // Recorded as a test so a later "tidy-up" to md/lg fails rather than passes.
    expect([640, 768, 1024, 1280]).not.toContain(FLANKING_MIN_WIDTH);
  });

  it('derives from the panel widths that are actually rendered', () => {
    /*
      The threshold must be built from the SAME numbers `Panels.tsx` uses. If a
      panel width changes and this constant does not, the room reserved and the
      room used diverge — the two-producers drift. So the arithmetic is checked
      against the shared constants here.
    */
    const bareSum = FACTS_PANEL_WIDTH + ACTIONS_PANEL_WIDTH + 2 * 24 + 48 + READABLE_RECORD_MIN;
    expect(FLANKING_MIN_WIDTH).toBeGreaterThanOrEqual(bareSum);
    // And not wildly larger — the headroom is breathing room, not a second panel.
    expect(FLANKING_MIN_WIDTH - bareSum).toBeLessThan(READABLE_RECORD_MIN);
  });
});
