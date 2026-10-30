/**
 * **§W.8's window, measured on the production wall: Adam runs this.**
 *
 *     read -rs "P?Password: "; echo; PROD_LOGIN_PASSWORD="$P" npm run window:measure; unset P
 *
 * Modes, by npm script (the rule restated in NOTES, 30 Oct, before any load):
 * - `window:measure`: Run A, the width. Six cells of 20 loads, round-robin,
 *   each within 180s, no early stop. Whether the window occurs was settled on
 *   29 Oct; this run sets the figure.
 * - `window:measure:cold-slow`: Run B, five cold slow-3g loads within 600s:
 *   whether such a load completes, and the window's width or its lower bound.
 * - `window:measure:cause`: the cover timing and the press (the coordinator,
 *   30 Oct): 20 loads each of covers-cold and fully-warm at slow-3g, cold/fast-3g
 *   with React's attach mark, and cold/fast-3g with a real press after
 *   interactive. Every cover is timed over CDP, and a warm load not in the state
 *   its cell names is broken.
 * - `window:measure:close`: what the cause run left, 51 loads: 10 presses 14s
 *   past interactive, 20 of `warm` at slow-3g with its covers timed, 20 at
 *   cold/fast-3g with covers blocked, and one load weighing every cover.
 * - `window:measure:weigh`: one cold load to the load event, every cover's
 *   size. Run on its own; it makes no window measurement.
 * - `window:measure:after-deploy` and `:idle-cold`: the supplement, unchanged
 *   in what it takes. After-deploy signs in before the deploy and waits for
 *   Enter once it is Ready; idle-cold signs in and makes no request for 20
 *   minutes. Both hold the session across the wait, since signing in would
 *   warm the function.
 *
 * A load ends at interactive and the wall's hydrated mark, or at its limit;
 * past the limit it is kept as did not complete, with its marks. Only a
 * broken load (an instrument fault) is retaken, twice, and three loads still
 * broken after their retakes stop the run with no verdict. After the first
 * round the rest of the run is projected from this run's own timing; past two
 * hours, stop it with Ctrl-C (the loads so far are kept, with no verdict).
 *
 * **The password is read from the environment only, never from a file
 * (the coordinator, 29 Oct),** and the session is kept in memory, never
 * written. Nothing is written to the collection, and only the press cell
 * presses: a pull makes no request, and a record's page only reads.
 * Each load attempt is a line in `docs/measurements/window-160/<mode>-<time>.jsonl`.
 */
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { chromium, type Browser, type BrowserContext } from '@playwright/test';
import { COVER_BLOCK, NETWORK, PRESS_AFTER_MS, PRESS_LATE_MS, RECORDER, RUN_A, RUN_B, RUN_CAUSE, cellName, closePlan, conditionMade, coverSizes, coverSummary, loadsOfLog, pressesOfLog, projection, runPlan, schedule, takeLoad, takePress, verdict, watchNetwork, type Cell, type CoverSummary, type Press, type Window } from './window-measure';

const MODES = ['run-a', 'run-b', 'cause', 'close', 'weigh', 'after-deploy', 'idle-cold'] as const;
const mode = process.argv[2] ?? 'run-a';
if (!(MODES as readonly string[]).includes(mode)) {
  process.stderr.write(`measure-window: unknown mode ${mode}\n`);
  process.exit(2);
}
const password = process.env.PROD_LOGIN_PASSWORD;
if (password === undefined || password === '') {
  /* This mode's own script: a suggestion naming the wrong one, pasted, starts another run. */
  const script = mode === 'run-a' ? 'window:measure' : mode === 'run-b' ? 'window:measure:cold-slow' : `window:measure:${mode}`;
  process.stderr.write(`measure-window: PROD_LOGIN_PASSWORD is not set. Run it as\n  read -rs "P?Password: "; echo; PROD_LOGIN_PASSWORD="$P" npm run ${script}; unset P\n`);
  process.exit(2);
}
const BASE = process.env.WINDOW_BASE_URL ?? 'https://record-collection-rust.vercel.app';
const onProduction = process.env.WINDOW_BASE_URL === undefined;
const VIEWPORT = { width: 1440, height: 900 };
const run = mode === 'run-b' ? RUN_B : mode === 'cause' || mode === 'close' ? RUN_CAUSE : RUN_A;
/* Fixed by the rule on production; WINDOW_PER_CELL is for a smoke run on another base and is refused on production. */
const PER_CELL = process.env.WINDOW_PER_CELL === undefined ? run.perCell : Number(process.env.WINDOW_PER_CELL);
if (PER_CELL !== run.perCell && onProduction) {
  process.stderr.write('measure-window: WINDOW_PER_CELL changes the stopping rule and is refused against production\n');
  process.exit(2);
}
const BROKEN_LIMIT = 3;
/* The largest Discogs-supplied cover the coordinator reported, 30 Oct: above it, a cover is an upload. */
const DISCOGS_MAX_BYTES = 170 * 1024;
const IDLE_MS = onProduction ? 20 * 60 * 1000 : Number(process.env.WINDOW_IDLE_MS ?? 20 * 60 * 1000);
/* The supplement's cold slow-3g load takes Run B's limit; every other load Run A's. */
const limitOf = (cell: Cell) => (cell.cache === 'cold' && cell.network === 'slow-3g' ? RUN_B.limitMs : RUN_A.limitMs);

const outDir = join('docs', 'measurements', 'window-160');
mkdirSync(outDir, { recursive: true });
const out = join(outDir, `${mode}-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`);
const log = (line: string) => process.stdout.write(`${line}\n`);

async function signIn(browser: Browser): Promise<Awaited<ReturnType<BrowserContext['storageState']>>> {
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  await page.goto(`${BASE}/login`);
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 60_000 });
  await page.getByLabel('Password').fill(password ?? '');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(`${BASE}/`, { timeout: 60_000 }).catch(() => undefined);
  if (new URL(page.url()).pathname !== '/') throw new Error('sign-in did not reach the Collection: check the password');
  const state = await context.storageState();
  await context.close();
  return state;
}

type Taken = Partial<Awaited<ReturnType<typeof takeLoad>>> & { window: Window; ms: number; covers?: CoverSummary; press?: Press; pressAfterMs?: number; sizes?: Array<number | null> };

async function load(browser: Browser, session: Awaited<ReturnType<typeof signIn>>, cell: Cell, round: number): Promise<Taken> {
  const context = await browser.newContext({ viewport: VIEWPORT, storageState: session });
  const started = Date.now();
  try {
    const page = await context.newPage();
    await page.addInitScript(RECORDER);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    if (cell.cache === 'warm') {
      /* The warm-up is unthrottled and unrecorded: it fills this context's cache. */
      const warm = await takeLoad(page, `${BASE}/`, limitOf(cell));
      if (warm.window.kind === 'incomplete' || warm.window.kind === 'broken') return { window: { kind: 'broken', reason: `the warm-up did not finish (${warm.window.kind})` }, ms: Date.now() - started };
    } else if (cell.cache === 'covers-cold') {
      /* Blocked over CDP: route() would turn the cache off, and this warm-up is here to fill it with scripts. */
      await cdp.send('Network.setBlockedURLs', { urls: [COVER_BLOCK] });
      const warm = await takeLoad(page, `${BASE}/`, limitOf(cell));
      await cdp.send('Network.setBlockedURLs', { urls: [] });
      if (warm.window.kind === 'incomplete' || warm.window.kind === 'broken') return { window: { kind: 'broken', reason: `the warm-up did not finish (${warm.window.kind})` }, ms: Date.now() - started };
    } else if (cell.cache === 'no-covers') {
      await cdp.send('Network.setBlockedURLs', { urls: [COVER_BLOCK] });
    } else if (cell.cache === 'fully-warm') {
      /* To the load event, as on 29 Oct: every cover fetched, about 37s unthrottled. */
      await page.goto(`${BASE}/`, { waitUntil: 'load', timeout: limitOf(cell) });
    }
    const net = NETWORK[cell.network];
    await cdp.send('Network.emulateNetworkConditions', net.kbps === null
      ? { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }
      : { offline: false, latency: net.latency, downloadThroughput: net.kbps * 125, uploadThroughput: net.kbps * 125 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: net.cpu });
    const measured = Date.now();
    if (cell.press === true) {
      const pressAfterMs = mode === 'close' ? PRESS_LATE_MS : PRESS_AFTER_MS[round % PRESS_AFTER_MS.length];
      const press = await takePress(page, `${BASE}/`, limitOf(cell), { pressAfterMs, settleMs: 60_000 });
      return { window: { kind: 'none' }, press, pressAfterMs, ms: Date.now() - measured };
    }
    const network = watchNetwork(cdp);
    if (cell.weigh === true) {
      await page.goto(`${BASE}/`, { waitUntil: 'load', timeout: limitOf(cell) });
      const weighed = coverSummary(network(), { spineAt: null, frameAt: null, frameReadyState: null, interactiveAt: null, hydratedAt: null });
      const sizes = network().covers.map((c) => c.bytes);
      if (mode === 'weigh') log(JSON.stringify(coverSizes(sizes, DISCOGS_MAX_BYTES)));
      return weighed.covers > 0 ? { window: { kind: 'none' }, covers: weighed, sizes, ms: Date.now() - measured } : { window: { kind: 'broken', reason: 'no cover seen' }, ms: Date.now() - measured };
    }
    const taken = await takeLoad(page, `${BASE}/`, limitOf(cell));
    const covers = taken.marks === null ? undefined : coverSummary(network(), taken.marks);
    const made = (cell.cache !== 'covers-cold' && cell.cache !== 'fully-warm' && cell.cache !== 'no-covers') || (covers !== undefined && conditionMade(cell.cache, covers));
    return { ...taken, covers, window: made ? taken.window : { kind: 'broken', reason: `not ${cell.cache}: ${covers?.fromCache ?? '?'} of ${covers?.covers ?? '?'} covers cached` }, ms: Date.now() - measured };
  } catch (error) {
    if (error instanceof Error && /session was refused/.test(error.message)) throw error;
    return { window: { kind: 'broken', reason: error instanceof Error ? error.message.split('\n')[0] : String(error) }, ms: Date.now() - started };
  } finally {
    await context.close();
  }
}

const describe = (w: Window) => w.kind === 'occurred' ? `OCCURRED, ${Math.round(w.widthMs)}ms`
  : w.kind === 'none' ? 'none'
  : w.kind === 'incomplete' ? `did not complete within ${w.limitMs / 1000}s (${w.stage}${w.openAtLeastMs === undefined ? '' : `, the window open at least ${Math.round(w.openAtLeastMs)}ms`})`
  : `broken (${w.reason})`;

const browser = await chromium.launch();
try {
  log(`measure-window: ${mode} against ${BASE}, at ${VIEWPORT.width}x${VIEWPORT.height}, writing ${out}`);
  const session = await signIn(browser);
  log('signed in; the session is held in memory only');
  let plan: Array<{ cell: Cell; label: string }>;
  if (mode === 'weigh') {
    plan = [{ cell: { cache: 'cold', network: 'none', weigh: true }, label: mode }];
  } else if (mode === 'close') {
    plan = closePlan(PER_CELL).map((cell) => ({ cell, label: mode }));
  } else if (mode === 'run-a' || mode === 'run-b' || mode === 'cause') {
    plan = schedule(run.cells, PER_CELL).map((cell) => ({ cell, label: mode }));
  } else if (mode === 'after-deploy') {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    await rl.question('Push now. Press Enter as soon as Vercel shows the production deploy Ready (within 2 minutes of it). ');
    rl.close();
    plan = [{ cell: { cache: 'cold', network: 'none' }, label: 'after-deploy' }, { cell: { cache: 'cold', network: 'slow-3g' }, label: 'after-deploy' }];
  } else {
    log(`no request for ${IDLE_MS / 60000} minutes from ${new Date().toLocaleTimeString()}; nothing else should load the app meanwhile`);
    await new Promise((resolve) => setTimeout(resolve, IDLE_MS));
    plan = [{ cell: { cache: 'cold', network: 'none' }, label: 'idle-cold' }];
  }
  const begun = Date.now();
  const roundSize = mode === 'close' ? 3 : mode === 'run-a' || mode === 'run-b' || mode === 'cause' ? run.cells.length : plan.length;
  let last: Awaited<ReturnType<typeof load>> | null = null;
  let before = loadavg()[0];
  const result = await runPlan(plan, async ({ cell }, i) => {
    before = loadavg()[0];
    last = await load(browser, session, cell, Math.floor(i / roundSize));
    return last.window;
  }, {
    brokenLimit: BROKEN_LIMIT,
    retakes: 2,
    record: ({ cell, label }, i, w) => {
      appendFileSync(out, `${JSON.stringify({ label, cell: cellName(cell), i, at: new Date().toISOString(), load: [before, loadavg()[0]], ...last })}\n`);
      log(`[${i + 1}/${plan.length}] ${cellName(cell)}: ${describe(w)}`);
      if (i + 1 === roundSize && w.kind !== 'broken' && roundSize < plan.length) {
        const p = projection(Date.now() - begun, plan.length / roundSize);
        log(`one round took ${Math.round((Date.now() - begun) / 1000)}s on this run; about ${p.minutes} minutes to go${p.overTwoHours ? '. That is past two hours: stop it with Ctrl-C (the loads so far are kept, with no verdict)' : ''}`);
      }
    },
  });
  if (result.stopped) {
    log(`\n${result.brokenLoads} loads were still broken after their retakes: the instrument is broken, and the run stops without a verdict. Every attempt: ${out}`);
  } else {
    const v = verdict(loadsOfLog(readFileSync(out, 'utf8')));
    log(`\n${v.sentence}`);
    for (const p of pressesOfLog(readFileSync(out, 'utf8'))) log(`pressed, React ${p.attached ? 'attached' : 'not attached'}, wall ${p.hydrated ? 'hydrated' : 'not hydrated'}: ${p.outcome}, ${p.loads} load(s)`);
    log(`${v.broken} load(s) broken after their retakes, left out. Every attempt: ${out}`);
  }
} finally {
  await browser.close();
}
