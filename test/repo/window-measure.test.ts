import { describe, expect, it } from 'vitest';
import { CANDIDATES_MS, COVER_BLOCK, DELAYS_MS, RUN_A, RUN_B, RUN_CAUSE, cellName, conditionMade, coverSummary, heldWaits, loadsOfLog, pressOutcome, pressesOfLog, projection, runPlan, schedule, verdict, windowOf, type Load, type Window } from '../../scripts/window-measure';

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

describe('the cause run (the coordinator, 30 Oct: one run, both questions)', () => {
  /* Fails against a press taken among the marks' loads: a press perturbs hydration, so the two are separate cells. */
  it('takes 80 loads round-robin: two cover conditions at slow-3g, and cold/fast-3g marked and pressed', () => {
    expect(RUN_CAUSE.cells.map(cellName)).toEqual(['covers-cold/slow-3g', 'fully-warm/slow-3g', 'cold/fast-3g', 'cold/fast-3g/press']);
    expect(RUN_CAUSE.perCell).toBe(20);
    expect(RUN_CAUSE.limitMs).toBe(180_000);
  });

  /* Fails against route(), which turns the HTTP cache off, or a pattern that misses the Blob host the covers come from. */
  it('blocks covers by the Blob host', () => {
    expect(COVER_BLOCK).toBe('*.public.blob.vercel-storage.com*');
  });
});

describe('coverSummary', () => {
  const net = {
    documentStartTs: 100,
    documentEndTs: 105,
    covers: [
      { startTs: 100.5, endTs: 101, fromCache: false, bytes: 1000 },
      { startTs: 100.5, endTs: 103, fromCache: false, bytes: 2000 },
      { startTs: 100.6, endTs: null, fromCache: false, bytes: null },
      { startTs: 100.6, endTs: 100.7, fromCache: true, bytes: 10 },
      { startTs: 104, endTs: 104.5, fromCache: false, bytes: 500 },
    ],
  };

  /* Fails against a cover counted in flight before it started, after it finished, or left out when the load ended first. */
  it('counts the covers in flight at the frame and at interactive, on the document\'s clock', () => {
    const c = coverSummary(net, { ...marks, frameAt: 600, interactiveAt: 3000 });
    expect(c.inFlightAtFrame).toBe(3);
    expect(c.inFlightAtInteractive).toBe(1);
  });

  /* Fails against a document end read from the marks: when its last byte arrived is what the tail question turns on. */
  it('states when the document\'s last byte arrived, and the covers cached, fetched and their bytes', () => {
    expect(coverSummary(net, marks)).toMatchObject({ documentEndMs: 5000, covers: 5, fromCache: 1, bytes: 3510 });
  });

  /* Fails against a null document end read as zero: a load that ended before the last byte has no figure. */
  it('gives no document end when the load ended first', () => {
    expect(coverSummary({ ...net, documentEndTs: null }, marks).documentEndMs).toBeNull();
  });
});

describe('conditionMade', () => {
  const summary = (covers: number, fromCache: number) => ({ documentEndMs: 1, covers, fromCache, bytes: 0, inFlightAtFrame: 0, inFlightAtInteractive: 0 });

  /* Fails against a load labelled for a state the warm-up did not make, which is what Run A's warm cells turned out to be. */
  it('refuses a fully warm load with a cover fetched, and a covers-cold load with a cover cached', () => {
    expect(conditionMade('fully-warm', summary(43, 43))).toBe(true);
    expect(conditionMade('fully-warm', summary(43, 42))).toBe(false);
    expect(conditionMade('covers-cold', summary(43, 0))).toBe(true);
    expect(conditionMade('covers-cold', summary(43, 1))).toBe(false);
  });

  /* Fails against a load that saw no covers passing both: a pattern that matches nothing makes either condition vacuously true. */
  it('refuses a load in which no cover was seen', () => {
    expect(conditionMade('covers-cold', summary(0, 0))).toBe(false);
    expect(conditionMade('fully-warm', summary(0, 0))).toBe(false);
  });
});

describe('pressOutcome', () => {
  /* Fails against a two-state reading: a press that neither navigated nor pulled is the original defect, and must have its own name. */
  it('names navigated, pulled and dropped', () => {
    expect(pressOutcome({ navigated: true, pullStarts: 0 })).toBe('navigated');
    expect(pressOutcome({ navigated: false, pullStarts: 1 })).toBe('pulled');
    expect(pressOutcome({ navigated: false, pullStarts: 0 })).toBe('dropped');
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

describe('loadsOfLog', () => {
  const line = (cell: string, i: number, window: Window, marks: unknown = null) => JSON.stringify({ label: 'run-a', cell, i, at: 'x', load: [1, 1], marks, window, ms: 1 });

  /* Fails against reading every line as a load: the log has one line per attempt, and a retaken load is its last attempt, as runPlan keeps it. */
  it('reads a log of attempts as its loads, a retaken load as its last attempt', () => {
    const log = [line('a', 0, { kind: 'broken', reason: 'x' }), line('a', 0, { kind: 'none' }), line('b', 1, { kind: 'none' }), ''].join('\n');
    expect(loadsOfLog(log).map((l) => [l.cell, l.window.kind])).toEqual([['a', 'none'], ['b', 'none']]);
  });

  /* Fails against the wait taken to interactive, which stops the hold's clock 16s early on cold/fast-3g. */
  it('takes an occurred load\'s wait from its frame to the hydrated mark', () => {
    const log = line('a', 0, { kind: 'occurred', widthMs: 70 }, marks);
    expect(loadsOfLog(log)[0].waitMs).toBe(190);
  });

  /* Fails against an unknown wait read as zero. */
  it('gives a load with no hydrated mark no wait', () => {
    expect(loadsOfLog(line('a', 0, { kind: 'occurred', widthMs: 70 }, { ...marks, hydratedAt: null }))[0].waitMs).toBeNull();
  });

  /* Fails against a load past its limit given no wait: spines painted and no interactive means it waited at least as long as it was open. */
  it('gives a load that did not complete the time its window was open', () => {
    const late: Window = { kind: 'incomplete', limitMs: 600_000, stage: 'spine-while-loading', openAtLeastMs: 412_000 };
    expect(loadsOfLog(line('a', 0, late, marks))[0].waitMs).toBe(412_000);
  });
});

describe('presses in a log', () => {
  const press = (i: number, state: unknown) => JSON.stringify({ cell: 'cold/fast-3g/press', i, window: { kind: 'none' }, press: state });

  /* Fails against a pressed load counted in the table: a press changes when the wall hydrates. */
  it('leaves a pressed load out of the loads', () => {
    expect(loadsOfLog(press(0, { outcome: 'navigated', attached: false, hydrated: false }))).toEqual([]);
  });

  /* Fails against outcomes reported without whether React had attached, which is the question. */
  it('counts the outcomes by whether React had attached at the press', () => {
    const log = [press(0, { outcome: 'navigated', attached: false, hydrated: false }), press(1, { outcome: 'navigated', attached: false, hydrated: false }), press(2, { outcome: 'dropped', attached: true, hydrated: false }), press(3, { outcome: 'no-gap', attached: true, hydrated: true })].join('\n');
    expect(pressesOfLog(log)).toEqual([{ attached: false, hydrated: false, outcome: 'navigated', loads: 2 }, { attached: true, hydrated: false, outcome: 'dropped', loads: 1 }, { attached: true, hydrated: true, outcome: 'no-gap', loads: 1 }]);
  });
});

describe('presses split by React', () => {
  /* Fails against a count keyed on the outcome alone: the same outcome either side of React attaching is the finding. */
  it('keeps one outcome apart by whether React had attached', () => {
    const line = (i: number, attached: boolean) => JSON.stringify({ cell: 'cold/fast-3g/press', i, window: { kind: 'none' }, press: { outcome: 'navigated', attached, hydrated: false } });
    expect(pressesOfLog([line(0, false), line(1, true)].join('\n')).map((p) => [p.attached, p.loads])).toEqual([[false, 1], [true, 1]]);
  });
});

describe('projection', () => {
  /* Fails against a projection from the local estimate rather than this run's own first round. */
  it('projects the rest of the run from its first round and says when it passes two hours', () => {
    expect(projection(260_000, 20)).toEqual({ minutes: 82, overTwoHours: false });
    expect(projection(400_000, 20)).toEqual({ minutes: 127, overTwoHours: true });
  });
});

describe('heldWaits', () => {
  const load = (cell: string, window: Window, waitMs: number | null = null): Load => ({ cell, window, waitMs });
  const occurred = (widthMs: number): Window => ({ kind: 'occurred', widthMs });

  /* Fails against a count taken from the width: the hold's timer runs to hydration, 16s past a 366ms window on cold/fast-3g. */
  it('counts a load past a candidate by its wait to hydration, not its window', () => {
    const [row] = heldWaits([load('cold/fast-3g', occurred(366), 15900), load('cold/fast-3g', occurred(400), 500)], [1000, 20000]);
    expect(row).toEqual({ cell: 'cold/fast-3g', held: 2, past: [1, 0] });
  });

  /* Fails against a load with no window counted: a press there is not held, so no bound can navigate it. */
  it('leaves out a load in which the window did not occur', () => {
    const [row] = heldWaits([load('cold/none', { kind: 'none' }), load('cold/none', occurred(30), 2000)], [1000]);
    expect(row).toEqual({ cell: 'cold/none', held: 1, past: [1] });
  });

  /* Fails against dropping a load that outlasted its limit: its window was open at least that long, so every candidate below navigates it. */
  it('counts a load that did not complete with spines painted, by the time it was open', () => {
    const late: Window = { kind: 'incomplete', limitMs: 600_000, stage: 'spine-while-loading', openAtLeastMs: 412_000 };
    expect(heldWaits([load('cold/slow-3g', late, 412_000)], [1000, 500_000])[0]).toEqual({ cell: 'cold/slow-3g', held: 1, past: [1, 0] });
  });

  /* Fails against reading a load with no spine yet as a held press: nothing could have been pressed. */
  it('leaves out a load that did not complete before a spine was painted', () => {
    const v = heldWaits([load('cold/slow-3g', { kind: 'incomplete', limitMs: 1, stage: 'no-spine' }), load('cold/slow-3g', occurred(5), 5)], [1]);
    expect(v[0]).toEqual({ cell: 'cold/slow-3g', held: 1, past: [1] });
  });

  /* Fails against an unknown wait read as zero: a window that occurred with no hydrated mark by the limit waited longer than any candidate. */
  it('counts a window whose hydration never arrived past every candidate', () => {
    expect(heldWaits([load('warm/slow-3g', occurred(800), null)], [1000, 20000])[0].past).toEqual([1, 1]);
  });

  /* Fails against a candidate counted at or above its own figure: a press that hydrates exactly at the bound pulls. */
  it('does not count a wait exactly at a candidate', () => {
    expect(heldWaits([load('warm/fast-3g', occurred(1), 1000)], [1000])[0].past).toEqual([0]);
  });
});

describe('verdict', () => {
  const load = (cell: string, window: Window, waitMs: number | null = null): Load => ({ cell, window, waitMs });
  const occurred = (widthMs: number): Window => ({ kind: 'occurred', widthMs });

  /* Fails against a verdict that frames a thin result as reopening whether the window occurs, or the run as setting the figure. */
  it('frames the run as counts for a judgement of tolerance, the occurrence settled on 29 Oct', () => {
    const v = verdict([load('cold/none', occurred(61), 100)]);
    expect(v.sentence).toMatch(/^This run measures how wide the window is and how long a held press waits\. That it occurs on production at every connection level measured was settled on 29 Oct\. The bound is a judgement of tolerance: the counts below say how many loads each candidate would navigate, not where the figure goes\./);
  });

  /* Fails against a per-cell line that drops the loads that did not complete, or reports a mean for the widest. */
  it('states each cell: its outcomes, the median width and the widest', () => {
    const v = verdict([
      load('warm/slow-3g', occurred(800), 900), load('warm/slow-3g', occurred(900), 950), load('warm/slow-3g', occurred(700), 750),
      load('warm/slow-3g', { kind: 'none' }), load('warm/slow-3g', { kind: 'incomplete', limitMs: 180_000, stage: 'no-spine' }),
    ]);
    expect(v.sentence).toContain('warm/slow-3g: 5 loads; occurred 3, none 1, did not complete within 180s 1; median 800ms, widest 900ms.');
  });

  /* Fails against a cell reported by its median and widest alone, which cannot tell a tail from one load (the coordinator, 30 Oct). */
  it('gives each cell its full spread of widths and of waits, ascending', () => {
    const v = verdict([load('warm/slow-3g', occurred(900), 1000), load('warm/slow-3g', occurred(700), 750), load('warm/slow-3g', occurred(800), 850)]);
    expect(v.sentence).toContain('warm/slow-3g widths, ascending: 700, 800, 900ms; second-widest 800ms.');
    expect(v.sentence).toContain('warm/slow-3g waits to hydration, ascending: 750, 850, 1000ms.');
  });

  /* Fails against a spread line for a cell with one width, which has no second-widest to state. */
  it('states no second-widest for a cell with one width', () => {
    const v = verdict([load('cold/none', occurred(61), 100)]);
    expect(v.sentence).toContain('cold/none widths, ascending: 61ms.');
    expect(v.sentence).not.toContain('second-widest');
  });

  /* Fails against the withdrawn formula: W.8/bound-above-widest takes the ×1.5 out, and no figure is proposed. */
  it('proposes no bound', () => {
    const v = verdict([load('warm/slow-3g', occurred(821), 900)]);
    expect(v.sentence).not.toMatch(/Proposed bound|× 1\.5|widest ×/);
    expect(v).not.toHaveProperty('boundMs');
  });

  /* Fails against a table with no row per cell, or no total: the coordinator asked for the breakdown, and a press at the first frame is the worst case. */
  it('tables every bound candidate by cell with a total, and says the count is a press at the first frame', () => {
    const v = verdict([load('warm/slow-3g', occurred(8000), 9000), load('warm/fast-3g', occurred(200), 250)]);
    expect(CANDIDATES_MS).toEqual([1000, 2000, 3000, 4000, 6000, 8000, 12000]);
    expect(v.sentence).toContain('Loads a held press would navigate at each candidate, counting a press at the first frame with spines, the longest wait a load offers:');
    expect(v.sentence).toContain('warm/slow-3g (1 held): 1000ms 1, 2000ms 1, 3000ms 1, 4000ms 1, 6000ms 1, 8000ms 1, 12000ms 0.');
    expect(v.sentence).toContain('All cells (2 held): 1000ms 1, 2000ms 1, 3000ms 1, 4000ms 1, 6000ms 1, 8000ms 1, 12000ms 0.');
  });

  /* Fails against a delay figure read from the bound's table: a delay is how many held presses show the acknowledgement, a different count. */
  it('tables the acknowledgement delay candidates by cell in the same way', () => {
    const v = verdict([load('warm/fast-3g', occurred(200), 400)]);
    expect(DELAYS_MS).toEqual([300, 500, 800, 1000]);
    expect(v.sentence).toContain('Loads in which a held press would show the acknowledgement at each delay, counted the same way:');
    expect(v.sentence).toContain('warm/fast-3g (1 held): 300ms 1, 500ms 0, 800ms 0, 1000ms 0.');
  });

  /* Fails against a verdict that reads a run with no occurrence as a null on the question 29 Oct settled. */
  it('gives no counts from a run with no occurrence, and does not call it a null', () => {
    const v = verdict([load('cold/none', { kind: 'none' })]);
    expect(v.sentence).toContain('No load in this run showed the window, so it gives no counts.');
    expect(v.sentence).not.toMatch(/does not occur|no frame with spines/);
  });

  /* Fails against a verdict that counts broken loads among the cells' loads. */
  it('leaves broken loads out of the cells and names how many there were', () => {
    const v = verdict([load('cold/none', occurred(10), 20), load('cold/none', { kind: 'broken', reason: 'x' })]);
    expect(v.sentence).toContain('cold/none: 1 loads;');
    expect(v.broken).toBe(1);
  });
});
