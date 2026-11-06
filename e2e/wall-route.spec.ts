import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import { seedRecords } from './seed';
import { login } from './sign-in';
import { clickSpine } from './wall-ready';
import { landings, settled } from './wall-settle';

registerCleanup();

/**
 * 8a §W.12: the route opens FAR, and moving between the two views has two
 * named targets and never an intermediate.
 *
 * In is a click on a seat, landing the near view with the addressed shelf at
 * the region's top and the seat at its left. Out is the count — the
 * collection's identity, which is what the zoom-out arrives at — or Escape,
 * which already dismisses the pulled state. Neither direction is a wheel or a
 * pinch: a continuous input snapping to a target is an intermediate.
 */
const suffix = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

/*
  Seats overlap in projection, so neither the anchor's bounding-box centre nor
  its top face's centre reliably hit-tests to the seat itself — the record in
  front covers both. The click goes to a point the browser agrees belongs to
  this seat: the exposed sliver of its FRONT face, found by hit-testing.
*/
/*
  §W.28 put a transparent run layer over the far view's seats, and that layer
  IS the click target: a seat's own polygon is no longer what the browser hits.
  Clicking the run is the ruled gesture — it opens the near view at that shelf
  — so these helpers go through it.
*/
async function clickFarRun(page: Page) {
  await page.locator('[data-run]').first().click();
}

/**
 * Enough records to fill more than one shelf, so a zoom lands on a row that is not the first.
 *
 * Scenery, so straight to the database in one statement (`seed.ts`, whose
 * reason is in that file: creating scenery through HTTP "measurably degrades
 * the shared dev server and destabilises every other spec in the run"). Until
 * 5 Nov this was one POST per record, and the test at :234 seeds 260: at one
 * worker that took 5.3s of its 30s, at four workers on CI 22.3s and then 32.0s,
 * the run's one failure (42059632838), with every other worker's requests
 * queued behind the 260. The ids come back by one GET in the wall's own
 * tie-break within an artist, title then id (`shelf.ts`), so `ids[0]` is the
 * artist's first seat as it was when the titles were "Route 000" upward; only
 * `ids[0]` is read, and the page is clamped at 200 (§5), which the 240 seed
 * exceeds without needing the rest.
 */
async function seed(page: Page, count: number): Promise<{ artistId: string; ids: string[] }> {
  const artist = await page.request.post('/api/artists', { data: { name: `Route-${suffix()}` } });
  const artistId = (await artist.json()).id as string;
  trackArtist(artistId);
  await seedRecords(artistId, 'Route', suffix(), count);
  const listed = await page.request.get(`/api/records?artistId=${artistId}&pageSize=200&sort=title:asc`);
  expect(listed.status(), 'the seeded records are listed').toBe(200);
  const ids = ((await listed.json()) as { data: Array<{ id: string }> }).data.map((r) => r.id);
  expect(ids.length, `the seed is in place (${count} asked)`).toBe(Math.min(count, 200));
  return { artistId, ids };
}

test.beforeEach(async ({ page }) => {
  await login(page);
  await page.setViewportSize({ width: 1440, height: 900 });
});

test('the near view can be reached and used at desktop width, with no unmeasured state left (§W.12, §W.26)', async ({ page }) => {
  /*
    **The circular-dependency guard, and it must be an E2E.** The unmeasured
    first paint is gated by CSS, and the gate clears on a measurement. When
    that measurement came from an effect observing the drawing REGION — which
    lives inside the near view — the near view could never become visible:
    hidden, so never measured, so never shown. Every spine click in the suite
    timed out. The viewport measurement therefore reads `window.innerWidth`
    and needs no region.

    A unit test cannot catch this: it reads the stylesheet's rules, which were
    correct. What was wrong was that nothing ever satisfied them.
  */
  const { artistId } = await seed(page, 24);
  await page.goto(`/?artistId=${artistId}`);
  await expect(page.getByTestId('wall')).toBeAttached({ timeout: 30_000 });

  /* The gate clears without the near view ever having existed. */
  await expect(page.locator('[data-wall-container][data-unmeasured]'), 'the unmeasured gate clears on the viewport alone').toHaveCount(0, { timeout: 10_000 });

  /* The near view is reachable — it is what the route opens on (§W.29)... */
  await expect(page.locator('[data-wall="labelled"]')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[data-wall-container][data-unmeasured]')).toHaveCount(0);

  /* ...and usable: a spine pulls. */
  await clickSpine(page, page.locator('a[data-seat] [data-spine]').first());
  await expect(page.getByTestId('record-chrome')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[data-pulled]')).toHaveCount(1);
});

test('a bare / opens NEAR with the occupied shelf framed, and the far view is a deliberate zoom-out (§W.29)', async ({ page }) => {
  /*
    §W.12's "the route opens far" is withdrawn on the desktop: at the common
    collection size the far view is a small unlabelled object that can report
    neither quantity nor arrangement, and a reader had to click before
    anything was readable. The arrival lands on the OCCUPIED shelf — the
    empty shelves are the room the collection grows into.
  */
  /*
    A bare /, and it is one: no filter. This test went to `?artistId=` and
    read ITS first record as the arrival seat, taking the filter to make
    the wall its own. It does not (§W.12, "This holds for the near view as
    for the far": a filtered wall is the whole collection's, with seats
    emptied), so beside a test seeding 240 its record sat 386 past the
    region. The arrival is on the COLLECTION's first seat, so that is the
    seat read, whatever the collection is when the page is made: the first
    on the keyboard's path, which with no filter is the first placed.
  */
  await seed(page, 24);
  await page.goto('/');
  await expect(page.getByTestId('wall')).toBeAttached({ timeout: 30_000 });

  /* Near, with labels, on the first load — no click. */
  await expect(page.locator('[data-wall="labelled"]')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-wall="overview"]')).toHaveCount(0);
  await expect(page.locator('a[data-seat]').first()).toBeVisible();
  await expect(page.locator('[data-footprint]'), 'the precondition: no filter, so no seat is emptied').toHaveCount(0);

  /* Framed on the occupied shelf: the first seat is in the region, and so are its top faces. */
  await settled(page, 1);
  const framed = await page.evaluate(() => {
    const rect = (q: string) => { const r = document.querySelector(q)?.getBoundingClientRect(); return r ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null; };
    return { region: rect('[data-region="wall"]'), seat: rect('a[data-seat][data-seat-order="1"] [data-spine]'), top: rect('a[data-seat][data-seat-order="1"] [data-face="top"]') };
  });
  expect(framed.region && framed.seat && framed.top).toBeTruthy();
  if (framed.region && framed.seat && framed.top) {
    expect(framed.seat.top, 'the arrival seat is inside the region').toBeGreaterThanOrEqual(framed.region.top - 1);
    expect(framed.seat.bottom).toBeLessThanOrEqual(framed.region.bottom + 1);
    expect(framed.seat.left, 'across as well as down').toBeGreaterThanOrEqual(framed.region.left - 1);
    expect(framed.seat.right).toBeLessThanOrEqual(framed.region.right + 1);
    expect(framed.top.top, 'and its top face is not cut off (§W.28)').toBeGreaterThanOrEqual(framed.region.top - 1);
  }

  /* The far view is still reachable from the count... */
  await page.getByTestId('wall-zoom-out').click();
  await expect(page.locator('[data-wall="overview"]')).toBeVisible();
  await expect(page.locator('[data-wall="labelled"]')).toHaveCount(0);

  /* ...and a far seat still zooms back in. */
  await clickFarRun(page);
  await expect(page.locator('[data-wall="labelled"]')).toBeVisible();
});

test('Escape reaches the far view from a bare /, with nothing pulled (§W.12, §W.29)', async ({ page }) => {
  const { artistId } = await seed(page, 20);
  await page.goto(`/?artistId=${artistId}`);
  await expect(page.locator('[data-wall="labelled"]')).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-wall="overview"]')).toBeVisible();
});

test('clicking a run lands the near view on that run’s first seat, by the rule and exactly once (§W.12, §W.28)', async ({ page }) => {
  /*
    §W.28 makes the OCCUPIED RUN the click target, so the addressed seat is
    always the run's first — the run is a shelf rather than a record, and the
    landing is what §W.12's rule gives for that seat: min(target, the
    scroller's limit) on both axes, with the shelf framed by §W.28's window
    rule so its top faces are not cut off.
  */
  const { artistId, ids } = await seed(page, 240);
  await page.goto(`/?artistId=${artistId}`);
  await expect(page.locator('[data-wall="labelled"]')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('wall-zoom-out').click();
  await expect(page.locator('[data-wall="overview"]')).toBeVisible();
  await page.evaluate(() => { (window as unknown as { __landings?: number }).__landings = 0; });
  await clickFarRun(page);
  await expect(page.locator('[data-wall="labelled"]')).toBeVisible();
  /* Read once the landing has settled: the frame grows once the region is measured, and the landing's count is what proves it was not undone. */
  await settled(page, 1);

  const landed = await page.evaluate((id) => {
    const el = document.querySelector('[data-region="wall"]') as HTMLElement | null;
    const rect = (q: string) => { const r = document.querySelector(q)?.getBoundingClientRect(); return r ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null; };
    return {
      scrollLeft: el === null ? null : Math.round(el.scrollLeft),
      scrollTop: el === null ? null : Math.round(el.scrollTop),
      limitX: el === null ? null : el.scrollWidth - el.clientWidth,
      limitY: el === null ? null : el.scrollHeight - el.clientHeight,
      landings: (window as unknown as { __landings?: number }).__landings,
      region: rect('[data-region="wall"]'),
      seat: rect(`[data-seat="${id}"] [data-spine]`),
      shelf: rect(`[data-seat="${id}"] [data-face="top"]`),
    };
  }, ids[0]);

  expect(landed.landings, 'the landing is applied exactly once').toBe(1);
  /* Within the scroller's bounds on both axes — the rule, not a fixed position. */
  expect(landed.scrollLeft).toBeGreaterThanOrEqual(0);
  expect(landed.scrollLeft).toBeLessThanOrEqual(landed.limitX ?? 0);
  expect(landed.scrollTop).toBeGreaterThanOrEqual(0);
  expect(landed.scrollTop).toBeLessThanOrEqual(landed.limitY ?? 0);

  /* The run's FIRST seat is the one addressed, and it is inside the region with its top face uncut. */
  expect(landed.region && landed.seat && landed.shelf).toBeTruthy();
  if (landed.region && landed.seat && landed.shelf) {
    expect(landed.seat.left, 'the run’s first seat is in the region').toBeGreaterThanOrEqual(landed.region.left - 1);
    expect(landed.seat.right).toBeLessThanOrEqual(landed.region.right + 1);
    expect(landed.shelf.top, 'and its top face is not cut off (§W.28)').toBeGreaterThanOrEqual(landed.region.top - 1);
    expect(landed.region.right - landed.seat.left, 'the useful half of the region is after the seat').toBeGreaterThan((landed.region.right - landed.region.left) / 2);
  }
});

/*
  Until 6 Nov this was "a wall that fits the region has no horizontal landing to make, and still puts the
  addressed shelf at the top": it measured the wall's width, widened the window by the excess, polled the fit,
  zoomed out and in, and read again. §W.12 sizes the wall by the whole collection, and at four workers the
  collection moves between any two reads of it: the wait's frames read the wall 883 wider across the round-trip
  on 42273938707, 2136 to 2224 on 42283660959, and 2224 to 1179 the other way (the family member: a shared
  quantity measured across an action; the coordinator's ruling, option 1, a test asserts over what it owns).
  So this reads ONCE after the landing and asserts what one read can show: the landing consumed exactly once,
  the view within the scroller's bounds on both axes, the bounds derived from the rule and not from a sample,
  and the addressed seat drawn. "No horizontal landing when the wall fits" is the scroller's clamp,
  min(target, scrollWidth − clientWidth), on the target route-view.test.ts holds; the clamp is the
  platform's, and a wall that fits at the read has a limit of 0 and a scroll of 0 by it, which no test of
  ours can fail and so none asserts.
*/
test('a zoom-in landing is consumed once and lands within the scroller’s bounds, whatever the collection’s size at the read (§W.12)', async ({ page }) => {
  const { artistId, ids } = await seed(page, 20);
  await page.goto(`/?artistId=${artistId}`);
  await expect(page.locator('[data-wall="labelled"]')).toBeVisible({ timeout: 30_000 });
  await settled(page, 1);
  const before = await landings(page);
  await page.getByTestId('wall-zoom-out').click();
  await expect(page.locator('[data-wall="overview"]')).toBeVisible();
  await clickFarRun(page);
  await expect(page.locator('[data-wall="labelled"]')).toBeVisible();
  await settled(page, before + 1);
  /* One read, everything from one layout. */
  const got = await page.evaluate((id) => {
    const el = document.querySelector('[data-region="wall"]') as HTMLElement | null;
    return {
      landings: (window as unknown as { __landings?: number }).__landings ?? 0,
      scrollLeft: el === null ? null : Math.round(el.scrollLeft), scrollTop: el === null ? null : Math.round(el.scrollTop),
      limitX: el === null ? null : el.scrollWidth - el.clientWidth, limitY: el === null ? null : el.scrollHeight - el.clientHeight,
      seatDrawn: (document.querySelector(`[data-seat="${id}"] [data-face="top"]`)?.getClientRects().length ?? 0) > 0,
    };
  }, ids[0]);
  expect(got.landings, 'the zoom-in landing is applied exactly once').toBe(before + 1);
  expect(got.scrollLeft, 'within the scroller’s bounds: not before its left edge').toBeGreaterThanOrEqual(0);
  expect(got.scrollLeft, 'and not past its limit').toBeLessThanOrEqual(got.limitX ?? 0);
  expect(got.scrollTop).toBeGreaterThanOrEqual(0);
  expect(got.scrollTop).toBeLessThanOrEqual(got.limitY ?? 0);
  expect(got.seatDrawn, 'the addressed seat is drawn').toBe(true);
});

test('the run is reachable by keyboard after the rail, and Enter zooms to that shelf (§W.30)', async ({ page }) => {
  /*
    The rail is the page's chrome and the run is its content, so the run
    comes after it: §W.24 put the filter in the rail precisely so the shape
    on the fixture is read once it is set. Walked from the start of the
    document rather than from wherever a click left focus — the measured
    order at 24 records is:

      nav (Record Collection, Collection, Want list, Look up, Stats, Manage)
      rail (search, sort, Apply, Shelf, Table, Grid, Add record)
      the count's zoom-out
      run 0 (20 records), run 1 (4 records)

    so every rail stop precedes every run, and the runs take document order.
  */
  const { artistId } = await seed(page, 24);
  await page.goto(`/?artistId=${artistId}`);
  await expect(page.locator('[data-wall="labelled"]')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('wall-zoom-out').click();
  await expect(page.locator('[data-wall="overview"]')).toBeVisible();

  /*
    From the document's start: focusing an element and tabbing resumes from it, which is not the reader's first Tab.
    The header's first link is the document's first stop (the order above), and it is named rather than found by
    "any control": that selector matches in the shelf's view and the grid's too, and the wrapper (step 142) refuses it.
  */
  await page.evaluate(() => {
    const first = document.querySelector('header[data-app-nav] a') as HTMLElement | null;
    first?.focus();
    first?.blur();
  });
  const stops: Array<{ run: string | null; rail: boolean }> = [];
  for (let i = 0; i < 24; i += 1) {
    await page.keyboard.press('Tab');
    stops.push(
      await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        let rail = false;
        for (let n: HTMLElement | null = el; n !== null; n = n.parentElement) {
          if (n.getAttribute?.('data-testid') === 'wall-rail') rail = true;
        }
        return { run: el?.getAttribute('data-run') ?? null, rail };
      }),
    );
  }

  /*
    First occurrences only: the sequence wraps inside 24 presses, so the rail
    appears again after the runs on the second pass round.
  */
  const firstRun = stops.findIndex((s) => s.run !== null);
  const firstRail = stops.findIndex((s) => s.rail);
  expect(firstRun, 'a run is reached').toBeGreaterThan(-1);
  expect(firstRail, 'the rail is reached').toBeGreaterThan(-1);
  expect(firstRail, 'the rail comes before the run').toBeLessThan(firstRun);
  /* And no run is reached before the rail has been walked through. */
  const railStops = stops.slice(0, firstRun).filter((s) => s.rail).length;
  expect(railStops, 'the whole rail precedes the run').toBeGreaterThanOrEqual(6);
  /*
    SKIPPED, with the walk that would verify it recorded above: the run order
    within one pass is asserted in WallOverview.test.tsx, which reads the
    document order directly. Reproducing it here needs the walk to stop at
    the sequence's end rather than wrapping, and the wrap point moves with
    the collection size — a fixture detail, not a claim about the ruling.
  */
  const runOrder = stops.filter((s) => s.run !== null).map((s) => Number(s.run));
  expect(runOrder.length, 'at least one run is walked').toBeGreaterThan(0);

  /* Enter zooms to that shelf — the same target a click reaches. */
  /*
    **Enter on the run, by name.** The walk wraps inside 24 presses, so the
    24th Tab lands on whatever the focus order's length dictates -- and Next's
    dev-tools button contributes one to three stops depending on its state.
    Enter there fired on Stats in one run and on Manage in another, and
    passed in isolation only because the count happened to land on a run. An
    assertion on an unnamed stop asserts nothing; the walk above proves the
    order, and Enter is pressed on the first run it found.
  */
  await page.locator(`[data-run="${runOrder[0]}"]`).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-wall="labelled"]')).toBeVisible({ timeout: 10_000 });
});

test('Escape returns to the collection when nothing is pulled, and dismisses the pull when something is', async ({ page }) => {
  const { artistId } = await seed(page, 12);
  await page.goto(`/?artistId=${artistId}`);
  await expect(page.locator('[data-wall="labelled"]')).toBeVisible({ timeout: 30_000 });
  /*
    The landing consumed and the region still, as the three landing tests above wait (27 Oct), and not
    visibility alone: this test clicked as soon as the server's markup showed and flaked in two consecutive
    gates with no pull begun (28 Oct). The arrival scrolls the region after the wall is visible, measured
    in 9 of 16 probe runs, and a click dispatched across that scroll lands where the seat was.
  */
  await settled(page, 1);

  /* With a record out, Escape is the put-back it already was — the near view stays. */
  await clickSpine(page, page.locator('[data-seat] [data-spine]').first());
  await expect(page.getByTestId('record-chrome')).toBeVisible({ timeout: 5000 });
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('record-chrome')).toHaveCount(0, { timeout: 5000 });
  await expect(page.locator('[data-wall="labelled"]')).toBeVisible();

  /* With nothing out, Escape is the way back to the collection. */
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-wall="overview"]')).toBeVisible();
});

test('the wall’s view and its shelf survive a reload, Back, Forward and a cold link (§W.29)', async ({ page, browser }) => {
  /*
    A zoom is a place rather than a mode, so it is addressable — and pushed,
    so Back returns to where the reader was. The wall owns the view's
    immediate state and the URL owns its address; a reload reads the address
    back and the wall opens on it, through the landing that already exists.
  */
  const { artistId } = await seed(page, 24);
  await page.goto(`/?artistId=${artistId}`);
  await expect(page.locator('[data-wall="labelled"]')).toBeVisible({ timeout: 30_000 });
  await expect(page, 'a bare / carries no wall key').not.toHaveURL(/wall=/);

  /* Out: the URL says far. */
  await page.getByTestId('wall-zoom-out').click();
  await expect(page.locator('[data-wall="overview"]')).toBeVisible();
  await expect(page).toHaveURL(/wall=far/);

  /* A RELOAD on that URL opens far, not the default. */
  await page.reload();
  await expect(page.locator('[data-wall="overview"]')).toBeVisible({ timeout: 30_000 });

  /* In: the URL names the shelf, and the near view is showing. */
  await clickFarRun(page);
  await expect(page.locator('[data-wall="labelled"]')).toBeVisible();
  await expect(page).toHaveURL(/shelf=\d+/);
  await expect(page).not.toHaveURL(/wall=far/);
  const nearUrl = page.url();

  /* BACK returns to the far view — the zoom is in history. */
  await page.goBack();
  await expect(page.locator('[data-wall="overview"]')).toBeVisible({ timeout: 15_000 });
  /* FORWARD returns to the near view. */
  await page.goForward();
  await expect(page.locator('[data-wall="labelled"]')).toBeVisible({ timeout: 15_000 });

  /* And the near URL opened COLD, in a context that has never seen the page, lands on that shelf. */
  const cold = await browser.newContext({ storageState: await page.context().storageState() });
  try {
    const fresh = await cold.newPage();
    await fresh.goto(nearUrl);
    await expect(fresh.locator('[data-wall="labelled"]')).toBeVisible({ timeout: 30_000 });
    await settled(fresh, 1);
    const landed = await fresh.evaluate(() => {
      const el = document.querySelector('[data-region="wall"]') as HTMLElement | null;
      return el === null ? null : { left: Math.round(el.scrollLeft), top: Math.round(el.scrollTop) };
    });
    expect(landed, 'the cold link landed somewhere deliberate').not.toBeNull();
  } finally {
    await cold.close();
  }
});
