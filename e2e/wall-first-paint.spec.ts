import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import { wallMeasured } from './wall-measured';
import { nearViewMinWidth } from '../src/app/wall/view-fork';
import { login } from './sign-in';

registerCleanup();

/*
  **A 60-second budget, because the 30-second default did not fit this file
  on an IDLE machine.** Diagnosed in NOTES ("the E2E suite's flakes are a
  timeout budget, not contention"): the suite's four load failures all passed
  serially, which looked like contention, and was not. `record-navigation`'s
  put-back test measured 32.9s running entirely alone; `wall-first-paint`'s
  arrival-script test 23.5s. These specs drive the wall's real animation
  clocks — SWING 1300, OUT 1600, RETURN 861 — through several pulls per test,
  so their floor is high and any load pushed them over the default. Under
  load, which spec crossed first varied, so the failing set moved between
  runs and no single spec ever looked broken.

  Twice the measured worst, not `test.slow()`'s triple: enough headroom for
  a busy machine, not enough to hide a hang for minutes. Held by
  test/repo/wall-specs-declare-budget.test.ts. The fixed `waitForTimeout`
  sleeps in these files are the second half of the same task and are not
  touched here.
*/
test.describe.configure({ timeout: 60_000 });


/**
 * **The first paint is already the final view (§W.26, §W.29).**
 *
 * The server cannot measure a viewport, so which view exists was decided by
 * CSS at §W.26's fork width and the client's measurement only drove the
 * route's own state. When that gate was written the route opened far, and
 * §W.29 made near the default — so the pre-measurement paint became wrong
 * in the other direction: a far view appearing for ~200ms on every load and
 * then being replaced, which reads as a glitch.
 *
 * Sampled from BEFORE hydration, because that is the only place this is
 * visible: by the time a test can query the page, the swap has happened and
 * the settled state is correct.
 */
const suffix = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

const PROBE = `
window.__views = []; const t0 = performance.now();
(function sample() {
  const t = Math.round(performance.now() - t0);
  const shown = (q) => { const e = document.querySelector(q); return e !== null && getComputedStyle(e).display !== 'none'; };
  /* The drawing INSIDE the shown region — both regions exist while unmeasured, so a bare selector finds the hidden one's svg. */
  const region = shown('[data-region="near"]') ? '[data-region="near"]' : (shown('[data-region="far"]') ? '[data-region="far"]' : null);
  const svg = region ? document.querySelector(region + ' [data-wall]') : null;
  window.__views.push({ t, far: shown('[data-region="far"]'), near: shown('[data-region="near"]'), which: svg ? svg.getAttribute('data-wall') : null });
  if (t < 2500) requestAnimationFrame(sample);
})();
`;

async function seed(page: Page, count: number) {
  const artist = await page.request.post('/api/artists', { data: { name: `FP-${suffix()}` } });
  const artistId = (await artist.json()).id as string;
  trackArtist(artistId);
  for (let i = 0; i < count; i += 1) {
    const r = await page.request.post('/api/records', { data: { title: `FP ${String(i).padStart(3, '0')}`, artistId } });
    expect(r.status()).toBe(201);
  }
  return artistId;
}

type Frame = { t: number; far: boolean; near: boolean; which: string | null };

async function viewTimeline(page: Page): Promise<string[]> {
  const frames = (await page.evaluate(() => (window as unknown as { __views: Frame[] }).__views)) as Frame[];
  const drawn = frames.filter((f) => f.far || f.near);
  const changes: string[] = [];
  let prev = '';
  for (const f of drawn) {
    const key = `${f.far ? 'far' : ''}${f.near ? 'near' : ''}:${f.which}`;
    if (key !== prev) { changes.push(`${f.t}ms ${key}`); prev = key; }
  }
  return changes;
}

test('above the fork the first paint is the NEAR view and never changes to settle (§W.29)', async ({ page }) => {
  await login(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  const artistId = await seed(page, 17);
  await page.addInitScript(PROBE);
  await page.goto(`/?artistId=${artistId}`);
  await page.waitForTimeout(2600);
  const changes = await viewTimeline(page);
  expect(changes.length, `the view must not swap after the first paint: ${changes.join(' -> ')}`).toBe(1);
  expect(changes[0], 'and it is the near view from the start').toContain('near');
});

test('below the fork the first paint is the FAR view and never changes to settle (§W.24)', async ({ page }) => {
  await login(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const artistId = await seed(page, 17);
  await page.addInitScript(PROBE);
  await page.goto(`/?artistId=${artistId}`);
  await page.waitForTimeout(2600);
  const changes = await viewTimeline(page);
  expect(changes.length, `the view must not swap after the first paint: ${changes.join(' -> ')}`).toBe(1);
  expect(changes[0], 'and it is the far view from the start').toContain('far');
});

test('the fork is decided without measuring: no script at all still paints the right view either side of it', async ({ browser, page: signedIn }) => {
  await login(signedIn);
  const state = await signedIn.context().storageState();
  for (const [width, expected] of [[1440, 'near'], [390, 'far']] as const) {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width, height: 844 }, storageState: state });
    const page = await context.newPage();
    try {
      await page.goto('/');
      await expect(page.getByTestId('wall')).toBeAttached({ timeout: 30_000 });
      await expect(page.locator(`[data-region="${expected}"]`), `${width}px shows the ${expected} view`).toBeVisible();
      await expect(page.locator(`[data-region="${expected === 'near' ? 'far' : 'near'}"]`)).toBeHidden();
    } finally {
      await context.close();
    }
  }
});

/**
 * Samples the wall every frame from before hydration: the region's
 * visibility and the composition's PAINTED offset -- where the labelled
 * wall's box sits relative to the region's box. Not the scroll value: with
 * the arrival in the markup (§W.29) the region's scroll is 0 at first paint
 * and becomes the landing at hydration while nothing on screen moves, and a
 * scroll sampler would report a move that no reader sees.
 */
const SAMPLER = `
  window.__scrolls = []; const s0 = performance.now();
  (function sample() {
    const el = document.querySelector('[data-region="wall"]');
    const wall = document.querySelector('[data-wall="labelled"]');
    if (el && wall) {
      const r = el.getBoundingClientRect(); const w = wall.getBoundingClientRect();
      window.__scrolls.push({ t: Math.round(performance.now() - s0), v: getComputedStyle(el).visibility, l: Math.round(r.left - w.left), t2: Math.round(r.top - w.top) });
    }
    if (performance.now() - s0 < 6000) requestAnimationFrame(sample);
  })();
`;
type Sample = { t: number; v: string; l: number; t2: number };
const readSamples = (page: Page) => page.evaluate(() => (window as unknown as { __scrolls: Sample[] }).__scrolls) as Promise<Sample[]>;
const visiblePositions = (scrolls: Sample[]) => [...new Set(scrolls.filter((s) => s.v === 'visible').map((s) => `${s.l}/${s.t2}`))];

test('the arrival is already in position: the region’s scroll never moves after the first paint (§W.29)', async ({ page }) => {
  /*
    §W.22's eased pan belongs to the PULL, where the reader is watching a
    record move and the view follows it. On arrival there is nothing to
    follow: a wall that starts low and scrolls up into place — with the
    scrollbar travelling — reads as a page still loading, which is what
    prompted the question of whether it needed a spinner. It does not; it
    needs to be already there.

    Sampled every frame from before hydration, because the movement is over
    before a test can query the page.
  */
  await login(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  const artistId = await seed(page, 240);
  await page.addInitScript(SAMPLER);
  await page.goto(`/?artistId=${artistId}`);
  await page.waitForTimeout(2600);
  const scrolls = await readSamples(page);
  expect(scrolls.length, 'the region was sampled').toBeGreaterThan(5);
  /*
    **Positions while VISIBLE.** "After the first paint": a region that is
    hidden has not painted. The region ships hidden and the arrival script
    reveals it once the scroll is written, so on a slow stream the sampler
    sees hidden:0/0 for the script's latency and then visible:5/75 --
    measured at 200 kbps: 524ms hidden:0/0 -> 2299ms visible:5/75. Counting
    every scroll position, as this test first did, failed on exactly the
    frames the fix made invisible.
  */
  const positions = visiblePositions(scrolls);
  expect(positions.length, `the arrival must not move once painted: ${positions.join(' -> ')}`).toBe(1);
  expect(Number(positions[0].split('/')[1]), 'landed somewhere the fixture required').toBeGreaterThan(0);
});

/**
 * **§W.29 under a slow stream, made deterministic.** The full run reached
 * this condition only by accident -- a loaded dev server streaming slowly --
 * and reported `0/0 -> 5/75` for three runs before anyone read it. Here the
 * stream is throttled through CDP, so the frames between the region's
 * markup and its arrival script are guaranteed.
 *
 * Three things are asserted. The region is never visible at 0/0. Once
 * visible it does not move. And the blank -- the interval the region stays
 * hidden, which is what the fix converted the travelling wall into -- is
 * bounded: measured 1775ms (524 -> 2299) at 200 kbps on this fixture on 26
 * Sep, and the bound is that measurement plus fifteen percent for
 * run-to-run variance, not a round number. A test that only forbade a
 * visible 0/0 would pass six seconds of nothing.
 */
const THROTTLES_KBPS = [0, 200, 50] as const;
const MEASURED_BLANK_MS = 1775;
const BLANK_BOUND_MS = Math.round(MEASURED_BLANK_MS * 1.15);

test('at 50 kbps, 200 kbps and unthrottled the wall is visible and at the arrival in its first painted frame, and never moves (§W.29)', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'network throttling is a CDP capability');
  test.setTimeout(240_000);
  await login(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  const artistId = await seed(page, 240);
  for (const kbps of THROTTLES_KBPS) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 20, downloadThroughput: kbps === 0 ? -1 : (kbps * 1024) / 8, uploadThroughput: -1 });
    await page.addInitScript(SAMPLER);
    await page.goto(`/?artistId=${artistId}`);
    await page.waitForTimeout(kbps === 50 ? 12_000 : 6000);
    await cdp.detach();
    const scrolls = await readSamples(page);
    const label = kbps === 0 ? 'unthrottled' : `${kbps} kbps`;
    const timeline = scrolls.filter((s, i, arr) => i === 0 || s.v !== arr[i - 1].v || s.l !== arr[i - 1].l || s.t2 !== arr[i - 1].t2).map((s) => `${s.t}ms ${s.v}:${s.l}/${s.t2}`).join(' -> ');
    expect(scrolls.length, `${label}: the wall was sampled`).toBeGreaterThan(0);
    const first = scrolls[0];
    /* "Visible and at the arrival in the first painted frame": the first sample is visible, and its painted offset is the one the wall keeps. */
    expect(first.v, `${label}: visible in the first painted frame: ${timeline}`).toBe('visible');
    const positions = visiblePositions(scrolls);
    expect(positions.length, `${label}: once painted it does not move: ${timeline}`).toBe(1);
    expect(first.t2, `${label}: the first frame is at the arrival, below the fixture’s top corner`).toBeGreaterThan(0);
    const firstHidden = scrolls.find((s) => s.v === 'hidden');
    const firstVisible = scrolls.find((s) => s.v === 'visible');
    const blank = firstHidden === undefined || firstVisible === undefined ? 0 : firstVisible.t - firstHidden.t;
    console.log(`  §W.29 ${label}: first frame at ${first.t}ms ${first.v}:${first.l}/${first.t2}; blank ${blank}ms (bound ${BLANK_BOUND_MS}ms; a markup arrival measures zero)`);
    expect(blank, `${label}: the blank is bounded`).toBeLessThanOrEqual(BLANK_BOUND_MS);
  }
});

test('a client navigation to the shelf arrives in position too (§W.29)', async ({ page }) => {
  /*
    Two paths, two mechanisms. A DOCUMENT load is painted from the server's
    markup before any client script runs, so the arrival is written by an
    inline script at parse time. A CLIENT navigation has no server paint to
    be late for, and React never executes a component-rendered script on the
    client anyway — it warns when it finds one — so the arrival there is the
    landing effect's. Both must land, and neither may warn.
  */
  await login(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  const artistId = await seed(page, 240);

  await page.goto(`/?artistId=${artistId}&view=table`);
  await expect(page.locator('[data-collection-band]').getByRole('link', { name: 'Shelf', exact: true })).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => {
    (window as unknown as { __nav: Array<{ l: number; s: number }> }).__nav = [];
    const t0 = performance.now();
    (function sample() {
      const el = document.querySelector('[data-region="wall"]') as HTMLElement | null;
      if (el) (window as unknown as { __nav: Array<{ l: number; s: number }> }).__nav.push({ l: Math.round(el.scrollLeft), s: Math.round(el.scrollTop) });
      if (performance.now() - t0 < 2500) requestAnimationFrame(sample);
    })();
  });
  await page.locator('[data-collection-band]').getByRole('link', { name: 'Shelf', exact: true }).click();
  await expect(page.locator('[data-wall="labelled"]')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(2000);

  const frames = (await page.evaluate(() => (window as unknown as { __nav: Array<{ l: number; s: number }> }).__nav)) as Array<{ l: number; s: number }>;
  expect(frames.length, 'the region was sampled after the navigation').toBeGreaterThan(3);
  const positions = [...new Set(frames.map((f) => `${f.l}/${f.s}`))];
  expect(positions.length, `no movement after the shelf renders: ${positions.join(' -> ')}`).toBe(1);
  expect(Number(positions[0].split('/')[1]), 'and it is a real landing').toBeGreaterThan(0);

  /*
    **The console warning this does NOT assert away.** React logs "Scripts
    inside React components are never executed when rendering on the client"
    for the arrival tag. It fires ONCE, at hydration, and cannot be removed
    from a component: React warns on any script element it renders, however
    its content is set, and the tag already uses dangerouslySetInnerHTML.
    True and harmless — the tag's only job is the server's markup, and this
    test proves the client path lands anyway, through WallLive's landing
    effect.

    It used to fire on every return to rest, because the tag was rendered on
    every commit; it is now gone from the commit the viewport measurement
    triggers, which the test above pins. Two alternatives to the warning
    itself were built and rejected: rendering only on the server silences it
    and makes the server and client markup differ, which is a hydration
    mismatch — a real defect where the warning is dev-only noise — and
    emitting it from the document layout works but puts wall-specific code in
    the app shell.
  */
});

test('a client navigation lands without moving, and a put-back does not re-land (§W.29)', async ({ page }) => {
  /*
    The tag can only ever do work at parse time, so rendering it on every
    later commit is noise: React logs its script warning each time the wall
    returns to rest. It stays for the first client render — hydration must
    match the server's HTML — and is dropped once mounted.
  */
  const warnings: string[] = [];
  page.on('console', (m) => { if (/Scripts inside React components/i.test(m.text())) warnings.push(m.text()); });
  await login(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  const artistId = await seed(page, 240);
  await page.goto(`/?artistId=${artistId}`);
  await expect(page.locator('[data-wall="labelled"]')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(900);
  const afterLoad = warnings.length;
  expect(afterLoad, 'at most one warning at hydration').toBeLessThanOrEqual(1);

  /*
    **The spine is brought into view before the starting position is read.**
    The first spine's foot is below the window (754 to 915 in a 900 window),
    and Playwright's click scrolls its target into view when it judges that
    necessary, which it did on a slow machine and not on a quick one. That
    scroll is a reader's scroll: the wall moved 15 at rest, the pull began
    from there, and put back returned there, correctly. This test had read
    its starting position before the click and so reported the page 16 out
    (the gate of 8 Oct). Staged with the CPU throttled six times: 75, then
    90 at rest before the swing, and 90 after put back; with the click
    dispatched and nothing scrolled, 75 and 75. The page retraces to where
    the pull began, which is the claim, so the test now reads where that is.
  */
  /*
    And the wall has measured and landed before anything is read. Staging
    the fix above with the CPU throttled showed a second read made too
    early: the wall being visible is true of the server's markup, at 0,0,
    and the fixed 900 was not long enough for the landing on a slow machine.
  */
  await wallMeasured(page);
  const spine = page.locator('a[data-seat] [data-spine]').first();
  await spine.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const before = await page.evaluate(() => { const el = document.querySelector('[data-region="wall"]') as HTMLElement; return { l: Math.round(el.scrollLeft), t: Math.round(el.scrollTop) }; });

  /* Pull and put back: the wall returns to rest, which is where the warning was repeating. */
  await spine.click();
  /* And nothing moved it between the reading and the pull: the click found its target where the reading left it. */
  await expect(page.getByTestId('record-chrome')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Put back' }).click();
  await expect(page.getByTestId('record-chrome')).toHaveCount(0, { timeout: 10_000 });
  await page.waitForTimeout(1400);

  expect(warnings.length, 'no further warnings once mounted').toBe(afterLoad);
  /* And the scroll is where it was: put back retraces the pan (§W.22). */
  const after = await page.evaluate(() => { const el = document.querySelector('[data-region="wall"]') as HTMLElement; return { l: Math.round(el.scrollLeft), t: Math.round(el.scrollTop) }; });
  expect(Math.abs(after.l - before.l), 'scrollLeft unchanged').toBeLessThanOrEqual(2);
  expect(Math.abs(after.t - before.t), 'scrollTop unchanged').toBeLessThanOrEqual(2);
});

test('the fork’s width is one constant, shared by the media query and the measurement', async () => {
  expect(nearViewMinWidth()).toBeGreaterThan(1000);
});
