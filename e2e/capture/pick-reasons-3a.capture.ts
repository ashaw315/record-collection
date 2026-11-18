import { mkdirSync, writeFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import { join } from 'node:path';
import { test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from '../cleanup';
import { removeRecordsFor, seedRecords } from '../seed';
import { login } from '../sign-in';
import { wallMeasured } from '../wall-measured';

/**
 * **Step 3, unit 3a, captured (the Mood Pick target §P.2; the coordinator, 15 and 17 Nov): every answer's reason in
 * every host, the consolation labelled, on the production build locally.** Every record here is SEEDED and every reply
 * is STUBBED: the test environment has no provider key and the pick's latch is the whole collection's, so `/api/ask` is
 * answered by this file, and the reasons are this file's sentences, not the model's. A capture is a figure with a
 * picture attached (the coordinator, 12 Nov), so the README states every length and time. The seeded captions are at
 * least as long as the collection's longest, read from production on 17 Nov: the longest title 74 characters (Glenn
 * Miller Plays Selections From "The Glenn Miller Story" And Other Hits), the longest artist 31 (Paul Whiteman And His
 * Orchestra). Written to `docs/captures/pick-reasons-3a/`.
 *
 *     CAPTURE=1 E2E_SERVER=build npx playwright test --project=capture pick-reasons-3a
 */
const OUT = join('docs', 'captures', 'pick-reasons-3a');
registerCleanup();

/* One sentence each, at the length the drafts' sentences run to; their lengths go in the README. */
const REASONS = [
  'Slow and spacious with abrasive peaks on side two, for a late room that wants attention rather than company.',
  'Brisk acoustic songs played close and light, easy to sit under conversation on a bright morning.',
  'A long side of one quiet mood, hiss and bare guitar, that rewards a dark room and a still listener.',
  'Dense horn charts at a dance tempo, loud from the first bar, for a room that wants waking up.',
  'Crooned ballads over strings that stay soft all the way through, for the end of an evening.',
];
const CONSOLATION = 'Slow and warm as asked, though sung throughout where no vocals were wanted; the closest in feel here.';
/* 66 characters before the number and suffix the seeder adds, so every title passes the collection's longest, 74. */
const TITLE_PREFIX = 'Selections From The Long Evening Programme And Other Favourites Vol';
/* 34 characters before the suffix, past the collection's longest artist, 31. */
const ARTIST_PREFIX = 'The Reason Orchestra And Its Chorus';

type Row = { id: string; title: string };
async function seed(page: Page): Promise<{ artistId: string; artist: string; records: Row[] }> {
  const suffix = `c3a${Date.now().toString(36)}`;
  const artist = `${ARTIST_PREFIX} ${suffix}`;
  const created = (await (await page.request.post('/api/artists', { data: { name: artist } })).json()) as { id: string };
  trackArtist(created.id);
  await seedRecords(created.id, TITLE_PREFIX, suffix, REASONS.length);
  const listed = (await (await page.request.get(`/api/records?artistId=${created.id}&pageSize=100`)).json()) as { data: Row[] };
  return { artistId: created.id, artist, records: [...listed.data].sort((x, y) => x.title.localeCompare(y.title)) };
}

type Reply = Record<string, unknown>;
const answerReply = (records: Row[], rotate = 0): Reply => {
  const order = [...records.slice(rotate), ...records.slice(0, rotate)];
  return { mode: 'pick', verdict: 'answer', answers: order.map((r, i) => ({ recordId: r.id, reason: REASONS[(i + rotate) % REASONS.length], claims: ['c'] })), from: 'phrase', askedFrom: null, undescribed: null, unanswerable: false };
};
const consolationReply = (records: Row[]): Reply => ({ mode: 'pick', verdict: 'nothing-fits', answers: [{ recordId: records[0].id, reason: CONSOLATION, claims: ['c'] }], from: 'phrase', askedFrom: null, undescribed: null, unanswerable: false });

const control = (page: Page) => page.locator('[data-pick-control]').filter({ visible: true });
const askFor = async (page: Page, phrase: string) => {
  await control(page).locator('[data-ask-field]').fill(phrase);
  await control(page).getByRole('button', { name: /^ask$/i }).click();
};
const filtersReady = (page: Page) => page.locator('[data-collection-filters][data-hydrated="true"]').first().waitFor({ timeout: 30_000 });
const reasonsDrawn = (page: Page, count: number) => page.locator('[data-grid-reason]').nth(count - 1).waitFor({ timeout: 30_000 });
const panelReasonDrawn = (page: Page) => page.locator('[data-testid="panel-reason"]').waitFor({ timeout: 30_000 });
const landed = (page: Page) => page.locator('[data-wall-container][data-phase="landed"]').waitFor({ timeout: 30_000 });

/* The page's own clock: each press on the control, and each change of the drawn reasons, so a press's time is the page's and not the test's. */
const RECORDER = `window.__cap = { presses: [], draws: [], last: '' };
document.addEventListener('click', function (e) { if (e.target && e.target.closest && e.target.closest('[data-pick-control]')) window.__cap.presses.push(performance.now()); }, true);
new MutationObserver(function () {
  var r = Array.prototype.map.call(document.querySelectorAll('[data-grid-reason]'), function (el) { return el.textContent; }).join('|');
  if (r !== window.__cap.last) { window.__cap.last = r; window.__cap.draws.push([performance.now(), r]); }
}).observe(document, { subtree: true, childList: true, characterData: true });`;
/* `document`, not `document.documentElement`: an init script runs before the document has a root, and observing null threw, so no draw was recorded (the first run, 17 Nov). */

async function shot(page: Page, name: string, fullPage: boolean) {
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(0, 0);
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage });
}

const lines: string[] = [];

test.describe('wide, a fine pointer', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test('the shelf, the far view at 900 and 768, the table and the grid at 1440', async ({ page }) => {
    test.skip(process.env.CAPTURE !== '1', 'A capture tool: run with CAPTURE=1');
    test.setTimeout(300_000);
    mkdirSync(OUT, { recursive: true });
    await login(page);
    const { artistId, records } = await seed(page);
    let reply: Reply = answerReply(records);
    await page.route('**/api/ask', (route) => route.fulfill({ json: reply }));
    try {
      for (const state of ['answer', 'consolation'] as const) {
        reply = state === 'answer' ? answerReply(records) : consolationReply(records);
        /* The shelf: the answer is the pull, its reason in the pulled record's facts. */
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(`/?artistId=${artistId}`);
        await wallMeasured(page);
        await askFor(page, 'something slow for tonight');
        await landed(page);
        await panelReasonDrawn(page);
        await shot(page, `seeded-shelf-1440x900-${state}`, false);
        /* The far view's column host at 900 and at 768: the first answer's cell in the count column (its five are unit 3b's). */
        for (const height of [900, 768]) {
          await page.setViewportSize({ width: 1440, height });
          await page.goto(`/?wall=far&artistId=${artistId}`);
          await wallMeasured(page);
          await askFor(page, 'something slow for tonight');
          await reasonsDrawn(page, 1);
          await shot(page, `seeded-far-column-1440x${height}-${state}`, false);
        }
        await page.setViewportSize({ width: 1440, height: 900 });
        for (const view of ['table', 'grid'] as const) {
          await page.goto(`/?view=${view}&artistId=${artistId}`);
          await filtersReady(page);
          await askFor(page, 'something slow for tonight');
          await reasonsDrawn(page, state === 'answer' ? 5 : 1);
          await shot(page, `seeded-${view}-1440x900-${state}`, true);
        }
      }
    } finally {
      await removeRecordsFor(artistId);
    }
  });
});

test.describe('narrow, a coarse pointer', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test('the table and the grid at 390, and five presses timed on the grid', async ({ page }) => {
    test.skip(process.env.CAPTURE !== '1', 'A capture tool: run with CAPTURE=1');
    test.setTimeout(300_000);
    mkdirSync(OUT, { recursive: true });
    await page.addInitScript(RECORDER);
    await login(page);
    const { artistId, artist, records } = await seed(page);
    let presses = 0;
    let reply: Reply | null = null;
    await page.route('**/api/ask', (route) => {
      if (reply !== null) return route.fulfill({ json: reply });
      /* The timed presses: each reply rotates the order, so every press redraws five cells with five reasons. */
      const body = answerReply(records, presses % REASONS.length);
      presses += 1;
      return route.fulfill({ json: body });
    });
    const timings: Array<{ press: number; ms: number; load1: number }> = [];
    try {
      for (const state of ['answer', 'consolation'] as const) {
        reply = state === 'answer' ? answerReply(records) : consolationReply(records);
        for (const view of ['table', 'grid'] as const) {
          await page.goto(`/?view=${view}&artistId=${artistId}`);
          await filtersReady(page);
          await askFor(page, 'something slow for tonight');
          await reasonsDrawn(page, state === 'answer' ? 5 : 1);
          await shot(page, `seeded-${view}-390x844-${state}`, true);
        }
      }
      /* Five presses on the grid at 390, each timed from the press to the five reasons redrawn, on the page's clock. */
      reply = null;
      await page.goto(`/?view=grid&artistId=${artistId}`);
      await filtersReady(page);
      await control(page).locator('[data-ask-field]').fill('something slow for tonight');
      for (let press = 1; press <= 5; press += 1) {
        const load1 = Math.round(loadavg()[0] * 100) / 100;
        const expected = Array.from({ length: REASONS.length }, (_, i) => REASONS[(i + (press - 1)) % REASONS.length]).join('|');
        await control(page).getByRole('button', { name: /^ask$/i }).click();
        await page.waitForFunction((want) => (window as unknown as { __cap: { draws: Array<[number, string]> } }).__cap.draws.some(([, r]) => r === want), expected, { timeout: 30_000 });
        const { pressAt, drawnAt } = await page.evaluate((want) => {
          const cap = (window as unknown as { __cap: { presses: number[]; draws: Array<[number, string]> } }).__cap;
          const pressAt = cap.presses[cap.presses.length - 1];
          const drawn = cap.draws.find(([t, r]) => t >= pressAt && r === want);
          return { pressAt, drawnAt: drawn === undefined ? null : drawn[0] };
        }, expected);
        timings.push({ press, ms: drawnAt === null ? Number.NaN : Math.round((drawnAt - pressAt) * 10) / 10, load1 });
        /* A press while the previous reply is in flight does nothing (interim), so each waits for its draw before the next. */
      }
    } finally {
      await removeRecordsFor(artistId);
    }
    const lens = REASONS.map((r) => [...r].length);
    const titleLen = [...records[0].title].length;
    lines.push(
      `# pick-reasons-3a · every answer's reason, the consolation labelled, in every host (§P.2; step 3, unit 3a), captured ${new Date().toISOString().slice(0, 10)}`,
      '',
      '**Every record in these captures is seeded and every reply is stubbed; no figure here describes the collection or the model.** The test',
      'environment has no provider key and the pick\'s latch is the whole collection\'s, so `/api/ask` is answered by the capture itself, and the',
      'reasons are the capture\'s sentences, not the model\'s. From the production build locally (E2E_SERVER=build).',
      '',
      `The five reasons are ${lens.join(', ')} characters (${Math.min(...lens)} to ${Math.max(...lens)}); the consolation's is ${[...CONSOLATION].length}. The seeded`,
      `titles are ${titleLen} characters each and the artist ${[...artist].length}, against the collection's longest title of 74 and longest artist of 31`,
      '(read from production, 17 Nov), so every caption here is longer than any real one.',
      '',
      '| host | window | state | file |',
      '|---|---|---|---|',
      '| the shelf: the answer pulled, its reason in the pulled record\'s facts | 1440 × 900 | answer, consolation | seeded-shelf-1440x900-{answer,consolation}.png |',
      '| the far view\'s column host: the first answer\'s cell in the count column (its five are unit 3b\'s) | 1440 × 900 and 1440 × 768 | answer, consolation | seeded-far-column-1440x{900,768}-{answer,consolation}.png |',
      '| the table\'s sidebar: five cells, each with its reason | 1440 × 900 | answer, consolation | seeded-table-1440x900-{answer,consolation}.png |',
      '| the grid\'s sidebar | 1440 × 900 | answer, consolation | seeded-grid-1440x900-{answer,consolation}.png |',
      '| the table\'s band, a coarse pointer | 390 × 844 | answer, consolation | seeded-table-390x844-{answer,consolation}.png |',
      '| the grid\'s band, a coarse pointer | 390 × 844 | answer, consolation | seeded-grid-390x844-{answer,consolation}.png |',
      '',
      'The consolation state is a nothing-fits reply with one stand-in: the slot says "Nothing fits.", and the one record is labelled "Closest',
      'available" (Proposed) above its cover in a cell and above its reason in the pulled record\'s facts.',
      '',
      '## Five presses on the grid at 390, timed on the page\'s clock',
      '',
      'From the press on ASK to the five reasons redrawn (a MutationObserver on the reasons\' text), each reply rotating the order so every press',
      'redraws five cells. The stub answers at once, so these are the page\'s own times, with no model and no network in them. Load is the',
      'machine\'s one-minute average at each press.',
      '',
      '| press | press → five reasons drawn (ms) | load |',
      '|---|---|---|',
      ...timings.map((t) => `| ${t.press} | ${t.ms} | ${t.load1} |`),
      '',
      'The reason\'s place in each host, its length and how it reads are provisional (§P.2), for Adam to judge on these.',
      '',
    );
    writeFileSync(join(OUT, 'README.md'), `${lines.join('\n')}\n`);
    console.log(timings.map((t) => `press ${t.press}: ${t.ms}ms at load ${t.load1}`).join('\n'));
  });
});
