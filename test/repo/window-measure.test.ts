import { describe, expect, it } from 'vitest';
import { CELLS, schedule, verdict, windowOf, type Load } from '../../scripts/window-measure';

/**
 * **The production measurement's judgement, fixed before a load is taken
 * (NOTES, 29 Oct 18:30).** The window occurs in a load where a frame with
 * spines is painted while the document is still `loading`; its width is that
 * frame to interactive. A load that never reached interactive or never
 * showed a spine is broken, a third state, and never counts as a load in
 * which the window did not occur. The verdict's null sentence is the only
 * claim a null licenses, and states its counts and bound.
 */
const marks = { spineAt: 100, frameAt: 110, frameReadyState: 'loading', interactiveAt: 180, hydratedAt: 300 };

describe('windowOf', () => {
  /* Fails against a width taken from the spine's insertion rather than the painted frame. */
  it('counts a frame with spines painted while loading, its width to interactive', () => {
    expect(windowOf(marks)).toEqual({ kind: 'occurred', widthMs: 70 });
  });

  /* Fails against a test of the width alone: interactive after the frame says nothing if the frame was not painted while loading. */
  it('does not count a frame painted after the document stopped loading', () => {
    expect(windowOf({ ...marks, frameReadyState: 'interactive' })).toEqual({ kind: 'none' });
  });

  /* Fails against a two-state judgement, in which a load that never finished reads as a null. */
  it('calls a load with no spine or no interactive broken, not a null', () => {
    expect(windowOf({ ...marks, spineAt: null, frameAt: null, frameReadyState: null }).kind).toBe('broken');
    expect(windowOf({ ...marks, interactiveAt: null }).kind).toBe('broken');
  });
});

describe('schedule', () => {
  /* Fails against cells taken one after another, which lays time of day and Vercel's state over a single cell. */
  it('takes the cells round-robin, 30 of each, 240 in all', () => {
    const order = schedule(CELLS, 30);
    expect(CELLS).toHaveLength(8);
    expect(order).toHaveLength(240);
    expect(order.slice(0, 8)).toEqual(CELLS);
    expect(order.slice(8, 16)).toEqual(CELLS);
  });

  it('covers both caches by the four network levels', () => {
    expect(CELLS.map((c) => `${c.cache}/${c.network}`)).toEqual([
      'cold/none', 'cold/fast-3g', 'cold/slow-3g', 'cold/slow-3g-cpu4',
      'warm/none', 'warm/fast-3g', 'warm/slow-3g', 'warm/slow-3g-cpu4',
    ]);
  });
});

describe('verdict', () => {
  const load = (cell: string, kind: 'occurred' | 'none' | 'broken', widthMs = 0): Load => ({ cell, window: kind === 'occurred' ? { kind, widthMs } : kind === 'broken' ? { kind, reason: 'x' } : { kind } });

  /* Fails against a verdict that reads "does not occur": only the counted claim is available. */
  it('states a null as counted loads under named conditions with the per-cell bound', () => {
    const loads = [...Array.from({ length: 30 }, () => load('cold/none', 'none')), ...Array.from({ length: 30 }, () => load('warm/none', 'none'))];
    const v = verdict(loads);
    expect(v.occurred).toBe(false);
    expect(v.sentence).toBe('In 60 loads across 2 conditions (cold/none 30, warm/none 30), no frame with spines was painted while the document was loading; per condition, below 10% of loads at 95% (3/30).');
    expect(v.sentence).not.toMatch(/does not occur/);
  });

  /* Fails against a bound computed from the run's total rather than the smallest cell. */
  it('takes the bound from the smallest cell', () => {
    const loads = [...Array.from({ length: 30 }, () => load('cold/none', 'none')), ...Array.from({ length: 20 }, () => load('warm/none', 'none'))];
    expect(verdict(loads).sentence).toMatch(/below 15% of loads at 95% \(3\/20\)\.$/);
  });

  /* Fails against a verdict that counts broken loads among the nulls. */
  it('leaves broken loads out of the counts and names how many there were', () => {
    const v = verdict([load('cold/none', 'none'), load('cold/none', 'broken')]);
    expect(v.sentence).toMatch(/^In 1 loads across 1 conditions \(cold\/none 1\)/);
    expect(v.broken).toBe(1);
  });

  /* Fails against a positive that reports a typical width: the bound is built from the widest. */
  it('states a positive with its count and its widest run, by cell', () => {
    const v = verdict([load('cold/none', 'none'), load('cold/slow-3g', 'occurred', 40), load('cold/slow-3g', 'occurred', 410)]);
    expect(v.occurred).toBe(true);
    expect(v.sentence).toBe('The window occurred in 2 of 3 loads; the widest run was 410ms, in cold/slow-3g.');
  });
});
