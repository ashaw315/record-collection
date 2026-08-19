import { describe, expect, it } from 'vitest';
import { BOX_THICKNESS_RATIO } from './BoxCanvas';
import { boxDepth, recordDepth, spineFootprint } from './record-box';
import { MAX_SPINE_WIDTH, MIN_SPINE_WIDTH, SPINE_HEIGHT } from '../shelf/spine';

/**
 * How thick a record is, and how much shelf it occupies — two different
 * quantities that had become two implementations of one.
 *
 * **`WallScene` built its own box at 1:11 and `BoxCanvas` uses 1:25.** That is
 * the shape NOTES records under `genreSubtree` and `hasGatefold`: two
 * implementations of one object, which drift silently as either is tuned.
 * `BoxCanvas`'s own comment named the condition for resolving it — "two
 * renderers, two values, until one replaces the other" — and the wall scene is
 * that replacement.
 *
 * **1:25 is the value chosen by looking**, against 1:40 and 1:70, and it is the
 * one that survives. Unit 16 rendered all three and rejected 1:25 on principle
 * before QA looked and chose it.
 *
 * The boundary that remains is real and is NOT a second thickness: how much
 * shelf a spine occupies is deliberately wider than the record is thick, so
 * spine text can be read at all. §10b's 1:12 is a legibility rule, not a claim
 * about sleeves. Keeping them separate is the point; having two answers to
 * "how thick is a record" was the defect.
 */

describe('recordDepth', () => {
  it('is BoxCanvas\'s ratio, not a second opinion about it', () => {
    /**
     * The assertion that makes the duplication impossible to reintroduce
     * quietly. If someone tunes `BOX_THICKNESS_RATIO` by looking — which is how
     * it was chosen — the wall follows, because it is the same number rather
     * than a copy that agrees today.
     */
    expect(recordDepth(SPINE_HEIGHT)).toBeCloseTo(SPINE_HEIGHT * BOX_THICKNESS_RATIO, 5);
  });

  it('scales with the record, so the ratio holds at any size', () => {
    expect(recordDepth(480) / recordDepth(240)).toBeCloseTo(2, 5);
  });

  it('makes a 240px record about 10px thick, which reads as a surface', () => {
    /**
     * The number QA actually chose, pinned so a refactor cannot drift it. At
     * 1:40 and 1:70 the edge reads as a dark line on a sheet.
     */
    expect(recordDepth(SPINE_HEIGHT)).toBeCloseTo(9.6, 1);
  });
});

describe('the two are reconciled by the RISE, not by picking one', () => {
  it('interpolates from footprint to true thickness as the record comes out', () => {
    /**
     * **The boundary, and why it is not a fudge.** Measured: at 1:25 a 240px
     * record is 9.6px thick, and `spineLabelPlan` fits a glyph across 62% of
     * that — a 6px font, below the ~9px the CSS wall used and illegible. §10b
     * settled this moving from 1:40 to 1:12: a true-thickness spine "becomes
     * colour bars you must hover one at a time to identify."
     *
     * So a spine is drawn at its shelf footprint and the pulled record at its
     * true thickness, and the rise interpolates between them. One object, two
     * states, a transition — rather than two answers to one question.
     */
    const id = 'record-7';
    const atRest = boxDepth({ recordId: id, height: SPINE_HEIGHT, progress: 0 });
    const settled = boxDepth({ recordId: id, height: SPINE_HEIGHT, progress: 1 });

    expect(atRest, 'in the wall: the shelf footprint, so text is legible').toBeCloseTo(
      spineFootprint(id),
      5,
    );
    expect(settled, 'in your hands: the true thickness QA chose').toBeCloseTo(
      recordDepth(SPINE_HEIGHT),
      5,
    );
  });

  it('thins MONOTONICALLY, so the edge never grows on the way out', () => {
    /**
     * Swept rather than checked at the ends. A record whose edge thickened
     * mid-rise before thinning would read as a wobble — the sort of thing the
     * eye catches and a two-point test does not. Unit 17's finding.
     */
    const id = 'record-7';
    const steps = Array.from({ length: 40 }, (_, i) =>
      boxDepth({ recordId: id, height: SPINE_HEIGHT, progress: i / 39 }),
    );

    for (let i = 1; i < steps.length; i += 1) {
      expect(steps[i], `step ${i} thickened`).toBeLessThanOrEqual(steps[i - 1] + 1e-9);
    }
  });
});

describe('spineFootprint', () => {
  it('is WIDER than the record is thick, and that is deliberate', () => {
    /**
     * **The boundary, asserted rather than described.** §10b's 1:12 is how much
     * shelf a spine occupies — deliberately wider than a real sleeve so the
     * spine text the wall depends on is legible at all. 1:40 was arithmetic
     * about sleeve thickness and lost to legibility.
     *
     * Fails if someone "unifies" the two by making the footprint the record's
     * true thickness, which would halve the space for glyphs.
     */
    const id = 'any-record-id';
    expect(spineFootprint(id)).toBeGreaterThan(recordDepth(SPINE_HEIGHT));
  });

  it('stays inside §10b\'s 1:12 spread, so the wall keeps its texture', () => {
    /**
     * Swept across many ids rather than checked at one: the variation is what
     * gives the wall texture instead of a barcode, and a footprint that
     * collapsed to a constant would pass a single-id check.
     */
    const widths = new Set<number>();
    for (let i = 0; i < 200; i += 1) {
      const w = spineFootprint(`record-${i}`);
      expect(w).toBeGreaterThanOrEqual(MIN_SPINE_WIDTH);
      expect(w).toBeLessThanOrEqual(MAX_SPINE_WIDTH);
      widths.add(w);
    }

    expect(widths.size, 'the wall has texture, not one repeated width').toBeGreaterThan(3);
  });

  it('is deterministic per record, so the wall does not reshuffle', () => {
    expect(spineFootprint('same-id')).toBe(spineFootprint('same-id'));
  });
});
