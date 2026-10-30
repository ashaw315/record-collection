import { describe, expect, it } from 'vitest';
import { MARGIN, RUN_A, RUN_B, projection, runPlan, schedule, verdict, windowOf, type Load, type Window } from '../../scripts/window-measure';

/**
 * **The production measurement's judgement, restated before a load is taken
 * (NOTES, 30 Oct, after the aborted run of 29 Oct).** The window occurs in a
 * load where a frame with spines is painted while the document is still
 * `loading`; its width is that frame to interactive. Four outcomes: occurred,
 * none, did not complete within the stated limit (a result about the app,
 * recorded with the stage it reached), and broken (an instrument fault,
 * retaken, and the only outcome the stop counts). Whether the window occurs
 * on production was settled on 29 Oct; the verdict measures how wide.
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

  /* Fails against a two-state judgement, in which a load that finished with no wall reads as a null. */
  it('calls a load that finished with no spine broken, not a null', () => {
    expect(windowOf({ ...marks, spineAt: null, frameAt: null, frameReadyState: null }).kind).toBe('broken');
  });

  /* Fails against the 29 Oct script, which called a recorder that never ran a timeout and then discarded it. */
  it('calls a finished load the recorder never ran in broken', () => {
    expect(windowOf(null).kind).toBe('broken');
  });

  /* Fails against classing a timeout as broken: a load the app did not finish in the limit is a result about the app. */
  it('records a load past its limit as did not complete, with the limit and the stage it reached', () => {
    expect(windowOf(null, { limitMs: 180_000, readAt: null })).toEqual({ kind: 'incomplete', limitMs: 180_000, stage: 'no-response' });
    expect(windowOf({ ...marks, spineAt: null, frameAt: null, frameReadyState: null, interactiveAt: null, hydratedAt: null }, { limitMs: 180_000, readAt: 180_000 }))
      .toEqual({ kind: 'incomplete', limitMs: 180_000, stage: 'no-spine' });
  });

  /* Fails against discarding the marks on a timeout: spines painted while loading and no interactive by the limit is a window at least that wide. */
  it('gives a load past its limit with spines painted while loading the window open at least to the limit', () => {
    expect(windowOf({ ...marks, interactiveAt: null, hydratedAt: null }, { limitMs: 600_000, readAt: 600_110 }))
      .toEqual({ kind: 'incomplete', limitMs: 600_000, stage: 'spine-while-loading', openAtLeastMs: 600_000 });
  });

  /* Fails against a limit that overrides a determined window: interactive reached, the window is known even if hydration was late. */
  it('judges a load that reached interactive by its marks even when the limit ran out waiting for hydration', () => {
    expect(windowOf({ ...marks, hydratedAt: null }, { limitMs: 180_000, readAt: 180_000 })).toEqual({ kind: 'occurred', widthMs: 70 });
  });
});

describe('the runs', () => {
  /* Fails against Run A's cells taken one after another, which lays time of day and Vercel's state over a single cell. */
  it('takes Run A round-robin over its six cells, 20 of each, within 180s', () => {
    expect(RUN_A.cells.map((c) => `${c.cache}/${c.network}`)).toEqual(['cold/none', 'cold/fast-3g', 'warm/none', 'warm/fast-3g', 'warm/slow-3g', 'warm/slow-3g-cpu4']);
    expect(RUN_A.perCell).toBe(20);
    expect(RUN_A.limitMs).toBe(180_000);
    const order = schedule(RUN_A.cells, RUN_A.perCell);
    expect(order).toHaveLength(120);
    expect(order.slice(6, 12)).toEqual(RUN_A.cells);
  });

  it('takes Run B as 5 cold slow-3g loads within 600s, the cpu4 variant dropped', () => {
    expect(RUN_B.cells).toEqual([{ cache: 'cold', network: 'slow-3g' }]);
    expect(RUN_B.perCell).toBe(5);
    expect(RUN_B.limitMs).toBe(600_000);
  });
});

describe('runPlan', () => {
  const sequence = (outcomes: Window[]) => {
    let n = 0;
    return async () => outcomes[n++] ?? { kind: 'none' as const };
  };
  const broken: Window = { kind: 'broken', reason: 'x' };

  /* Fails against the 29 Oct loop, which added one per failed attempt and stopped on 3 loads and one attempt. */
  it('counts broken loads after their retakes, not attempts, and stops at the third', async () => {
    const attempts: number[] = [];
    const result = await runPlan(['a', 'b', 'c', 'd', 'e'], sequence([broken, broken, broken, broken, broken, broken, broken, broken, broken, { kind: 'none' }]), {
      brokenLimit: 3, retakes: 2, record: (_cell, i) => attempts.push(i),
    });
    expect(result.brokenLoads).toBe(3);
    expect(result.stopped).toBe(true);
    expect(attempts).toEqual([0, 0, 0, 1, 1, 1, 2, 2, 2]);
  });

  /* Fails against a loop that counts a retake rescued by its next attempt as a broken load. */
  it('does not count a load whose retake succeeded as broken', async () => {
    const result = await runPlan(['a', 'b'], sequence([broken, { kind: 'none' }, broken, broken, { kind: 'none' }]), { brokenLimit: 3, retakes: 2, record: () => undefined });
    expect(result.brokenLoads).toBe(0);
    expect(result.loads.map((l) => l.window.kind)).toEqual(['none', 'none']);
  });

  /* Fails against retaking or stopping on a load that did not complete: it is a result, kept once. */
  it('keeps a load that did not complete once, and never counts it toward the stop', async () => {
    const late: Window = { kind: 'incomplete', limitMs: 1, stage: 'no-spine' };
    const record: number[] = [];
    const result = await runPlan(['a', 'b', 'c', 'd'], sequence([late, late, late, late]), { brokenLimit: 3, retakes: 2, record: (_c, i) => record.push(i) });
    expect(record).toEqual([0, 1, 2, 3]);
    expect(result.stopped).toBe(false);
    expect(result.loads).toHaveLength(4);
  });
});

describe('projection', () => {
  /* Fails against a projection from the local estimate rather than this run's own first round. */
  it('projects the rest of the run from its first round and says when it passes two hours', () => {
    expect(projection(260_000, 20)).toEqual({ minutes: 82, overTwoHours: false });
    expect(projection(400_000, 20)).toEqual({ minutes: 127, overTwoHours: true });
  });
});

describe('verdict', () => {
  const load = (cell: string, window: Window): Load => ({ cell, window });
  const occurred = (widthMs: number): Window => ({ kind: 'occurred', widthMs });

  /* Fails against a verdict that frames a thin result as reopening whether the window occurs. */
  it('frames the run as measuring the width, the occurrence settled on 29 Oct', () => {
    const v = verdict([load('cold/none', occurred(61))], 20);
    expect(v.sentence).toMatch(/^This run measures how wide the window is\. That it occurs on production at every connection level measured was settled on 29 Oct; a thin or noisy result places the bound less well, and does not reopen whether there is one\./);
  });

  /* Fails against a per-cell line that drops the loads that did not complete, or reports a mean for the widest. */
  it('states each cell: its outcomes, the median width and the widest', () => {
    const v = verdict([
      load('warm/slow-3g', occurred(800)), load('warm/slow-3g', occurred(900)), load('warm/slow-3g', occurred(700)),
      load('warm/slow-3g', { kind: 'none' }), load('warm/slow-3g', { kind: 'incomplete', limitMs: 180_000, stage: 'no-spine' }),
    ], 20);
    expect(v.sentence).toContain('warm/slow-3g: 5 loads; occurred 3, none 1, did not complete within 180s 1; median 800ms, widest 900ms.');
  });

  /* Fails against a bound that is the widest run alone: at n=20 the widest under-reads the tail, and the margin is what absorbs it. */
  it('proposes the bound as the widest run plus a stated margin, with what the margin is for', () => {
    expect(MARGIN).toBe(1.5);
    const v = verdict([load('warm/slow-3g', occurred(821)), load('cold/none', occurred(61))], 20);
    expect(v.boundMs).toBe(1300);
    expect(v.sentence).toContain('The widest completed run was 821ms, in warm/slow-3g. Proposed bound: 1300ms, the widest × 1.5 rounded up to 100ms.');
    expect(v.sentence).toContain('The margin is for two things: at 20 loads a cell the widest observed falls below the cell\'s 95th percentile 36% of the time (0.95^20), and the conditions not measured: Safari and Firefox, real devices and lossy networks, other regions, a larger collection.');
  });

  /* Fails against a margin's reason stated for Run A's 20 loads in Run B's verdict, where it is 5. */
  it('states the sampling shortfall for the run\'s own loads a cell', () => {
    expect(verdict([load('cold/slow-3g', occurred(2000))], 5).sentence).toContain('at 5 loads a cell the widest observed falls below the cell\'s 95th percentile 77% of the time (0.95^5)');
  });

  /* Fails against a verdict that leaves a load open longer than the proposed bound out of sight. */
  it('names the loads that did not complete with the window open longer than the bound', () => {
    const v = verdict([load('warm/slow-3g', occurred(821)), load('cold/slow-3g', { kind: 'incomplete', limitMs: 600_000, stage: 'spine-while-loading', openAtLeastMs: 412_000 })], 20);
    expect(v.sentence).toContain('1 load that did not complete had the window open at least 412000ms, longer than the bound: the bound does not cover it.');
  });

  /* Fails against a verdict that reads a run with no occurrence as a null on the question 29 Oct settled. */
  it('gives no figure from a run with no occurrence, and does not call it a null', () => {
    const v = verdict([load('cold/none', { kind: 'none' })], 20);
    expect(v.boundMs).toBeNull();
    expect(v.sentence).toContain('No load in this run showed the window, so it gives no figure.');
    expect(v.sentence).not.toMatch(/does not occur|no frame with spines/);
  });

  /* Fails against a verdict that counts broken loads among the cells' loads. */
  it('leaves broken loads out of the cells and names how many there were', () => {
    const v = verdict([load('cold/none', occurred(10)), load('cold/none', { kind: 'broken', reason: 'x' })], 20);
    expect(v.sentence).toContain('cold/none: 1 loads;');
    expect(v.broken).toBe(1);
  });
});
