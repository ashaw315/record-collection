import { createServer, type Server } from 'node:http';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { pointerIs } from '../hit-area';
import { login } from '../sign-in';
import { wholePage } from '../whole-page';

/**
 * `/suggestions` as a reader sees it, with Ask Claude offered: the part of
 * `unpassed-screens-139` that could not be taken, because the test
 * environment has no model key and the panel then reads "not configured".
 *
 * Adam's condition (12 Oct): a placeholder that is obviously not a key, and
 * the run must show that no request to the model was made, recorded beside
 * the pictures. So this refuses to start unless it is run as
 *
 *     ANTHROPIC_API_KEY=not-a-key-capture-only \
 *     ANTHROPIC_BASE_URL=http://127.0.0.1:39139 \
 *     CAPTURE=1 npx playwright test --project=capture suggestions-configured
 *
 * **What shows no request reached the model, in the order it holds.**
 *
 *  1. `/suggestions` has ONE path to the model: `POST /api/suggestions/ai`
 *     (`route.ts`, the one call of `getGapAnalysisClient().analyse`), and
 *     only the browser starts it, when Ask Claude is pressed. The page's
 *     own render reads the database and the environment and nothing else
 *     (`suggestions`, `suggestionCount`, `gapAnalysisWithPrevious`,
 *     `listGenreTree`, `isAnthropicConfigured`); the route's GET reads the
 *     database. Read from the code, 12 Oct. So the server calls the model
 *     only if a POST reaches it.
 *  2. Every POST the page makes is answered in the browser. Counted both
 *     ways: requests seen, and requests answered by the stub. Equal means
 *     none reached the server, and with 1 that is the whole of it.
 *  3. Belt only: had a POST reached the server, its own guard refuses the
 *     send in a test context (`assertNoLiveCall`), and the model client's
 *     address is a listener this file starts on this machine. The
 *     listener's nought is NOT evidence by itself: since nothing reached
 *     the server, it would read nought whatever address the server held,
 *     and that the server held this one is inferred, not read back.
 *
 * The placeholder is not a credential and could not be used as one.
 */
/* `SUGGESTIONS_OUT` names the folder, so a later step takes the same five states into a folder of its own: `suggestions-configured-139` is step 139's, before the pass; `suggestions-140` is after it. */
const NAME = process.env.SUGGESTIONS_OUT ?? 'suggestions-configured-139';
const OUT = join('docs', 'captures', NAME);
const WINDOWS = [{ width: 390, pointer: 'coarse' as const }, { width: 1280, pointer: 'fine' as const }];
const PLACEHOLDER = 'not-a-key-capture-only';
const LISTENER = 'http://127.0.0.1:39139';
const AI = '**/api/suggestions/ai**';
const CAPTURE_RECORD = 'City Baby Attacked by Rats';

const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });
const ANSWER = [
  { artist: 'Anti-Cimex', title: 'Raped Ass', reason: 'The Swedish answer to Discharge’s first singles, and the root of the d-beat you already hold.', genre: 'Hardcore' },
  { artist: 'The Varukers', title: 'Bloodsuckers', reason: 'UK82 from the same year and the same circuit; nothing in the collection covers it.', genre: 'UK82' },
  { artist: 'Crass', title: 'The Feeding of the 5000', reason: 'The anarcho side of the scene your punk shelf leaves out entirely.', genre: 'Anarcho-punk' },
];

test('/suggestions with Ask Claude offered: empty, the list, idle, thinking, failed, answered', async ({ browser }) => {
  test.skip(process.env.CAPTURE !== '1', 'A capture tool: run with CAPTURE=1');
  if (process.env.ANTHROPIC_API_KEY !== PLACEHOLDER || process.env.ANTHROPIC_BASE_URL !== LISTENER) throw new Error(`run with ANTHROPIC_API_KEY=${PLACEHOLDER} and ANTHROPIC_BASE_URL=${LISTENER}: this capture does not start with any other key or address`);
  /*
    Pictures that have been handed on are not taken again over themselves. On 12 Oct this folder was re-run twice
    to correct its table after Adam had attached its pictures and Design had ruled from them; the ones ruled from
    were gone, and whether the new ten matched them could no longer be shown. A folder that exists is left alone
    unless the run says, by name, that replacing it is meant.
  */
  if (existsSync(join(OUT, `${NAME}.md`)) && process.env.CAPTURE_REPLACE !== '1') throw new Error(`${OUT} already holds a capture. It is not replaced unless CAPTURE_REPLACE=1 says so; a capture that has been handed on is retaken into a folder of its own`);
  test.setTimeout(600_000);
  mkdirSync(OUT, { recursive: true });

  /* 3: the model's address for this run. Whatever arrives is counted and refused. */
  const arrived: string[] = [];
  const listener: Server = createServer((request, response) => { arrived.push(`${request.method} ${request.url}`); response.writeHead(599).end(); });
  await new Promise<void>((resolve, reject) => { listener.once('error', reject); listener.listen(39139, '127.0.0.1', resolve); });

  /* The listener is shown to count before its nought is believed: one request sent to it from here, seen, and set aside. A counter that cannot count reads nought whatever happens. */
  await fetch(`${LISTENER}/self-check`).catch(() => {});
  expect(arrived, 'the listener counts what reaches it').toEqual(['GET /self-check']);
  arrived.length = 0;

  const seen: string[] = [];
  let answered = 0;
  const md = ['# /suggestions with Ask Claude offered', '', `The test database; desktop Chromium, touch on for the coarse pointer. The server was started with a placeholder for the model key, \`${PLACEHOLDER}\`, which is not a credential, so that the panel is the one a reader sees; every answer in these pictures is a stub’s.`, '', '| state | window | pointer | page height | picture, or why there is none |', '|---|---|---|---|---|'];
  const missed: string[] = [];
  try {
    for (const window of WINDOWS) {
      const context = await browser.newContext({ hasTouch: window.pointer === 'coarse', viewport: { width: window.width, height: 844 } });
      context.setDefaultTimeout(20_000);
      await context.route(/anthropic\.com|discogs\.com|musicbrainz\.org/, (route) => route.abort());
      const page = await context.newPage();
      page.on('request', (request) => { if (new URL(request.url()).pathname === '/api/suggestions/ai') seen.push(`${request.method()} at ${window.width}`); });
      await login(page);
      expect(await pointerIs(page)).toBe(window.pointer);
      const releases: Array<() => void> = [];
      const made: string[] = [];
      const post = async (path: string, data: unknown) => {
        const response = await page.request.post(path, { data, failOnStatusCode: false });
        expect(response.status(), `${path} ${JSON.stringify(data)}`).toBe(201);
        const { id } = (await response.json()) as { id: string };
        if (path !== '/api/influences') made.unshift(`${path}/${id}`);
        return id;
      };
      const open = async () => {
        await page.goto('/suggestions');
        await expect(page.getByText('Gap analysis is not configured on this deployment.'), 'the precondition: Ask Claude is offered').toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Ask Claude' })).toBeVisible();
      };
      const stub = async (answer: () => Promise<ReturnType<typeof json>> | ReturnType<typeof json>) => {
        await page.route(AI, async (route) => { answered += 1; await route.fulfill(await answer()); });
      };
      const shot = async (slug: string, state: string, arrange: () => Promise<void>) => {
        const file = `${slug}-w${window.width}-${window.pointer}-pointer.png`;
        try {
          await page.setViewportSize({ width: window.width, height: 844 });
          await arrange();
          await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
          await page.evaluate(() => document.fonts.ready);
          /* The mouse is put where it rests on nothing: a picture taken with it over the button it pressed shows the button's hover. */
          await page.mouse.move(1, 1);
          await page.waitForTimeout(400);
          const height = await page.evaluate(() => document.documentElement.scrollHeight);
          await wholePage(page, join(OUT, file));
          md.push(`| ${state} | ${window.width} | ${window.pointer} | ${height} | ${file} |`);
          process.stdout.write(`[capture] ${file}\n`);
        } catch (error) {
          const why = (error instanceof Error ? error.message : String(error)).split('\n')[0]?.slice(0, 200) ?? 'unknown';
          missed.push(`${slug} at ${window.width}: ${why}`);
          md.push(`| ${state} | ${window.width} | ${window.pointer} | | **not captured:** ${why.replace(/\|/g, '/')} |`);
          process.stdout.write(`[capture] NOT ${slug} at ${window.width}: ${why}\n`);
        } finally {
          for (const release of releases.splice(0)) release();
          await page.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => {});
        }
      };
      try {
        /* Before anything is made: the seed holds no influence and no shared lineup, so the list is empty by itself. Not contrived: if the seed ever gains one, the precondition says so and the state is a row that says why. */
        await shot('suggestions-nothing-to-suggest', 'nothing to suggest; Ask Claude before it is asked', async () => {
          await open();
          await expect(page.getByText('Nothing to suggest yet.'), 'the precondition: the seeded collection suggests nothing').toBeVisible();
        });

        /*
          Plain names, as a reader's would be. A spec stamps every name it makes, because specs share a database
          side by side; a capture runs alone on a database truncated at its start, so it need not, and a stamp in
          a picture for a design pass is a string no reader sees, where a line's length is what is being ruled.
        */
        const owned = await post('/api/artists', { name: 'GBH' });
        await post('/api/records', { title: CAPTURE_RECORD, artistId: owned });
        for (const [name, strength] of [['Anti-Cimex', 4], ['The Varukers', 3], ['Crass', 2]] as const) {
          const candidate = await post('/api/artists', { name });
          await post('/api/influences', { sourceArtistId: candidate, targetArtistId: owned, strength });
        }

        await shot('suggestions-list-ask-idle', 'the list, three artists; Ask Claude before it is asked', async () => {
          await open();
          await expect(page.getByRole('listitem').filter({ hasText: 'Anti-Cimex' }).first()).toBeVisible();
        });
        await shot('suggestions-ask-thinking', 'Ask Claude, thinking (the answer held)', async () => {
          let release: () => void = () => {};
          const wait = new Promise<void>((resolve) => { release = resolve; });
          releases.push(release);
          await stub(async () => { await wait; return json({ data: { suggestions: [], dropped: 0 } }); });
          await open();
          await page.getByRole('button', { name: 'Ask Claude' }).click();
          await expect(page.getByRole('button', { name: /thinking/i })).toBeVisible();
        });
        await shot('suggestions-ask-failed', 'Ask Claude, failed: the service at its limit', async () => {
          await stub(() => json({ error: { message: 'The suggestion service is at its limit for now.', code: 'RATE_LIMITED' } }, 429));
          await open();
          await page.getByRole('button', { name: 'Ask Claude' }).click();
          await expect(page.getByText('The suggestion service is at its limit for now.')).toBeVisible();
        });
        await shot('suggestions-ask-answered', 'Ask Claude, answered with three records', async () => {
          await stub(() => json({ data: { suggestions: ANSWER, dropped: 0 } }));
          await open();
          await page.getByRole('button', { name: 'Ask Claude' }).click();
          await expect(page.getByText('The Feeding of the 5000')).toBeVisible();
        });
      } finally {
        const records = (await (await page.request.get('/api/records?pageSize=200')).json()) as { data?: Array<{ id: string; title: string }> };
        for (const row of records.data ?? []) if (row.title === CAPTURE_RECORD) await page.request.delete(`/api/records/${row.id}`, { failOnStatusCode: false });
        for (const path of made) await page.request.delete(path, { failOnStatusCode: false });
        await context.close();
      }
    }
  } finally {
    await new Promise<void>((resolve) => listener.close(() => resolve()));
    md.push(
      '', '## No request to the model was made', '',
      '**What this rests on:** `/suggestions` reaches the model by one path, `POST /api/suggestions/ai`, which only the browser starts, when Ask Claude is pressed. The page’s own render and the route’s GET read the database and the environment and call no model (read from the code, 12 Oct). So the server calls the model only if a POST reaches it, and none did:', '',
      `- The page made **${seen.length}** request(s) to \`/api/suggestions/ai\` (${seen.join(', ') || 'none'}); the stub answered **${answered}** in the browser. ${seen.length === answered ? 'Equal: none reached the server.' : '**NOT EQUAL: a request reached the server.**'}`,
      `- The key was \`${PLACEHOLDER}\`: a placeholder, not a credential.`, '',
      `**Not what it rests on:** the server’s own guard (\`assertNoLiveCall\`) and a listener at \`${LISTENER}\` given to it as the model’s address stood behind the stub. The listener counted the one request sent to prove it counts and then received ${arrived.length}. That nought shows nothing by itself: no request reached the server, so it would be nought whatever address the server held, and that the server held this one was not read back.`, '',
      missed.length === 0 ? 'Every state above was reached.' : `**${missed.length} not reached:** ${missed.join('; ')}`,
    );
    writeFileSync(join(OUT, `${NAME}.md`), `${md.join('\n')}\n`);
  }
  expect(arrived, 'requests that reached the model’s address').toEqual([]);
  expect(seen.length, 'every request to the route was answered by the stub').toBe(answered);
});
