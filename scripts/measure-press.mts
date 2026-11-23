/**
 * **The wait from press to answer as Adam meets it (§P.3's in-flight step, the Report bullet; step 3, unit 3b's second
 * half; the coordinator, 22 and 23 Nov): five presses of ASK on the grid at 390 × 844 and at 1440 × 900, on production,
 * each timed from the press to the first cover drawn, with the machine's load before and after, the spread, and the
 * longest named. Adam runs this: production is behind his session, and the figure is the one he meets.**
 *
 *     read -rs "P?Password: "; echo; PROD_LOGIN_PASSWORD="$P" npm run press:measure; unset P
 *
 * The password is read from the environment only, never from a file (the coordinator, 29 Oct), and the session is kept in
 * memory. Nothing is written to the collection: an ask reads the pool and asks the model, and that is all a press does.
 * Against another base, `PRESS_BASE_URL=http://localhost:3000` measures a local production build the same way, so the
 * two can be compared once and the local figure trusted after (the coordinator, 23 Nov: the number sizing the indicator
 * has to be the one Adam meets, so say the gap rather than assume it).
 *
 * What is timed: from the click on ASK to the first drawn `[data-pick-answer]` of a new answer, or the slot's message
 * changing where the pick answers with no record; polled every 16ms inside Playwright, so the reading is within a frame
 * of the draw. The route's own log line (total and model milliseconds) is the server side of the same press, read in
 * Vercel's logs within the hour; this is the client side, the network and the draw included.
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

type Press = { press: number; ms: number; outcome: 'answered' | 'slot' | 'timed-out'; cells: number; slot: string };

/*
  The in-page code is a STRING, never a function (Adam's second run, 23 Nov): tsx transpiles through esbuild with
  keepNames, which wraps every function in an injected `__name` helper, and Playwright serialises a function's source
  into the page, where no such helper exists; the first `page.evaluate(fn)` threw `__name is not defined`. A string is
  evaluated as written and cannot regress when a transpiler option changes. e2e/measure-press-3b.spec.ts runs this
  script end to end against the suite's server, so the in-page path executes somewhere before it reaches him.
*/
const ANSWER_STATE_JS = `(() => {
  const drawn = (el) => el.getClientRects().length > 0;
  const cells = Array.from(document.querySelectorAll('[data-pick-answer]')).filter(drawn).map((el) => (el.querySelector('a') || {}).getAttribute ? (el.querySelector('a').getAttribute('href') || '') : '');
  const slot = (Array.from(document.querySelectorAll('[data-pick-slot]')).filter(drawn)[0] || {}).textContent || '';
  return { cells, slot };
})()`;
type AnswerState = { cells: string[]; slot: string };
/** What the answer looks like now: the drawn cells' links and the slot's text, read inside the page. */
const answerState = (page: Page) => page.evaluate(ANSWER_STATE_JS) as Promise<AnswerState>;

/*
  Press to answer is the route's reply plus the draw: the click, then the ask route's response, then two frames so the
  answer is painted. Not "the drawn set changed": a re-ask can return the same records (the suite's five-record pool
  does, and production can), and a detector waiting for a change would wait out its limit on a perfectly good answer.
*/
async function pressOnce(page: Page, n: number): Promise<Press> {
  const control = page.locator('[data-pick-control]').filter({ visible: true });
  const field = control.locator('[data-ask-field]');
  if (n === 1) await field.fill(PHRASE);
  const reply = page.waitForResponse((r) => r.url().includes('/api/ask') && r.request().method() === 'POST', { timeout: LIMIT_MS });
  const started = Date.now();
  await control.getByRole('button', { name: /^ask$/i }).click();
  const response = await reply.catch(() => null);
  if (response === null) return { press: n, ms: Date.now() - started, outcome: 'timed-out', cells: 0, slot: '' };
  const body = (await response.json().catch(() => null)) as { answers?: unknown[] } | null;
  /* Two frames: the answer is in the DOM after the first commit and on screen after the next. */
  await page.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
  const ms = Date.now() - started;
  const after = await answerState(page);
  const answered = response.ok() && Array.isArray(body?.answers) && body.answers.length > 0;
  return { press: n, ms, outcome: answered ? 'answered' : 'slot', cells: after.cells.length, slot: after.slot.trim() };
}

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length % 2 === 1 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };

const browser = await chromium.launch();
try {
  const session = await signIn(browser);
  log(`measure-press: ${BASE}, "${PHRASE}", ${PRESSES} presses at each of ${VIEWPORTS.map((v) => v.name).join(' and ')}; load before ${load().join(' ')}`);
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({ storageState: session, viewport: { width: viewport.width, height: viewport.height } });
    const page = await context.newPage();
    const loadBefore = load();
    await page.goto(`${BASE}/?view=grid`, { timeout: 60_000 });
    await page.locator('[data-collection-filters][data-hydrated="true"]').first().waitFor({ timeout: 60_000 });
    const presses: Press[] = [];
    for (let n = 1; n <= PRESSES; n += 1) {
      const p = await pressOnce(page, n);
      presses.push(p);
      log(`  ${viewport.name}: press ${n} ${p.outcome} in ${(p.ms / 1000).toFixed(1)}s (${p.cells} cell(s)${p.slot === '' ? '' : `, slot "${p.slot}"`})`);
      appendFileSync(out, `${JSON.stringify({ base: BASE, viewport: viewport.name, phrase: PHRASE, ...p, at: new Date().toISOString() })}\n`);
    }
    const loadAfter = load();
    const answered = presses.filter((p) => p.outcome !== 'timed-out').map((p) => p.ms);
    const longest = presses.reduce((a, b) => (b.ms > a.ms ? b : a));
    log(`  ${viewport.name}: ${answered.length} of ${PRESSES} answered; min ${(Math.min(...answered) / 1000).toFixed(1)}s, median ${(median(answered) / 1000).toFixed(1)}s, max ${(Math.max(...answered) / 1000).toFixed(1)}s; the longest press ${longest.press} at ${(longest.ms / 1000).toFixed(1)}s; load ${loadBefore.join(' ')} before and ${loadAfter.join(' ')} after`);
    appendFileSync(out, `${JSON.stringify({ base: BASE, viewport: viewport.name, summary: { answered: answered.length, min: Math.min(...answered), median: median(answered), max: Math.max(...answered), longest }, load: { before: loadBefore, after: loadAfter } })}\n`);
    await context.close();
  }
  log(`measure-press: written to ${out}`);
} finally {
  await browser.close();
}
