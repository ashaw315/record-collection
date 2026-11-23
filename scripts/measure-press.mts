/**
 * **The wait from press to answer as Adam meets it (§P.3's in-flight step, the Report bullet; step 3, unit 3b's second
 * half; the coordinator, 22 and 23 Nov): at 390 × 844 and 1440 × 900 on the grid, on production, five independent first
 * presses (the page reloaded before each, so each sees the whole pool and no run history: the ordinary case, and the one
 * the indicator is sized against), five more on a grid filtered to about half the collection (the slope's second point,
 * since every pooled record's text goes to the model on every press), and then five consecutive presses on one page.
 * Each press: the reply (the click to the ask route's reply plus two frames), the covers (from there to the last of the
 * answer's covers painted, Design's boundary question), the cells and verdict returned, and the records sent and left
 * out. Load before and after each run. Adam runs this: production is behind his session.**
 *
 *     read -rs "P?Password: "; echo; PROD_LOGIN_PASSWORD="$P" npm run press:measure; unset P
 *
 * The password is read from the environment only, never from a file (the coordinator, 29 Oct), and the session is kept in
 * memory. Nothing is written to the collection: an ask reads the pool and asks the model, and that is all a press does.
 * Against another base, `PRESS_BASE_URL=http://localhost:3000` measures a local production build the same way, so the
 * two can be compared once and the local figure trusted after (the coordinator, 23 Nov: the number sizing the indicator
 * has to be the one Adam meets, so say the gap rather than assume it).
 *
 * What is timed is named, so no fourth unnamed boundary joins the three reconciled on 23 Nov: the reply is not the paint
 * of the first cover, and the gap between them is two frames unless the draw is slower; the covers figure is the rest,
 * to the last cover decoded or failed. Once the indicator exists, the slot ceasing to show it is the better boundary.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { loadavg } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';

const password = process.env.PROD_LOGIN_PASSWORD;
if (password === undefined || password === '') {
  process.stderr.write('measure-press: PROD_LOGIN_PASSWORD is not set. Run it as\n  read -rs "P?Password: "; echo; PROD_LOGIN_PASSWORD="$P" npm run press:measure; unset P\n');
  process.exit(2);
}
const BASE = process.env.PRESS_BASE_URL ?? 'https://record-collection-rust.vercel.app';
const PHRASE = process.env.PRESS_PHRASE ?? 'something for a rainy afternoon';
const onProduction = process.env.PRESS_BASE_URL === undefined;
/* Fixed by the rule on production; the overrides are for the suite's run against its own server, and are refused on production as measure-window refuses its own. */
const PRESSES = process.env.PRESS_PRESSES === undefined ? 5 : Number(process.env.PRESS_PRESSES);
if (onProduction && (PRESSES !== 5 || process.env.PRESS_OUT_DIR !== undefined)) {
  process.stderr.write('measure-press: PRESS_PRESSES and PRESS_OUT_DIR change the measurement and are refused against production\n');
  process.exit(2);
}
/* The two hosts Adam uses: the grid's band on the phone, the grid's sidebar on the desk. */
const VIEWPORTS = [
  { name: '390', width: 390, height: 844 },
  { name: '1440', width: 1440, height: 900 },
] as const;
/* Three times the longest press seen on production (16.8s, 20 Nov): a press past this is reported as such, not waited on. */
const LIMIT_MS = 60_000;

const outDir = process.env.PRESS_OUT_DIR ?? join('docs', 'measurements', 'press-to-answer');
mkdirSync(outDir, { recursive: true });
const out = join(outDir, `${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`);
const log = (line: string) => process.stdout.write(`${line}\n`);
const load = () => loadavg().map((n) => Number(n.toFixed(2)));

async function signIn(browser: Browser): Promise<Awaited<ReturnType<BrowserContext['storageState']>>> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
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

type Mode = 'independent' | 'half' | 'consecutive';
type Press = {
  mode: Mode;
  press: number;
  /** From the click to the ask route's reply plus two frames: the boundary named in NOTES, 23 Nov. */
  replyMs: number;
  /** From that point to the last of the answer's covers decoded and painted (two frames after), or null where none was drawn. */
  coversMs: number | null;
  outcome: 'answered' | 'slot' | 'timed-out';
  cells: number;
  verdict: string | null;
  /** The request's pool and exclusions: the records the prompt is built from are the pool less the excluded, where every pooled record has matched text, as production's 55 do. */
  sent: number;
  excluded: number;
  slot: string;
  /** The answer's record ids in rank order: the run's own answers, so Design's top-N question (23 Nov) can be read against them offline. */
  ids: string[];
};

/*
  The in-page code is a STRING, never a function (Adam's second run, 23 Nov): tsx transpiles through esbuild with
  keepNames, which wraps every function in an injected `__name` helper, and Playwright serialises a function's source
  into the page, where no such helper exists; the first `page.evaluate(fn)` threw `__name is not defined`. A string is
  evaluated as written and cannot regress when a transpiler option changes. e2e/measure-press-3b.spec.ts runs this
  script end to end against the suite's server, so the in-page path executes somewhere before it reaches him.
*/
const SLOT_JS = `(() => {
  const drawn = (el) => el.getClientRects().length > 0;
  return ((Array.from(document.querySelectorAll('[data-pick-slot]')).filter(drawn)[0] || {}).textContent || '').trim();
})()`;
const FRAMES_JS = 'new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))';
/*
  Design's boundary question (23 Nov): the time from the reply to the last cover painted. The answer's own cells, by
  their links, so a previous answer's covers already on screen are never read as this one's; a cover is done when its
  image is complete (decoded, or failed, which is also the end of the wait) or the cell draws the no-cover square.
*/
const coversDoneJs = (ids: readonly string[]) => `(() => {
  const want = ${JSON.stringify(ids.map((id) => `/records/${id}`))};
  const drawn = (el) => el.getClientRects().length > 0;
  const cells = Array.from(document.querySelectorAll('[data-pick-answer]')).filter(drawn);
  const hrefs = cells.map((c) => (c.querySelector('a') && c.querySelector('a').getAttribute('href')) || '');
  if (!want.every((h) => hrefs.includes(h))) return false;
  return cells.filter((c, i) => want.includes(hrefs[i])).every((c) => {
    const img = c.querySelector('img');
    return img === null ? c.querySelector('[data-grid-cover="none"]') !== null : img.complete;
  });
})()`;

/*
  Press to answer is the route's reply plus two frames: not "the drawn set changed", since a re-ask can return the same
  records and a detector waiting for a change would wait out its limit on a good answer. The covers are timed after it.
*/
async function pressOnce(page: Page, mode: Mode, n: number, fill: boolean): Promise<Press> {
  const control = page.locator('[data-pick-control]').filter({ visible: true });
  if (fill) await control.locator('[data-ask-field]').fill(PHRASE);
  const reply = page.waitForResponse((r) => r.url().includes('/api/ask') && r.request().method() === 'POST', { timeout: LIMIT_MS });
  const started = Date.now();
  await control.getByRole('button', { name: /^ask$/i }).click();
  const response = await reply.catch(() => null);
  if (response === null) return { mode, press: n, replyMs: Date.now() - started, coversMs: null, outcome: 'timed-out', cells: 0, verdict: null, sent: 0, excluded: 0, slot: '', ids: [] };
  const request = (response.request().postDataJSON() ?? {}) as { pool?: unknown[]; exclude?: unknown[] };
  const body = (await response.json().catch(() => null)) as { answers?: Array<{ recordId: string }>; verdict?: string | null } | null;
  await page.evaluate(FRAMES_JS);
  const replied = Date.now();
  const ids = (body?.answers ?? []).map((a) => a.recordId);
  let coversMs: number | null = null;
  if (ids.length > 0) {
    const done = await page.waitForFunction(coversDoneJs(ids), undefined, { polling: 16, timeout: LIMIT_MS }).then(() => true).catch(() => false);
    if (done) {
      await page.evaluate(FRAMES_JS);
      coversMs = Date.now() - replied;
    }
  }
  return {
    mode,
    press: n,
    replyMs: replied - started,
    coversMs,
    outcome: response.ok() && ids.length > 0 ? 'answered' : 'slot',
    cells: ids.length,
    verdict: body?.verdict ?? null,
    sent: Array.isArray(request.pool) ? request.pool.length : 0,
    excluded: Array.isArray(request.exclude) ? request.exclude.length : 0,
    slot: ids.length > 0 ? '' : ((await page.evaluate(SLOT_JS)) as string),
    ids,
  };
}

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length % 2 === 1 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };

const s1 = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
const s2 = (ms: number) => `${(ms / 1000).toFixed(2)}s`;
const spread = (xs: number[], f: (n: number) => string) => (xs.length === 0 ? 'none' : `min ${f(Math.min(...xs))}, median ${f(median(xs))}, max ${f(Math.max(...xs))}`);

/*
  The slope's second point (the coordinator, 23 Nov): the pick sends every pooled record's text on every press, so the
  pool is the variable, and the grid's pool is what it shows. A filter leaving about half the collection, pressed
  independently with everything else fixed: on production `yearTo=1974` leaves 28 of 55 (27 after), read 23 Nov.
*/
const HALF_QUERY = process.env.PRESS_HALF_QUERY ?? 'yearTo=1974';

async function openGrid(page: Page, query = '') {
  await page.goto(`${BASE}/?view=grid${query === '' ? '' : `&${query}`}`, { timeout: 60_000 });
  await page.locator('[data-collection-filters][data-hydrated="true"]').first().waitFor({ timeout: 60_000 });
}

/*
  Two runs per width (the coordinator, 23 Nov, on Adam's first figures, where presses grew faster within a run):
  independent first presses, the page reloaded before each so every press sees the whole pool and no run history, which
  is the ordinary case and the one the indicator is sized against; then consecutive presses on one page, the run leaving
  out what it has named, so the record count sent shows whether a shrinking prompt is what makes a run speed up.
*/
const browser = await chromium.launch();
try {
  const session = await signIn(browser);
  log(`measure-press: ${BASE}, "${PHRASE}", ${PRESSES} independent, ${PRESSES} independent on a pool filtered by ${HALF_QUERY}, and ${PRESSES} consecutive presses at each of ${VIEWPORTS.map((v) => v.name).join(' and ')}; load before ${load().join(' ')}`);
  log('  reply: the click to the ask route\'s reply plus two frames; covers: from there to the last cover painted');
  for (const viewport of VIEWPORTS) {
    for (const mode of ['independent', 'half', 'consecutive'] as const) {
      const context = await browser.newContext({ storageState: session, viewport: { width: viewport.width, height: viewport.height } });
      const page = await context.newPage();
      const loadBefore = load();
      const presses: Press[] = [];
      for (let n = 1; n <= PRESSES; n += 1) {
        const fresh = mode !== 'consecutive' || n === 1;
        if (fresh) await openGrid(page, mode === 'half' ? HALF_QUERY : '');
        const p = await pressOnce(page, mode, n, fresh);
        presses.push(p);
        log(`  ${viewport.name} ${mode}: press ${n} ${p.outcome}, reply ${s1(p.replyMs)}, covers ${p.coversMs === null ? 'none drawn' : `+${s2(p.coversMs)}`}, ${p.cells} cell(s), verdict ${p.verdict ?? 'none'}, ${p.sent} sent, ${p.excluded} left out${p.slot === '' ? '' : `, slot "${p.slot}"`}`);
        appendFileSync(out, `${JSON.stringify({ base: BASE, viewport: viewport.name, phrase: PHRASE, ...p, at: new Date().toISOString() })}\n`);
      }
      const loadAfter = load();
      const answered = presses.filter((p) => p.outcome !== 'timed-out');
      const replies = answered.map((p) => p.replyMs);
      const covers = answered.flatMap((p) => (p.coversMs === null ? [] : [p.coversMs]));
      const longest = presses.reduce((a, b) => (b.replyMs > a.replyMs ? b : a));
      log(`  ${viewport.name} ${mode}: ${answered.length} of ${PRESSES} answered; reply ${spread(replies, s1)}; covers after the reply ${spread(covers, s2)}; the longest press ${longest.press} at ${s1(longest.replyMs)}; load ${loadBefore.join(' ')} before and ${loadAfter.join(' ')} after`);
      appendFileSync(out, `${JSON.stringify({ base: BASE, viewport: viewport.name, mode, summary: { answered: answered.length, replies, covers, longest }, load: { before: loadBefore, after: loadAfter } })}\n`);
      await context.close();
    }
  }
  log(`measure-press: written to ${out}`);
} finally {
  await browser.close();
}
