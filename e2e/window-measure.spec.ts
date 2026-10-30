import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist, trackRecord } from './cleanup';
import { holdDocumentTail, type DocumentTail } from './document-tail';
import { holdScheduler } from './hold-window';
import { login } from './sign-in';
import { RECORDER, conditionMade, coverSummary, readMarks, takeLoad, takePress, watchNetwork, windowOf } from '../scripts/window-measure';

/**
 * **The production measurement's recorder, shown able to see the window
 * (29 Oct).** The recorder (`scripts/window-measure.ts`) runs on Adam's
 * loads of the live wall, where nothing can stage the state; a null there
 * is only worth its count if the recorder sees the window when it is open.
 * So it is run here on the state built by the proxy that holds the
 * document's tail: still loading, spines painted. It must report the window
 * as occurred, at least as wide as the hold. Fails against a recorder that
 * reads readyState after the load rather than in the frame that paints the
 * spines. And a load the proxy holds past its limit must keep its marks: on
 * 29 Oct every cold slow-3g load was thrown away at its timeout, so whether
 * it had painted spines while loading was never known.
 */
registerCleanup();

const tails: DocumentTail[] = [];
test.afterEach(async () => { for (const t of tails.splice(0)) await t.close(); });

test('the recorder sees the window the proxy holds open, at least as wide as the hold', async ({ page }) => {
  await login(page);
  const artist = await page.request.post('/api/artists', { data: { name: `Window-${Date.now().toString(36)}` } });
  const artistId = ((await artist.json()) as { id: string }).id;
  trackArtist(artistId);
  for (let i = 0; i < 4; i += 1) {
    const record = await page.request.post('/api/records', { data: { title: `Window ${i}`, artistId } });
    trackRecord(((await record.json()) as { id: string }).id);
  }
  const base = test.info().project.use.baseURL;
  if (base === undefined) throw new Error('the spec needs the project baseURL');
  const tail = await holdDocumentTail(base);
  tails.push(tail);
  await page.addInitScript(RECORDER);
  await page.goto(`${tail.origin}/?artistId=${artistId}`, { waitUntil: 'commit' });
  await expect(page.locator('[data-wall="labelled"]')).toBeVisible({ timeout: 30_000 });
  expect(tail.holding(), 'the proxy is holding the tail').toBe(true);
  const HOLD = 600;
  await page.waitForTimeout(HOLD);
  tail.release();
  await expect.poll(async () => (await readMarks(page)).hydratedAt, { timeout: 30_000 }).not.toBeNull();
  const result = windowOf(await readMarks(page));
  expect(result.kind).toBe('occurred');
  expect(result.kind === 'occurred' ? result.widthMs : 0).toBeGreaterThanOrEqual(HOLD);
});

/* Fails against a load that discards its marks at the limit, or classes the timeout broken. */
test('a load held past its limit is kept as did not complete, the window open at least to the limit', async ({ page }) => {
  await login(page);
  const artist = await page.request.post('/api/artists', { data: { name: `Window-${Date.now().toString(36)}` } });
  const artistId = ((await artist.json()) as { id: string }).id;
  trackArtist(artistId);
  const record = await page.request.post('/api/records', { data: { title: 'Window late', artistId } });
  trackRecord(((await record.json()) as { id: string }).id);
  const base = test.info().project.use.baseURL;
  if (base === undefined) throw new Error('the spec needs the project baseURL');
  /* Compiled first, so the held load paints its spines well inside the limit. */
  await page.goto(`/?artistId=${artistId}`);
  await expect(page.locator('[data-wall="labelled"]')).toBeVisible({ timeout: 30_000 });
  const tail = await holdDocumentTail(base);
  tails.push(tail);
  await page.addInitScript(RECORDER);
  const LIMIT = 8_000;
  const result = await takeLoad(page, `${tail.origin}/?artistId=${artistId}`, LIMIT);
  expect(tail.holding(), 'the proxy held the tail through the limit').toBe(true);
  expect(result.window).toMatchObject({ kind: 'incomplete', limitMs: LIMIT, stage: 'spine-while-loading' });
  expect(result.window.kind === 'incomplete' ? result.window.openAtLeastMs ?? 0 : 0).toBeGreaterThan(0);
  expect(result.marks?.frameReadyState).toBe('loading');
});

/* Fails against a recorder that treats a page with no wall as a load with no window: it is a broken load, not a null. */
test('the recorder calls a page with no wall broken', async ({ page }) => {
  await page.addInitScript(RECORDER);
  await page.goto('/login');
  await page.waitForLoadState('load');
  expect(windowOf(await readMarks(page)).kind).toBe('broken');
});

/*
  **What a press does between interactive and hydration (the coordinator, 30
  Oct).** On production's cold/fast-3g that gap is 15s and the marks did not
  say whether React had attached. The cell that answers it is only worth its
  count if it can report each outcome, so each is staged here: fails against
  a press that cannot see `dropped`, and against an attach mark that reads
  the hold script's own listener as React's (`attached: false` with scripts held).
*/
test.describe('the press after interactive', () => {
  const arrive = async (page: Page) => {
    await login(page);
    const artist = await page.request.post('/api/artists', { data: { name: `Press-${Date.now().toString(36)}` } });
    const artistId = ((await artist.json()) as { id: string }).id;
    trackArtist(artistId);
    for (let i = 0; i < 4; i += 1) {
      const record = await page.request.post('/api/records', { data: { title: `Press ${i}`, artistId } });
      trackRecord(((await record.json()) as { id: string }).id);
    }
    await page.addInitScript(RECORDER);
    return `/?artistId=${artistId}`;
  };

  test('scripts held, React not attached: the anchor navigates', async ({ page }) => {
    const url = await arrive(page);
    await page.route('**/_next/static/chunks/**/*.js*', () => undefined);
    const press = await takePress(page, url, 30_000, { pressAfterMs: 300, settleMs: 5000 });
    expect(press).toMatchObject({ outcome: 'navigated', attached: false, hydrated: false });
    await expect(page).toHaveURL(/\/records\//);
  });

  test('React attached with its hydration held: the press hydrates the wall and pulls', async ({ page }) => {
    const url = await arrive(page);
    await holdScheduler(page);
    const press = await takePress(page, url, 30_000, { pressAfterMs: 300, settleMs: 5000 });
    expect(press).toMatchObject({ outcome: 'pulled', attached: true, hydrated: false });
  });

  /* Nothing in the app makes this state on demand: the click is swallowed, so what is staged is the instrument's reading of a press that did nothing. */
  test('a press that does nothing is reported as dropped', async ({ page }) => {
    const url = await arrive(page);
    await page.route('**/_next/static/chunks/**/*.js*', () => undefined);
    await page.addInitScript(() => { window.addEventListener('click', (event) => { event.preventDefault(); }, true); });
    const press = await takePress(page, url, 30_000, { pressAfterMs: 300, settleMs: 1500 });
    expect(press).toMatchObject({ outcome: 'dropped', attached: false, hydrated: false });
  });

  test('a wall hydrated before the press is reported as no gap, and nothing is pressed', async ({ page }) => {
    const url = await arrive(page);
    const press = await takePress(page, url, 30_000, { pressAfterMs: 3000, settleMs: 1000 });
    expect(press).toMatchObject({ outcome: 'no-gap', hydrated: true });
    expect(new URL(page.url()).pathname).toBe('/');
  });
});

/*
  The conditions the cause run names, made for real against a server of the
  spec's own, since the test environment has no covers. Fails against a warm-up
  blocked with route(), which turns the cache off, and against a cover in
  flight being missed because the load ended first.
*/
test.describe('the cover conditions', () => {
  let server: http.Server;
  let origin = '';
  test.beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<img src="/fast.jpg"><img src="/slow.jpg">'); return; }
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('Content-Type', 'image/gif');
      const gif = Buffer.from('R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==', 'base64');
      if (req.url === '/slow.jpg') setTimeout(() => res.end(gif), 800); else res.end(gif);
    });
    await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve); });
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  test.afterAll(() => { server.close(); });

  const isCover = (url: string) => url.endsWith('.jpg');

  /* The hidden grid's covers (the coordinator, 30 Oct): a plain img under display:none is fetched, and a lazy one is not. Fails if either stops being true. */
  test('a plain image under a hidden parent is fetched, and a lazy one is not', async ({ page }) => {
    const seen: string[] = [];
    page.on('request', (r) => { if (r.url().endsWith('.jpg')) seen.push(new URL(r.url()).pathname); });
    await page.route(`${origin}/hidden`, (route) => route.fulfill({ contentType: 'text/html', body: `<div style="display:none"><img src="${origin}/fast.jpg"><img loading="lazy" src="${origin}/slow.jpg"></div>` }));
    await page.goto(`${origin}/hidden`, { waitUntil: 'load' });
    await page.waitForTimeout(300);
    expect(seen).toEqual(['/fast.jpg']);
  });

  test('a full warm-up leaves every cover cached, and the condition holds', async ({ page, context }) => {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await page.goto(origin, { waitUntil: 'load' });
    const read = watchNetwork(cdp, isCover);
    await page.goto(origin, { waitUntil: 'load' });
    const summary = coverSummary(read(), { spineAt: 1, frameAt: 1, frameReadyState: 'loading', interactiveAt: 1, hydratedAt: 1 });
    expect(summary.covers).toBe(2);
    expect(conditionMade('fully-warm', summary)).toBe(true);
  });

  test('a warm-up with covers blocked leaves none cached, and a slow cover is counted in flight', async ({ page, context }) => {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setBlockedURLs', { urls: ['*.jpg'] });
    await page.goto(origin, { waitUntil: 'load' });
    await cdp.send('Network.setBlockedURLs', { urls: [] });
    const read = watchNetwork(cdp, isCover);
    await page.goto(origin, { waitUntil: 'commit' });
    await expect.poll(() => read().covers.length).toBe(2);
    await expect.poll(() => read().covers.filter((c) => c.endTs !== null).length).toBe(1);
    const summary = coverSummary(read(), { spineAt: 1, frameAt: 1, frameReadyState: 'loading', interactiveAt: 200, hydratedAt: 1 });
    expect(conditionMade('covers-cold', summary)).toBe(true);
    expect(summary.inFlightAtInteractive).toBe(1);
  });
});
