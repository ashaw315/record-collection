import { expect, test } from '@playwright/test';
import { registerCleanup, trackArtist, trackRecord } from './cleanup';
import { holdDocumentTail, type DocumentTail } from './document-tail';
import { login } from './sign-in';
import { RECORDER, readMarks, takeLoad, windowOf } from '../scripts/window-measure';

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
