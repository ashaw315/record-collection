/**
 * **§W.8's window, measured on the production wall: Adam runs this.**
 *
 *     read -rs "P?Password: "; echo; PROD_LOGIN_PASSWORD="$P" npm run window:measure; unset P
 *
 * Modes, by npm script:
 * - `window:measure`: the matrix, the measurement (NOTES, 29 Oct 18:30,
 *   amended 19:55). 8 cells of 30 loads, round-robin, no early stop.
 * - `window:measure:after-deploy`: the supplement's after-deploy pair. Start
 *   it before the deploy; it signs in, then waits for Enter once the deploy is
 *   Ready, so its first request after that is to the new deployment.
 * - `window:measure:idle-cold`: the supplement's idle-cold load. It signs in,
 *   makes no request for 20 minutes, then takes one cold load. Nothing else
 *   should load the app meanwhile.
 *
 * **The password is read from the environment only, never from a file
 * (the coordinator, 29 Oct),** and the session is kept in memory, never
 * written. Nothing is pressed and nothing is written to the collection: each
 * load opens the Collection and reads marks.
 *
 * Each load is a line in `docs/measurements/window-160/<mode>-<time>.jsonl`;
 * the verdict is printed at the end in the stopping rule's words.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { loadavg } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { chromium, type Browser, type BrowserContext } from '@playwright/test';
import { CELLS, NETWORK, RECORDER, cellName, readMarks, schedule, verdict, windowOf, type Cell, type Load } from './window-measure';

const mode = process.argv[2] ?? 'matrix';
if (!['matrix', 'after-deploy', 'idle-cold'].includes(mode)) {
  process.stderr.write(`measure-window: unknown mode ${mode}\n`);
  process.exit(2);
}
const password = process.env.PROD_LOGIN_PASSWORD;
if (password === undefined || password === '') {
  process.stderr.write('measure-window: PROD_LOGIN_PASSWORD is not set. Run it as\n  read -rs "P?Password: "; echo; PROD_LOGIN_PASSWORD="$P" npm run window:measure; unset P\n');
  process.exit(2);
}
const BASE = process.env.WINDOW_BASE_URL ?? 'https://record-collection-rust.vercel.app';
const VIEWPORT = { width: 1440, height: 900 };
/* 30 on production, fixed by the stopping rule; WINDOW_PER_CELL is for a smoke run on another base and is refused on production. */
const PER_CELL = process.env.WINDOW_PER_CELL === undefined ? 30 : Number(process.env.WINDOW_PER_CELL);
if (PER_CELL !== 30 && process.env.WINDOW_BASE_URL === undefined) {
  process.stderr.write('measure-window: WINDOW_PER_CELL changes the stopping rule and is refused against production\n');
  process.exit(2);
}
const BROKEN_LIMIT = 10;
const IDLE_MS = process.env.WINDOW_BASE_URL === undefined ? 20 * 60 * 1000 : Number(process.env.WINDOW_IDLE_MS ?? 20 * 60 * 1000);

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

async function load(browser: Browser, session: Awaited<ReturnType<typeof signIn>>, cell: Cell): Promise<Record<string, unknown>> {
  const context = await browser.newContext({ viewport: VIEWPORT, storageState: session });
  try {
    const page = await context.newPage();
    await page.addInitScript(RECORDER);
    if (cell.cache === 'warm') {
      /* The warm-up is unthrottled and unrecorded: it fills this context's cache. */
      await page.goto(`${BASE}/`, { waitUntil: 'load', timeout: 120_000 });
      await page.waitForFunction(() => (window as unknown as { __windowMarks?: { hydratedAt: number | null } }).__windowMarks?.hydratedAt !== null, undefined, { timeout: 60_000 }).catch(() => undefined);
    }
    const cdp = await context.newCDPSession(page);
    const net = NETWORK[cell.network];
    await cdp.send('Network.emulateNetworkConditions', net.kbps === null
      ? { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }
      : { offline: false, latency: net.latency, downloadThroughput: net.kbps * 125, uploadThroughput: net.kbps * 125 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: net.cpu });
    const started = Date.now();
    const response = await page.goto(`${BASE}/`, { waitUntil: 'load', timeout: 180_000 });
    if (new URL(page.url()).pathname === '/login') throw new Error('the session was refused: the Collection redirected to /login');
    await page.waitForFunction(() => (window as unknown as { __windowMarks?: { hydratedAt: number | null } }).__windowMarks?.hydratedAt !== null, undefined, { timeout: 60_000 }).catch(() => undefined);
    const marks = await readMarks(page);
    return { marks, window: windowOf(marks), ms: Date.now() - started, status: response?.status() ?? null, vercelId: response?.headers()['x-vercel-id'] ?? null };
  } catch (error) {
    if (error instanceof Error && /session was refused/.test(error.message)) throw error;
    return { marks: null, window: { kind: 'broken', reason: error instanceof Error ? error.message.split('\n')[0] : String(error) } };
  } finally {
    await context.close();
  }
}

const browser = await chromium.launch();
const loads: Load[] = [];
let broken = 0;
try {
  log(`measure-window: ${mode} against ${BASE}, at ${VIEWPORT.width}x${VIEWPORT.height}, writing ${out}`);
  const session = await signIn(browser);
  log('signed in; the session is held in memory only');
  let plan: Array<{ cell: Cell; label: string }>;
  if (mode === 'matrix') {
    plan = schedule(CELLS, PER_CELL).map((cell) => ({ cell, label: 'matrix' }));
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
  for (let i = 0; i < plan.length; i += 1) {
    const { cell, label } = plan[i];
    const before = loadavg()[0];
    let record = await load(browser, session, cell);
    /* A broken load is retaken, up to twice, and still counted among the broken; it is never a null. */
    for (let retry = 0; retry < 2 && (record.window as Load['window']).kind === 'broken'; retry += 1) {
      broken += 1;
      appendFileSync(out, `${JSON.stringify({ label, cell: cellName(cell), i, at: new Date().toISOString(), load: [before, loadavg()[0]], ...record })}\n`);
      if (broken >= BROKEN_LIMIT) throw new Error(`${broken} broken loads: the environment is broken, and the run stops without a verdict`);
      record = await load(browser, session, cell);
    }
    const w = record.window as Load['window'];
    if (w.kind === 'broken') broken += 1;
    loads.push({ cell: cellName(cell), window: w });
    appendFileSync(out, `${JSON.stringify({ label, cell: cellName(cell), i, at: new Date().toISOString(), load: [before, loadavg()[0]], ...record })}\n`);
    log(`[${i + 1}/${plan.length}] ${cellName(cell)}: ${w.kind === 'occurred' ? `OCCURRED, ${Math.round(w.widthMs)}ms` : w.kind === 'broken' ? `broken (${w.reason})` : 'none'}`);
    if (mode === 'matrix' && i + 1 === CELLS.length) {
      const perRound = Date.now() - begun;
      log(`one round took ${Math.round(perRound / 1000)}s; about ${Math.round((perRound * (PER_CELL - 1)) / 60000)} minutes to go`);
    }
  }
  const v = verdict(loads);
  log(`\n${v.sentence}`);
  log(`${broken} broken load(s) retaken or left out. Every load: ${out}`);
} finally {
  await browser.close();
}
