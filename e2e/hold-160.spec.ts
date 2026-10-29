import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist, trackRecord } from './cleanup';
import { holdDocumentTail, type DocumentTail } from './document-tail';
import { deliverPayload, holdHydration, holdScheduler, inTheWindow, releaseScheduler } from './hold-window';
import { login } from './sign-in';
import { HOLD_BOUND_MS } from '@/app/wall/hold-script';

/**
 * Step 160, §W.8 as ruled on 29 Oct ("Hold observed"): "A press on a spine
 * while the page is still loading is held, and applied as a pull when the
 * wall hydrates. ... Once the page has loaded, the press pulls and is not
 * held." The last press is held, a second spine replacing the first; any
 * other input cancels; past the bound the held press navigates as its anchor
 * would (the bound is provisional on whether the window occurs on
 * production).
 *
 * **Three instruments, one state each (29 Oct).** Each test names the state
 * it constructs, and the instrument is the one that constructs that state:
 *
 * - **Still loading, press held:** `holdDocumentTail` (`document-tail.ts`), a
 *   proxy that streams the document to the first payload chunk after the wall
 *   and holds the rest. The scripts load and readyState is `loading`: the
 *   state itself, with nothing of Next's reached into.
 * - **Loaded, React able to hydrate, press not held and pulled:**
 *   `holdScheduler`. The document is complete and React holds the payload;
 *   only its scheduled hydration waits, so a press hydrates the wall.
 * - **Parsed, Next's stream close held:** `holdHydration` then
 *   `deliverPayload`, for the condition's premise that "still loading" may end
 *   before Next's close. With the feed held and nothing delivered, the page
 *   is loaded while the wall cannot hydrate, a state no real page reaches
 *   (the payload arrives inside the document), where an unheld press is
 *   dropped; no test uses that state.
 *
 * **The instruments sit on a scale of reachability.** `holdHydration` with
 * nothing delivered makes a state production never reaches. `holdScheduler`
 * makes one it reaches on every load: the page complete and the wall not yet
 * hydrated (a production build, 29 Oct: interactive at 94ms, hydrated at
 * 148ms, cold). The proxy makes one whose reachability on production is
 * exactly the open question.
 *
 * **So a green test here is not evidence the state occurs.** As a TEST
 * INSTRUMENT the proxy constructs the still-loading state so the hold can be
 * asserted: green proves the hold works when the state occurs. As a
 * MEASUREMENT the same proxy would answer whether production infrastructure
 * ever reaches that state, and only that answer says whether the hold and
 * its bound are needed. The bound's Provisionals line waits on the
 * measurement, never on this spec. The measurement on production has not
 * run: it needs signed-in loads of the production wall (NOTES, 29 Oct 16:40).
 *
 * Every press before hydration here is on purpose, the one exception the
 * spine-click guard allows, marked on its line.
 */
registerCleanup();

async function seed(page: Page, count: number): Promise<{ artistId: string; ids: string[] }> {
  const artist = await page.request.post('/api/artists', { data: { name: `Hold-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}` } });
  const artistId = ((await artist.json()) as { id: string }).id;
  trackArtist(artistId);
  const ids: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const record = await page.request.post('/api/records', { data: { title: `Hold ${String(i).padStart(3, '0')}`, artistId } });
    expect(record.status()).toBe(201);
    const id = ((await record.json()) as { id: string }).id;
    trackRecord(id);
    ids.push(id);
  }
  return { artistId, ids };
}

const tails: DocumentTail[] = [];
test.afterEach(async () => { for (const t of tails.splice(0)) await t.close(); });

/** State: still loading. The wall's markup and the hold script read, the rest of the document held by the proxy. */
async function openLoading(page: Page, artistId: string): Promise<DocumentTail> {
  const base = test.info().project.use.baseURL;
  if (base === undefined) throw new Error('the hold spec needs the project baseURL');
  const tail = await holdDocumentTail(base);
  tails.push(tail);
  await page.goto(`${tail.origin}/?artistId=${artistId}`, { waitUntil: 'commit' });
  await expect(page.locator('[data-wall="labelled"]')).toBeVisible({ timeout: 30_000 });
  expect(tail.holding(), 'the proxy found the split after the wall and is holding the tail (document-tail.ts)').toBe(true);
  expect(await page.evaluate(() => document.readyState), 'the page is still loading').toBe('loading');
  return tail;
}

const spine = (page: Page, id: string) => page.locator(`a[data-seat="${id}"] [data-spine]`);
/* The wall's container carries the marks for both views. */
const region = (page: Page) => page.locator('[data-wall-container]').first();

test('a click while the page is loading is held, marks the region, prevents the anchor, and pulls when hydration lands', async ({ page }) => {
  await login(page);
  const { artistId, ids } = await seed(page, 12);
  const tail = await openLoading(page, artistId);
  await spine(page, ids[2]).click(); /* spine-click: before hydration, §W.8 */
  await expect(region(page)).toHaveAttribute('data-held', ids[2]);
  await page.waitForTimeout(300);
  expect(page.url(), 'the anchor did not navigate').toContain('/?artistId=');
  await expect(page.getByTestId('record-chrome')).toHaveCount(0);
  tail.release();
  await expect(region(page)).toHaveAttribute('data-hydrated', 'true', { timeout: 30_000 });
  await expect(page.getByTestId('record-chrome')).toBeVisible({ timeout: 5000 });
  await expect(page.locator(`[data-pulled="${ids[2]}"]`)).toBeAttached({ timeout: 5000 });
  await expect(region(page)).not.toHaveAttribute('data-held', /./);
  await expect(region(page), 'the held press started one pull').toHaveAttribute('data-pull-starts', '1');
});

test('Enter on a focused spine while the page is loading is held and pulls when hydration lands', async ({ page }) => {
  await login(page);
  const { artistId, ids } = await seed(page, 12);
  const tail = await openLoading(page, artistId);
  await page.locator(`a[data-seat="${ids[0]}"]`).focus();
  await page.keyboard.press('Enter'); /* spine-click: before hydration, §W.8 */
  await expect(region(page)).toHaveAttribute('data-held', ids[0]);
  tail.release();
  await expect(page.getByTestId('record-chrome')).toBeVisible({ timeout: 5000 });
  expect(page.url()).toContain('/?artistId=');
});

test('a press on a second spine replaces the first, and the second pulls', async ({ page }) => {
  await login(page);
  const { artistId, ids } = await seed(page, 12);
  const tail = await openLoading(page, artistId);
  await spine(page, ids[1]).click(); /* spine-click: before hydration, §W.8 */
  await spine(page, ids[4]).click(); /* spine-click: before hydration, §W.8 */
  await expect(region(page)).toHaveAttribute('data-held', ids[4]);
  tail.release();
  await expect(page.getByTestId('record-chrome')).toBeVisible({ timeout: 5000 });
  await expect(page.locator(`[data-pulled="${ids[4]}"]`)).toBeAttached({ timeout: 5000 });
  await expect(page.locator(`[data-pulled="${ids[1]}"]`)).toHaveCount(0);
});

for (const [name, cancel] of [
  ['a scroll', async (page: Page) => { await region(page).evaluate((el) => { el.scrollTop += 40; el.dispatchEvent(new Event('scroll', { bubbles: true })); }); }],
  ['a press off the spines', async (page: Page) => { await page.locator('body').click({ position: { x: 8, y: 8 } }); }],
  ['a key that moves focus', async (page: Page) => { await page.keyboard.press('Tab'); }],
  ['leaving the page', async (page: Page) => { await page.evaluate(() => window.dispatchEvent(new Event('pagehide'))); }],
] as const) {
  test(`${name} while the page is loading cancels the hold, and nothing pulls`, async ({ page }) => {
    await login(page);
    const { artistId, ids } = await seed(page, 12);
    const tail = await openLoading(page, artistId);
    await spine(page, ids[3]).click(); /* spine-click: before hydration, §W.8 */
    await expect(region(page)).toHaveAttribute('data-held', ids[3]);
    /* After the press's own moments: a scroll in its first 150ms is the browser's scroll-into-view for the click, not the reader's. */
    await page.waitForTimeout(250);
    await cancel(page);
    await expect(region(page)).not.toHaveAttribute('data-held', /./);
    tail.release();
    await expect(region(page)).toHaveAttribute('data-hydrated', 'true', { timeout: 30_000 });
    await page.waitForTimeout(800);
    await expect(page.getByTestId('record-chrome')).toHaveCount(0);
  });
}

test(`past the bound (${HOLD_BOUND_MS}ms) with the page still loading, the held press navigates as the anchor would`, async ({ page }) => {
  await login(page);
  const { artistId, ids } = await seed(page, 12);
  /* The tail is never released: the page stays loading past the bound. */
  await openLoading(page, artistId);
  await spine(page, ids[5]).click(); /* spine-click: before hydration, §W.8 */
  await expect(region(page)).toHaveAttribute('data-held', ids[5]);
  /* The record's page, reached by the anchor's own navigation; not built as a path, since this spec does not drive that screen. */
  await expect(page).toHaveURL(/\/records\/[0-9a-f-]{36}$/, { timeout: HOLD_BOUND_MS + 5000 });
  expect(page.url().endsWith(ids[5])).toBe(true);
});

/*
  State: loaded, React able to hydrate (holdScheduler). Once the page has loaded, the press pulls and is
  not held (§W.8, 29 Oct). With the Scheduler's channel
  held the document is complete and the wall unhydrated: React is attached and hydrates the wall on the
  press. Enter is the case the build before this condition held (traced 29 Oct: held on keydown, applied
  in hydration's own commit). Fails against that build: the held mark's history is [id, null], not [].
  One pull is counted as starts, since `begin` replaces the pull list and a record started twice still
  draws one pulled record.
*/
async function recordHeldMarks(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const seen: Array<string | null> = [];
    (window as unknown as { __heldMarks: Array<string | null> }).__heldMarks = seen;
    new MutationObserver((ms) => { for (const m of ms) seen.push((m.target as Element).getAttribute('data-held')); })
      .observe(document, { subtree: true, attributes: true, attributeFilter: ['data-held'] });
  });
}

test('Enter on an unhydrated wall whose page has loaded is not held, and React pulls it: one start', async ({ page }) => {
  await login(page);
  const { artistId, ids } = await seed(page, 12);
  await recordHeldMarks(page);
  await holdScheduler(page);
  await page.goto(`/?artistId=${artistId}`);
  await expect(page.locator('[data-wall="labelled"]')).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => (window as unknown as { __heldPosts?: number }).__heldPosts ?? 0), { timeout: 30_000 }).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.readyState), 'the page has loaded').toBe('complete');
  expect((await inTheWindow(page)).hydrated, 'the wall is not hydrated').toBe(false);
  await page.locator(`a[data-seat="${ids[6]}"]`).focus();
  await page.keyboard.press('Enter'); /* spine-click: before hydration, §W.8 */
  await releaseScheduler(page);
  await expect(page.getByTestId('record-chrome')).toBeVisible({ timeout: 5000 });
  const marks = await page.evaluate(() => (window as unknown as { __heldMarks: Array<string | null> }).__heldMarks);
  expect(marks, 'the hold never engaged').toEqual([]);
  await page.waitForTimeout(1800);
  await expect(page.getByTestId('record-chrome')).toHaveCount(1);
  await expect(page.locator(`[data-pulled="${ids[6]}"]`)).toHaveCount(1);
  await expect(region(page), 'one pull started').toHaveAttribute('data-pull-starts', '1');
  expect(page.url()).toContain('/?artistId=');
});

/*
  State: parsed, Next's stream close held (holdHydration, then deliverPayload). The condition's premise
  (29 Oct): "still loading" ends when the parser has read the last payload chunk,
  and Next closes its stream later, 50 to 600ms on the dev server. A press in that gap is not held, so
  the wall must be able to hydrate without the close. With the chunks fed to Next and its close held,
  the wall hydrates. Fails if Next ever requires the close before hydrating, which would leave that gap's
  presses dropped; the instrument is `holdHydration`, coupled to Next's internals as its file says.
*/
test('with the payload delivered and Next’s stream close held, the wall hydrates', async ({ page }) => {
  await login(page);
  const { artistId } = await seed(page, 12);
  await holdHydration(page);
  await page.goto(`/?artistId=${artistId}`);
  await expect(page.locator('[data-wall="labelled"]')).toBeVisible({ timeout: 30_000 });
  await expect.poll(async () => (await inTheWindow(page)).posted, { timeout: 30_000 }).toBeGreaterThan(0);
  expect((await inTheWindow(page)).hydrated, 'not hydrated while the payload is held').toBe(false);
  await deliverPayload(page);
  await expect(region(page)).toHaveAttribute('data-hydrated', 'true', { timeout: 5000 });
});

/*
  The regression the gate on 41cceaf found, asserted where it belongs (the coordinator, 28 Oct): on
  the hydrated far view a press is React's to apply, not the script's to hold. The hydrated mark had
  been set on one region's node at mount and the far view's region never carried it, so the script
  held a press React also handled and the zoom landed twice, which an arrival test noticed two steps
  downstream. Fails against a mark on a per-view node: `data-held` appears, and the landing count is 2.
*/
test('a press on the hydrated far view is not held, and its zoom lands exactly once', async ({ page }) => {
  await login(page);
  const { artistId } = await seed(page, 12);
  /* The far view as the arrival spec reaches it: the near view at the default width, hydrated, then the zoom out. */
  await page.goto(`/?artistId=${artistId}`);
  await expect(page.locator('[data-wall="labelled"]')).toBeVisible({ timeout: 30_000 });
  await expect(region(page)).toHaveAttribute('data-hydrated', 'true', { timeout: 30_000 });
  await page.getByTestId('wall-zoom-out').click();
  await expect(page.locator('[data-wall="overview"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-run]').first()).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => { (window as unknown as { __landings?: number }).__landings = 0; });
  await page.locator('[data-run]').first().click();
  await expect(page.locator('[data-wall="labelled"]')).toBeVisible({ timeout: 10_000 });
  await expect(region(page)).not.toHaveAttribute('data-held', /./);
  await page.waitForTimeout(900);
  expect(await page.evaluate(() => (window as unknown as { __landings?: number }).__landings), 'the landing is applied exactly once').toBe(1);
});
