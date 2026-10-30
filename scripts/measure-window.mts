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
 * written. Nothing is pressed and nothing is written to the collection.
 * Each load attempt is a line in `docs/measurements/window-160/<mode>-<time>.jsonl`.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { loadavg } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { chromium, type Browser, type BrowserContext } from '@playwright/test';
import { NETWORK, RECORDER, RUN_A, RUN_B, cellName, projection, runPlan, schedule, takeLoad, verdict, type Cell, type Window } from './window-measure';

const MODES = ['run-a', 'run-b', 'after-deploy', 'idle-cold'] as const;
const mode = process.argv[2] ?? 'run-a';
if (!(MODES as readonly string[]).includes(mode)) {
  process.stderr.write(`measure-window: unknown mode ${mode}\n`);
  process.exit(2);
}
const password = process.env.PROD_LOGIN_PASSWORD;
if (password === undefined || password === '') {
  process.stderr.write('measure-window: PROD_LOGIN_PASSWORD is not set. Run it as\n  read -rs "P?Password: "; echo; PROD_LOGIN_PASSWORD="$P" npm run window:measure; unset P\n');
  process.exit(2);
}
const BASE = process.env.WINDOW_BASE_URL ?? 'https://record-collection-rust.vercel.app';
const onProduction = process.env.WINDOW_BASE_URL === undefined;
const VIEWPORT = { width: 1440, height: 900 };
const run = mode === 'run-b' ? RUN_B : RUN_A;
/* Fixed by the rule on production; WINDOW_PER_CELL is for a smoke run on another base and is refused on production. */
const PER_CELL = process.env.WINDOW_PER_CELL === undefined ? run.perCell : Number(process.env.WINDOW_PER_CELL);
if (PER_CELL !== run.perCell && onProduction) {
  process.stderr.write('measure-window: WINDOW_PER_CELL changes the stopping rule and is refused against production\n');
  process.exit(2);
}
const BROKEN_LIMIT = 3;
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

type Taken = Awaited<ReturnType<typeof takeLoad>> & { ms: number };

async function load(browser: Browser, session: Awaited<ReturnType<typeof signIn>>, cell: Cell): Promise<Taken | { window: Window; ms: number }> {
  const context = await browser.newContext({ viewport: VIEWPORT, storageState: session });
  const started = Date.now();
  try {
    const page = await context.newPage();
    await page.addInitScript(RECORDER);
    if (cell.cache === 'warm') {
      /* The warm-up is unthrottled and unrecorded: it fills this context's cache. */
      const warm = await takeLoad(page, `${BASE}/`, limitOf(cell));
      if (warm.window.kind === 'incomplete' || warm.window.kind === 'broken') return { window: { kind: 'broken', reason: `the warm-up did not finish (${warm.window.kind})` }, ms: Date.now() - started };
    }
    const cdp = await context.newCDPSession(page);
    const net = NETWORK[cell.network];
    await cdp.send('Network.emulateNetworkConditions', net.kbps === null
      ? { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }
      : { offline: false, latency: net.latency, downloadThroughput: net.kbps * 125, uploadThroughput: net.kbps * 125 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: net.cpu });
    const measured = Date.now();
    const taken = await takeLoad(page, `${BASE}/`, limitOf(cell));
    return { ...taken, ms: Date.now() - measured };
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
  if (mode === 'run-a' || mode === 'run-b') {
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
  const roundSize = mode === 'run-a' || mode === 'run-b' ? run.cells.length : plan.length;
  let last: Awaited<ReturnType<typeof load>> | null = null;
  let before = loadavg()[0];
  const result = await runPlan(plan, async ({ cell }) => {
    before = loadavg()[0];
    last = await load(browser, session, cell);
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
    const v = verdict(result.loads.map((l) => ({ cell: cellName(l.cell.cell), window: l.window })), PER_CELL);
    log(`\n${v.sentence}`);
    log(`${v.broken} load(s) broken after their retakes, left out. Every attempt: ${out}`);
  }
} finally {
  await browser.close();
}
