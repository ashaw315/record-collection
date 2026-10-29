import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist, trackRecord } from './cleanup';
import { holdHydration, holdScheduler, inTheWindow, releaseHydration, releaseScheduler } from './hold-window';
import { login } from './sign-in';
import { HOLD_BOUND_MS } from '@/app/wall/hold-script';

/**
 * Step 160, §W.8 (Design, 28 Oct): "A press on a spine before the wall has
 * hydrated is held, and applied as a pull when it hydrates. ... Only the
 * last press on a spine is held, a keyboard Enter on a spine as well as a
 * click: a press on a second spine replaces the first, and the second pulls.
 * Any other input before hydration lands cancels the hold, such as a scroll,
 * a press anywhere off the spines or leaving the page, so a record never
 * pulls after the reader has moved on. If hydration has not landed within a
 * bound, the held press navigates as the anchor would, so the fallback is
 * never lost to a script that fails. ... The far view's run is a button and
 * has no anchor, so its press is held the same way."
 *
 * The window is held open by `hold-window.ts`, which holds the page's server
 * payload from an init script, so React is attached and cannot hydrate the
 * wall on a press; its coupling to Next is written there. Every click here is inside the
 * window on purpose, the one exception the spine-click guard allows, marked
 * on its line. Fails against the build before the hold: with the window
 * held, a press is dropped by React and nothing pulls after release.
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

/** The wall's markup visible and the window open: React attached, nothing hydrated. */
async function openWindow(page: Page, artistId: string): Promise<void> {
  await page.goto(`/?artistId=${artistId}`);
  await expect(page.locator('[data-wall="labelled"]')).toBeVisible({ timeout: 30_000 });
  await expect.poll(async () => (await inTheWindow(page)).posted, { timeout: 30_000, message: 'React has posted to the held channel' }).toBeGreaterThan(0);
  expect((await inTheWindow(page)).hydrated, 'not in the window: the wall hydrated while the payload was held, which is the instrument (hold-window.ts, its coupling to Next) and not the hold').toBe(false);
}

const spine = (page: Page, id: string) => page.locator(`a[data-seat="${id}"] [data-spine]`);
/* The wall's container carries the marks for both views. */
const region = (page: Page) => page.locator('[data-wall-container]').first();

test('a click in the window is held, marks the region, prevents the anchor, and pulls when hydration lands', async ({ page }) => {
  await login(page);
  const { artistId, ids } = await seed(page, 12);
  await holdHydration(page);
  await openWindow(page, artistId);
  await spine(page, ids[2]).click(); /* spine-click: before hydration, §W.8 */
  await expect(region(page)).toHaveAttribute('data-held', ids[2]);
  await page.waitForTimeout(300);
  expect(page.url(), 'the anchor did not navigate').toContain('/?artistId=');
  await expect(page.getByTestId('record-chrome')).toHaveCount(0);
  await releaseHydration(page);
  await expect(region(page)).toHaveAttribute('data-hydrated', 'true', { timeout: 30_000 });
  await expect(page.getByTestId('record-chrome')).toBeVisible({ timeout: 5000 });
  await expect(page.locator(`[data-pulled="${ids[2]}"]`)).toBeAttached({ timeout: 5000 });
  await expect(region(page)).not.toHaveAttribute('data-held', /./);
});

test('Enter on a focused spine in the window is held and pulls when hydration lands', async ({ page }) => {
  await login(page);
  const { artistId, ids } = await seed(page, 12);
  await holdHydration(page);
  await openWindow(page, artistId);
  await page.locator(`a[data-seat="${ids[0]}"]`).focus();
  await page.keyboard.press('Enter'); /* spine-click: before hydration, §W.8 */
  await expect(region(page)).toHaveAttribute('data-held', ids[0]);
  await releaseHydration(page);
  await expect(page.getByTestId('record-chrome')).toBeVisible({ timeout: 5000 });
  expect(page.url()).toContain('/?artistId=');
});

test('a press on a second spine replaces the first, and the second pulls', async ({ page }) => {
  await login(page);
  const { artistId, ids } = await seed(page, 12);
  await holdHydration(page);
  await openWindow(page, artistId);
  await spine(page, ids[1]).click(); /* spine-click: before hydration, §W.8 */
  await spine(page, ids[4]).click(); /* spine-click: before hydration, §W.8 */
  await expect(region(page)).toHaveAttribute('data-held', ids[4]);
  await releaseHydration(page);
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
  test(`${name} before hydration lands cancels the hold, and nothing pulls`, async ({ page }) => {
    await login(page);
    const { artistId, ids } = await seed(page, 12);
    await holdHydration(page);
    await openWindow(page, artistId);
    await spine(page, ids[3]).click(); /* spine-click: before hydration, §W.8 */
    await expect(region(page)).toHaveAttribute('data-held', ids[3]);
    /* After the press's own moments: a scroll in its first 150ms is the browser's scroll-into-view for the click, not the reader's. */
    await page.waitForTimeout(250);
    await cancel(page);
    await expect(region(page)).not.toHaveAttribute('data-held', /./);
    await releaseHydration(page);
    await expect(region(page)).toHaveAttribute('data-hydrated', 'true', { timeout: 30_000 });
    await page.waitForTimeout(800);
    await expect(page.getByTestId('record-chrome')).toHaveCount(0);
  });
}

test(`past the bound (${HOLD_BOUND_MS}ms) with hydration not landed, the held press navigates as the anchor would`, async ({ page }) => {
  await login(page);
  const { artistId, ids } = await seed(page, 12);
  await holdHydration(page);
  await openWindow(page, artistId);
  await spine(page, ids[5]).click(); /* spine-click: before hydration, §W.8 */
  await expect(region(page)).toHaveAttribute('data-held', ids[5]);
  /* The record's page, reached by the anchor's own navigation; not built as a path, since this spec does not drive that screen. */
  await expect(page).toHaveURL(/\/records\/[0-9a-f-]{36}$/, { timeout: HOLD_BOUND_MS + 5000 });
  expect(page.url().endsWith(ids[5])).toBe(true);
});

/*
  The cost of the hold engaging where React would have coped (the coordinator, 29 Oct). With only the
  Scheduler's channel held, React is attached and hydrates synchronously on a discrete event. A click's
  pointerdown hydrates the wall before the click arrives, so the script finds it hydrated and never holds
  (traced 29 Oct: hydrated at pointerdown + 141ms, click 2ms later, no data-held). Enter is the one press
  the hold takes in this state: the script holds on keydown and prevents the anchor's activation, React
  hydrates off the same keydown, and its first commit applies the hold and clears the mark, in that one
  task (traced: held at 561ms, hydrated and cleared at 706ms). The cost, asserted: the hold engaged, and
  the record pulls once, with no navigation and no second chrome. The mark's history is recorded because
  the hold is applied and cleared before any assertion could look at the region.

  What fails it, staged 29 Oct: the consume effect in WallLive ignoring the hold (no chrome: in this state
  an Enter the hold does not apply is dropped). What does not: removing the keydown's preventDefault, the
  hold's second-pull refusal, or both at once, all still one pull. So the one-pull count is the cost as
  observed, and no line has been identified that it fails against.
*/
async function recordHeldMarks(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const seen: Array<string | null> = [];
    (window as unknown as { __heldMarks: Array<string | null> }).__heldMarks = seen;
    new MutationObserver((ms) => { for (const m of ms) seen.push((m.target as Element).getAttribute('data-held')); })
      .observe(document, { subtree: true, attributes: true, attributeFilter: ['data-held'] });
  });
}

test('where React hydrates on the press itself, Enter is still held and applied, and the record pulls once', async ({ page }) => {
  await login(page);
  const { artistId, ids } = await seed(page, 12);
  await recordHeldMarks(page);
  await holdScheduler(page);
  await page.goto(`/?artistId=${artistId}`);
  await expect(page.locator('[data-wall="labelled"]')).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => (window as unknown as { __heldPosts?: number }).__heldPosts ?? 0), { timeout: 30_000 }).toBeGreaterThan(0);
  expect((await inTheWindow(page)).hydrated, 'React attached, nothing hydrated').toBe(false);
  await page.locator(`a[data-seat="${ids[6]}"]`).focus();
  await page.keyboard.press('Enter'); /* spine-click: before hydration, §W.8 */
  await releaseScheduler(page);
  await expect(page.getByTestId('record-chrome')).toBeVisible({ timeout: 5000 });
  const marks = await page.evaluate(() => (window as unknown as { __heldMarks: Array<string | null> }).__heldMarks);
  expect(marks, 'the hold engaged on the seat pressed, and was cleared when applied').toEqual([ids[6], null]);
  await page.waitForTimeout(1800);
  await expect(page.getByTestId('record-chrome')).toHaveCount(1);
  await expect(page.locator('[data-pulled]')).toHaveCount(1);
  await expect(page.locator(`[data-pulled="${ids[6]}"]`)).toHaveCount(1);
  expect(page.url()).toContain('/?artistId=');
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

/*
  No subject before hydration (28 Oct): the far view's run is drawn as a button only once the
  wall is measured on the client (`WallStage` passes the overview `onSeatClick={onZoomIn}`, which
  is undefined until `viewport > 0`), so the server's markup carries no `[data-run]` and a press
  in the window lands on nothing. §W.8's hold for the run has nothing to hold; for Design, whether
  the run is a button in the markup. The script's run branch stands ready for it.
*/
test.fixme('a press on the far view’s run in the window is held and zooms to that shelf when hydration lands', async ({ page }) => {
  await login(page);
  const { artistId } = await seed(page, 12);
  await holdHydration(page);
  /* The far view is what the shelf route draws from 1044 to §W.26's fork at 1274 (step 134); below 1044 the route draws the grid. 1100 shows the far view, with its runs, from the first paint. */
  await page.setViewportSize({ width: 1100, height: 844 });
  await page.goto(`/?artistId=${artistId}`);
  await expect(page.locator('[data-wall="overview"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-run]').first()).toBeVisible({ timeout: 30_000 });
  await expect.poll(async () => (await inTheWindow(page)).posted, { timeout: 30_000 }).toBeGreaterThan(0);
  await page.locator('[data-run]').first().click();
  await expect(region(page)).toHaveAttribute('data-held', /./);
  await releaseHydration(page);
  await expect(page.locator('[data-wall="labelled"]')).toBeVisible({ timeout: 10_000 });
});
