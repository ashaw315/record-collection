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
import type { CDPSession, Page } from '@playwright/test';

export type Marks = {
  spineAt: number | null;
  frameAt: number | null;
  frameReadyState: string | null;
  interactiveAt: number | null;
  hydratedAt: number | null;
  /** The second `click` listener on the document: the hold script's is the first, and React's minified names leave only the position (NOTES, 29 Oct 16:40). */
  attachedAt?: number | null;
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

/** `warm` is Run A's: a warm-up that raced the covers. `covers-cold` and `fully-warm` make their state and are checked for it by `conditionMade`. */
export type Cell = { cache: 'cold' | 'warm' | 'covers-cold' | 'fully-warm'; network: 'none' | 'fast-3g' | 'slow-3g' | 'slow-3g-cpu4'; press?: boolean };

/** `waitMs` is the first frame with spines to the hydrated mark, or how long a load past its limit stood open. */
export type Load = { cell: string; window: Window; waitMs?: number | null };

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

/**
 * The cause of the slow window's upper group, and what a press does between
 * interactive and hydration on cold/fast-3g (the coordinator, 30 Oct: one run,
 * both questions). A press changes when the wall hydrates, so the pressed loads
 * are a cell of their own.
 */
export const RUN_CAUSE: Run = {
  cells: [{ cache: 'covers-cold', network: 'slow-3g' }, { cache: 'fully-warm', network: 'slow-3g' }, { cache: 'cold', network: 'fast-3g' }, { cache: 'cold', network: 'fast-3g', press: true }],
  perCell: 20,
  limitMs: 180_000,
};

export const cellName = (cell: Cell) => `${cell.cache}/${cell.network}${cell.press === true ? '/press' : ''}`;

/** Covers come from Vercel Blob. Blocked over CDP, never with Playwright's route(), which turns the HTTP cache off and would unmake the warm-up. */
export const COVER_BLOCK = '*.public.blob.vercel-storage.com*';
const isBlobCover = (url: string) => url.includes('.public.blob.vercel-storage.com');

export type Network = {
  documentStartTs: number | null;
  documentEndTs: number | null;
  covers: Array<{ startTs: number; endTs: number | null; fromCache: boolean; bytes: number | null }>;
};

export type CoverSummary = { documentEndMs: number | null; covers: number; fromCache: number; bytes: number; inFlightAtFrame: number; inFlightAtInteractive: number };

/**
 * Network events, not the Resource Timing API: its entries appear on
 * completion and its buffer holds 250, and a load ended at hydration leaves
 * covers in flight, which is the thing being counted.
 */
export function watchNetwork(cdp: CDPSession, isCover: (url: string) => boolean = isBlobCover): () => Network {
  const net: Network = { documentStartTs: null, documentEndTs: null, covers: [] };
  const covers = new Map<string, Network['covers'][number]>();
  let documentId: string | null = null;
  cdp.on('Network.requestWillBeSent', (e) => {
    if (e.type === 'Document' && documentId === null) { documentId = e.requestId; net.documentStartTs = e.timestamp; }
    if (e.type === 'Image' && isCover(e.request.url) && !covers.has(e.requestId)) {
      const cover = { startTs: e.timestamp, endTs: null, fromCache: false, bytes: null };
      covers.set(e.requestId, cover);
      net.covers.push(cover);
    }
  });
  cdp.on('Network.requestServedFromCache', (e) => { const c = covers.get(e.requestId); if (c !== undefined) c.fromCache = true; });
  cdp.on('Network.responseReceived', (e) => { const c = covers.get(e.requestId); if (c !== undefined && e.response.fromDiskCache === true) c.fromCache = true; });
  cdp.on('Network.loadingFinished', (e) => {
    if (e.requestId === documentId) net.documentEndTs = e.timestamp;
    const c = covers.get(e.requestId);
    if (c !== undefined) { c.endTs = e.timestamp; c.bytes = e.encodedDataLength; }
  });
  cdp.on('Network.loadingFailed', (e) => { const c = covers.get(e.requestId); if (c !== undefined) c.endTs = e.timestamp; });
  return () => net;
}

/** Network timestamps against the page's marks: both are taken from the navigation's start, near enough for counts. */
export function coverSummary(net: Network, marks: Marks): CoverSummary {
  const start = net.documentStartTs ?? 0;
  const ms = (ts: number) => (ts - start) * 1000;
  const inFlightAt = (at: number | null) => (at === null ? 0 : net.covers.filter((c) => !c.fromCache && ms(c.startTs) <= at && (c.endTs === null || ms(c.endTs) > at)).length);
  return {
    documentEndMs: net.documentEndTs === null ? null : ms(net.documentEndTs),
    covers: net.covers.length,
    fromCache: net.covers.filter((c) => c.fromCache).length,
    bytes: net.covers.reduce((n, c) => n + (c.bytes ?? 0), 0),
    inFlightAtFrame: inFlightAt(marks.frameAt),
    inFlightAtInteractive: inFlightAt(marks.interactiveAt),
  };
}

/** Whether a load was in the state its cell names. Run A's warm cells were not, and nothing said so. No cover seen proves neither. */
export function conditionMade(cache: 'covers-cold' | 'fully-warm', s: CoverSummary): boolean {
  return s.covers > 0 && (cache === 'fully-warm' ? s.fromCache === s.covers : s.fromCache === 0);
}

export function pressOutcome(seen: { navigated: boolean; pullStarts: number }): 'navigated' | 'pulled' | 'dropped' {
  if (seen.navigated) return 'navigated';
  return seen.pullStarts > 0 ? 'pulled' : 'dropped';
}

/** Past interactive, by round: production's gap is about 15s, and one fixed moment could see only one side of React attaching. */
export const PRESS_AFTER_MS = [1000, 4000, 8000, 12000];

export type Press = { outcome: 'navigated' | 'pulled' | 'dropped' | 'no-gap'; attached: boolean; hydrated: boolean };

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

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/** The figures Adam judges the bound among, and the acknowledgement's delay among: tolerance places both, and the run only counts. */
export const CANDIDATES_MS = [1000, 2000, 3000, 4000, 6000, 8000, 12000];
export const DELAYS_MS = [300, 500, 800, 1000];

const held = (w: Window) => w.kind === 'occurred' || (w.kind === 'incomplete' && w.stage === 'spine-while-loading');

/**
 * How many loads hold a press longer than each figure, by cell. The hold's
 * timer runs from the press to hydration, not to interactive, so a wait is the
 * first frame with spines to the hydrated mark: on cold/fast-3g a 366ms window
 * is a 16s wait. A press later in the window waits less, so this is each
 * load's longest. A window with no hydrated mark waited past every figure.
 */
export function heldWaits(loads: Load[], figures: number[]): Array<{ cell: string; held: number; past: number[] }> {
  const cells = [...new Set(loads.map((l) => l.cell))];
  return cells.flatMap((cell) => {
    const inCell = loads.filter((l) => l.cell === cell && held(l.window));
    if (inCell.length === 0) return [];
    return [{ cell, held: inCell.length, past: figures.map((figure) => inCell.filter((l) => l.waitMs === null || l.waitMs === undefined || l.waitMs > figure).length) }];
  });
}

const tableLines = (loads: Load[], figures: number[]) => {
  const rows = heldWaits(loads, figures);
  const line = (name: string, count: number, past: number[]) => `${name} (${count} held): ${figures.map((f, i) => `${f}ms ${past[i]}`).join(', ')}.`;
  return [
    ...rows.map((r) => line(r.cell, r.held, r.past)),
    line('All cells', rows.reduce((n, r) => n + r.held, 0), figures.map((_, i) => rows.reduce((n, r) => n + r.past[i], 0))),
  ];
};

/** The log has a line per attempt; a retaken load is its last attempt, the one `runPlan` keeps. */
export function loadsOfLog(log: string): Load[] {
  const attempts = log.split('\n').filter((line) => line !== '').map((line) => JSON.parse(line) as { i: number; cell: string; window: Window; marks?: Marks | null }).filter((a) => !a.cell.endsWith('/press'));
  const loads = attempts.map((a): [number, Load] => {
    const { marks, window } = a;
    const waitMs = window.kind === 'incomplete' ? window.openAtLeastMs ?? null
      : marks?.hydratedAt === null || marks?.hydratedAt === undefined || marks.frameAt === null ? null
      : marks.hydratedAt - marks.frameAt;
    return [a.i, { cell: a.cell, window, waitMs }];
  });
  return [...new Map(loads).values()];
}

/** The pressed loads, last attempt of each, counted by the state at the press and what it did. */
export function pressesOfLog(log: string): Array<Press & { loads: number }> {
  const attempts = log.split('\n').filter((line) => line !== '').map((line) => JSON.parse(line) as { i: number; press?: Press }).flatMap((a) => (a.press === undefined ? [] : [a]));
  const rows = new Map<string, Press & { loads: number }>();
  for (const { press } of new Map(attempts.map((a) => [a.i, a])).values()) {
    if (press === undefined) continue;
    const key = `${press.attached}/${press.hydrated}/${press.outcome}`;
    const row = rows.get(key) ?? { ...press, loads: 0 };
    row.loads += 1;
    rows.set(key, row);
  }
  return [...rows.values()];
}

/**
 * The verdict in the rule's words as Design restated them (§W.8, 30 Oct): the
 * bound is a judgement of tolerance, so the run gives counts and no figure.
 * Each cell gives its full spread, so a tail can be told from one load.
 */
export function verdict(loads: Load[]): { sentence: string; broken: number } {
  const counted = loads.filter((l) => l.window.kind !== 'broken');
  const broken = loads.length - counted.length;
  const cells = [...new Set(counted.map((l) => l.cell))];
  const lines = cells.flatMap((cell) => {
    const inCell = counted.filter((l) => l.cell === cell);
    const ws = inCell.map((l) => l.window);
    const widths = ws.flatMap((w) => (w.kind === 'occurred' ? [w.widthMs] : [])).sort((a, b) => a - b);
    const late = ws.filter((w) => w.kind === 'incomplete');
    const limits = [...new Set(late.map((w) => (w.kind === 'incomplete' ? w.limitMs / 1000 : 0)))];
    const lateText = late.length === 0 ? '' : `, did not complete within ${limits.join('s or ')}s ${late.length}`;
    const widthText = widths.length === 0 ? '' : `; median ${Math.round(median(widths))}ms, widest ${Math.round(widths[widths.length - 1])}ms`;
    const line = `${cell}: ${ws.length} loads; occurred ${widths.length}, none ${ws.filter((w) => w.kind === 'none').length}${lateText}${widthText}.`;
    if (widths.length === 0) return [line];
    const second = widths.length >= 2 ? `; second-widest ${Math.round(widths[widths.length - 2])}ms` : '';
    const waits = inCell.flatMap((l) => (l.window.kind === 'occurred' && l.waitMs !== null && l.waitMs !== undefined ? [l.waitMs] : [])).sort((a, b) => a - b);
    return [line, `${cell} widths, ascending: ${widths.map(Math.round).join(', ')}ms${second}.`, `${cell} waits to hydration, ascending: ${waits.map(Math.round).join(', ')}ms.`];
  });
  const head = 'This run measures how wide the window is and how long a held press waits. That it occurs on production at every connection level measured was settled on 29 Oct. The bound is a judgement of tolerance: the counts below say how many loads each candidate would navigate, not where the figure goes.';
  if (!counted.some((l) => held(l.window))) {
    return { broken, sentence: [head, ...lines, 'No load in this run showed the window, so it gives no counts.'].join('\n') };
  }
  return {
    broken,
    sentence: [
      head,
      ...lines,
      'Loads a held press would navigate at each candidate, counting a press at the first frame with spines, the longest wait a load offers:',
      ...tableLines(counted, CANDIDATES_MS),
      'Loads in which a held press would show the acknowledgement at each delay, counted the same way:',
      ...tableLines(counted, DELAYS_MS),
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
  const marks = { spineAt: null, frameAt: null, frameReadyState: null, interactiveAt: null, hydratedAt: null, attachedAt: null };
  window.__windowMarks = marks;
  let clicks = 0;
  const add = document.addEventListener;
  document.addEventListener = function (type, ...rest) {
    if (type === 'click') { clicks += 1; if (clicks === 2) marks.attachedAt = performance.now(); }
    return add.call(this, type, ...rest);
  };
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

/**
 * One load with a real press on a spine, after interactive, while the wall
 * has not hydrated: `pressAfterMs` past interactive. Reads React's state just
 * before the click, then what the press did: the anchor navigated, the wall
 * pulled, or nothing by `settleMs`, or 3s past hydration. Read-only on
 * production: a pull makes no request and a record's page writes nothing.
 */
export async function takePress(page: Page, url: string, limitMs: number, { pressAfterMs, settleMs }: { pressAfterMs: number; settleMs: number }): Promise<Press> {
  const response = await page.goto(url, { waitUntil: 'commit', timeout: limitMs });
  if (response !== null && new URL(page.url()).pathname === '/login') throw new Error('the session was refused: the Collection redirected to /login');
  const opening = page.url();
  await page.waitForFunction((after) => {
    const m = (window as unknown as { __windowMarks?: Marks }).__windowMarks;
    return m !== undefined && m.spineAt !== null && m.interactiveAt !== null && performance.now() >= m.interactiveAt + after;
  }, pressAfterMs, { timeout: limitMs });
  const before = await page.evaluate(() => {
    const m = (window as unknown as { __windowMarks: Marks }).__windowMarks;
    const seat = [...document.querySelectorAll('a[data-seat]')].flatMap((a) => {
      const r = a.getBoundingClientRect();
      const [x, y] = [r.left + r.width / 2, r.top + r.height / 2];
      return document.elementFromPoint(x, y)?.closest('a[data-seat]') === a ? [{ x, y }] : [];
    })[0];
    return { attached: m.attachedAt !== null && m.attachedAt !== undefined, hydrated: m.hydratedAt !== null, seat };
  });
  if (before.hydrated) return { outcome: 'no-gap', attached: before.attached, hydrated: true };
  if (before.seat === undefined) throw new Error('no spine could be pressed');
  const state = { attached: before.attached, hydrated: false };
  await page.mouse.click(before.seat.x, before.seat.y);
  const moved = () => page.url() !== opening;
  const pullStarts = () => page.evaluate(() => Number(document.querySelector('[data-wall-container]')?.getAttribute('data-pull-starts') ?? 0)).catch(() => 0);
  const deadline = Date.now() + settleMs;
  let hydratedSince: number | null = null;
  for (;;) {
    if (moved()) return { outcome: 'navigated', ...state };
    const starts = await pullStarts();
    if (moved()) return { outcome: 'navigated', ...state };
    if (starts > 0) return { outcome: 'pulled', ...state };
    if (hydratedSince === null && await page.evaluate(() => (window as unknown as { __windowMarks: Marks }).__windowMarks.hydratedAt !== null).catch(() => false)) hydratedSince = Date.now();
    if (Date.now() > deadline || (hydratedSince !== null && Date.now() - hydratedSince > 3000)) return { outcome: pressOutcome({ navigated: moved(), pullStarts: await pullStarts() }), ...state };
    await page.waitForTimeout(100);
  }
}
