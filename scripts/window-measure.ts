/**
 * **The production measurement of §W.8's window: its recorder and its
 * judgement (NOTES, 30 Oct, restated after the aborted run of 29 Oct).** The
 * window occurs in a load where a frame with spines is painted while the
 * document is still `loading`, and its width is that frame to interactive.
 * That it occurs on production was settled on 29 Oct; Run A measures how wide
 * and Run B whether a cold slow-3g load completes at all. The CLI is
 * `scripts/measure-window.mts`, which Adam runs; the recorder is shown able to
 * see the window, and to keep its marks past the limit, by
 * `e2e/window-measure.spec.ts`, against the proxy that holds it open.
 */
import type { Page } from '@playwright/test';

export type Marks = {
  spineAt: number | null;
  frameAt: number | null;
  frameReadyState: string | null;
  interactiveAt: number | null;
  hydratedAt: number | null;
};

/**
 * A load past its limit is a result about the app, kept with the stage it
 * reached; broken is an instrument fault. Spines painted while loading and no
 * interactive by the limit is a window at least `openAtLeastMs` wide.
 */
export type Window =
  | { kind: 'occurred'; widthMs: number }
  | { kind: 'none' }
  | { kind: 'incomplete'; limitMs: number; stage: 'no-response' | 'no-spine' | 'spine-while-loading'; openAtLeastMs?: number }
  | { kind: 'broken'; reason: string };

export type Cell = { cache: 'cold' | 'warm'; network: 'none' | 'fast-3g' | 'slow-3g' | 'slow-3g-cpu4' };

export type Load = { cell: string; window: Window };

/** The presets of the 29 Oct 15:30 local measurement, so the two can be read side by side. */
export const NETWORK: Record<Cell['network'], { latency: number; kbps: number | null; cpu: number }> = {
  none: { latency: 0, kbps: null, cpu: 1 },
  'fast-3g': { latency: 150, kbps: 1600, cpu: 1 },
  'slow-3g': { latency: 400, kbps: 400, cpu: 1 },
  'slow-3g-cpu4': { latency: 400, kbps: 400, cpu: 4 },
};

export type Run = { cells: Cell[]; perCell: number; limitMs: number };

/** The width, over the cells that completed on 29 Oct; cold slow-3g-cpu4 dropped, cold slow-3g left to Run B. */
export const RUN_A: Run = {
  cells: [{ cache: 'cold', network: 'none' }, { cache: 'cold', network: 'fast-3g' }, { cache: 'warm', network: 'none' }, { cache: 'warm', network: 'fast-3g' }, { cache: 'warm', network: 'slow-3g' }, { cache: 'warm', network: 'slow-3g-cpu4' }],
  perCell: 20,
  limitMs: 180_000,
};

/** Whether a cold slow-3g load completes, and how wide the window is when it does or at least how wide when it does not. */
export const RUN_B: Run = { cells: [{ cache: 'cold', network: 'slow-3g' }], perCell: 5, limitMs: 600_000 };

export const cellName = (cell: Cell) => `${cell.cache}/${cell.network}`;

/** Every cell once per round, so time of day and Vercel's state fall across the cells and not on one. */
export function schedule<T>(cells: T[], perCell: number): T[] {
  return Array.from({ length: perCell }, () => cells).flat();
}

/**
 * `timedOut` is given when the limit ran out before interactive and the
 * hydrated mark; `readAt` is the page's clock when the marks were read. A
 * load that reached interactive is judged by its marks even then, since its
 * window is determined; one that finished with no spine, or with no recorder,
 * is broken, never a load in which the window did not occur.
 */
export function windowOf(m: Marks | null, timedOut?: { limitMs: number; readAt: number | null }): Window {
  if (timedOut !== undefined && (m === null || m.interactiveAt === null || m.frameAt === null)) {
    const { limitMs, readAt } = timedOut;
    if (m === null) return { kind: 'incomplete', limitMs, stage: 'no-response' };
    if (m.frameAt === null) return { kind: 'incomplete', limitMs, stage: 'no-spine' };
    return { kind: 'incomplete', limitMs, stage: 'spine-while-loading', ...(readAt === null ? {} : { openAtLeastMs: Math.max(0, readAt - m.frameAt) }) };
  }
  if (m === null) return { kind: 'broken', reason: 'the recorder did not run' };
  if (m.spineAt === null || m.frameAt === null) return { kind: 'broken', reason: 'no spine was painted' };
  if (m.interactiveAt === null) return { kind: 'broken', reason: 'the document never reached interactive' };
  if (m.frameReadyState !== 'loading') return { kind: 'none' };
  return { kind: 'occurred', widthMs: Math.max(0, m.interactiveAt - m.frameAt) };
}

/**
 * Takes each planned load; only a broken one is retaken, and the stop counts
 * loads still broken after their retakes, never attempts (the 29 Oct run
 * stopped on "10 broken loads" when three had printed). A load that did not
 * complete is a result, kept once.
 */
export async function runPlan<C>(
  plan: C[],
  take: (cell: C, i: number) => Promise<Window>,
  opts: { brokenLimit: number; retakes: number; record: (cell: C, i: number, window: Window) => void },
): Promise<{ loads: Array<{ cell: C; window: Window }>; brokenLoads: number; stopped: boolean }> {
  const loads: Array<{ cell: C; window: Window }> = [];
  let brokenLoads = 0;
  for (let i = 0; i < plan.length; i += 1) {
    const cell = plan[i];
    let window = await take(cell, i);
    opts.record(cell, i, window);
    for (let retake = 0; retake < opts.retakes && window.kind === 'broken'; retake += 1) {
      window = await take(cell, i);
      opts.record(cell, i, window);
    }
    loads.push({ cell, window });
    if (window.kind === 'broken') {
      brokenLoads += 1;
      if (brokenLoads >= opts.brokenLimit) return { loads, brokenLoads, stopped: true };
    }
  }
  return { loads, brokenLoads, stopped: false };
}

/** The rest of the run, from this run's own first round: an estimate does not cross environments (NOTES, 29 Oct 23:30). */
export function projection(roundMs: number, rounds: number): { minutes: number; overTwoHours: boolean } {
  const minutes = Math.round((roundMs * (rounds - 1)) / 60000);
  return { minutes, overTwoHours: minutes > 120 };
}

/** The bound proposed is the widest completed run times this, rounded up to 100ms; what it is for is stated in the verdict. */
export const MARGIN = 1.5;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/**
 * The verdict in the restated rule's words. The run measures the width, so
 * the figure is the widest completed run plus the margin, and every load
 * that did not complete with the window open longer than that is named.
 */
export function verdict(loads: Load[], perCell: number): { sentence: string; boundMs: number | null; broken: number } {
  const counted = loads.filter((l) => l.window.kind !== 'broken');
  const broken = loads.length - counted.length;
  const cells = [...new Set(counted.map((l) => l.cell))];
  const lines = cells.map((cell) => {
    const ws = counted.filter((l) => l.cell === cell).map((l) => l.window);
    const widths = ws.flatMap((w) => (w.kind === 'occurred' ? [w.widthMs] : []));
    const late = ws.filter((w) => w.kind === 'incomplete');
    const limits = [...new Set(late.map((w) => (w.kind === 'incomplete' ? w.limitMs / 1000 : 0)))];
    const lateText = late.length === 0 ? '' : `, did not complete within ${limits.join('s or ')}s ${late.length}`;
    const widthText = widths.length === 0 ? '' : `; median ${Math.round(median(widths))}ms, widest ${Math.round(Math.max(...widths))}ms`;
    return `${cell}: ${ws.length} loads; occurred ${widths.length}, none ${ws.filter((w) => w.kind === 'none').length}${lateText}${widthText}.`;
  });
  const head = 'This run measures how wide the window is. That it occurs on production at every connection level measured was settled on 29 Oct; a thin or noisy result places the bound less well, and does not reopen whether there is one.';
  const hits = counted.flatMap((l) => (l.window.kind === 'occurred' ? [{ cell: l.cell, widthMs: l.window.widthMs }] : []));
  if (hits.length === 0) {
    return { boundMs: null, broken, sentence: [head, ...lines, 'No load in this run showed the window, so it gives no figure.'].join('\n') };
  }
  const widest = hits.reduce((a, b) => (b.widthMs > a.widthMs ? b : a));
  const boundMs = Math.ceil((widest.widthMs * MARGIN) / 100) * 100;
  const beyond = counted.flatMap((l) => (l.window.kind === 'incomplete' && (l.window.openAtLeastMs ?? 0) > boundMs ? [l.window.openAtLeastMs ?? 0] : []));
  const beyondText = beyond.length === 0 ? [] : [`${beyond.length} load${beyond.length === 1 ? '' : 's'} that did not complete had the window open at least ${Math.round(Math.min(...beyond))}ms, longer than the bound: the bound does not cover ${beyond.length === 1 ? 'it' : 'them'}.`];
  return {
    boundMs,
    broken,
    sentence: [
      head,
      ...lines,
      `The widest completed run was ${Math.round(widest.widthMs)}ms, in ${widest.cell}. Proposed bound: ${boundMs}ms, the widest × ${MARGIN} rounded up to 100ms.`,
      `The margin is for two things: at ${perCell} loads a cell the widest observed falls below the cell's 95th percentile ${Math.round(0.95 ** perCell * 100)}% of the time (0.95^${perCell}), and the conditions not measured: Safari and Firefox, real devices and lossy networks, other regions, a larger collection. Adam judges the figure.`,
      ...beyondText,
    ].join('\n'),
  };
}

/**
 * Runs before the document exists. Marks the first spine inside the wall's
 * container, then the frame that paints it, with readyState in that frame;
 * interactive; and the wall's hydrated mark. A requestAnimationFrame
 * callback runs in the frame about to be painted, so readyState read there
 * is the document's state while the spines are drawn.
 */
export const RECORDER = `(() => {
  const marks = { spineAt: null, frameAt: null, frameReadyState: null, interactiveAt: null, hydratedAt: null };
  window.__windowMarks = marks;
  const interactive = () => { if (marks.interactiveAt === null && document.readyState !== 'loading') marks.interactiveAt = performance.now(); };
  document.addEventListener('readystatechange', interactive);
  const look = () => {
    if (marks.spineAt === null && document.querySelector('[data-wall-container] [data-spine]')) {
      marks.spineAt = performance.now();
      requestAnimationFrame(() => { marks.frameAt = performance.now(); marks.frameReadyState = document.readyState; });
    }
    if (marks.hydratedAt === null && document.querySelector('[data-wall-container][data-hydrated="true"]')) marks.hydratedAt = performance.now();
  };
  new MutationObserver(look).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-hydrated'] });
})();`;

export async function readMarks(page: Page): Promise<Marks> {
  return page.evaluate(() => (window as unknown as { __windowMarks: Marks }).__windowMarks);
}

/**
 * One load, ended at interactive and the wall's hydrated mark or at the
 * limit, not at the load event, which waits for every cover on the page and
 * which the window does not need. Past the limit the marks are read and kept,
 * so the load says how far it got. The load event's time is data when it
 * arrives inside the limit. A session refused is thrown: every load after it
 * would be the login page.
 */
export async function takeLoad(page: Page, url: string, limitMs: number): Promise<{ marks: Marks | null; window: Window; loadEventMs: number | null; status: number | null; vercelId: string | null }> {
  const started = Date.now();
  const response = await page.goto(url, { waitUntil: 'commit', timeout: limitMs }).catch(() => null);
  if (response !== null && new URL(page.url()).pathname === '/login') throw new Error('the session was refused: the Collection redirected to /login');
  const reached = response !== null && await page.waitForFunction(() => {
    const m = (window as unknown as { __windowMarks?: Marks }).__windowMarks;
    return m !== undefined && m.interactiveAt !== null && m.hydratedAt !== null;
  }, undefined, { timeout: Math.max(1, limitMs - (Date.now() - started)) }).then(() => true, () => false);
  const read = response === null ? null : await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    return { marks: (window as unknown as { __windowMarks?: Marks }).__windowMarks ?? null, readAt: performance.now(), loadEventMs: nav !== undefined && nav.loadEventEnd > 0 ? nav.loadEventEnd : null };
  }).catch(() => null);
  const marks = read?.marks ?? null;
  return {
    marks,
    window: windowOf(marks, reached ? undefined : { limitMs, readAt: read?.readAt ?? null }),
    loadEventMs: read?.loadEventMs ?? null,
    status: response?.status() ?? null,
    vercelId: response?.headers()['x-vercel-id'] ?? null,
  };
}
