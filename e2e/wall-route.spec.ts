import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import { LANDING_PAD } from '../src/app/wall/landing';

registerCleanup();

/**
 * 8a §11.12: the route opens FAR, and moving between the two views has two
 * named targets and never an intermediate.
 *
 * In is a click on a seat, landing the near view with the addressed shelf at
 * the region's top and the seat at its left. Out is the count — the
 * collection's identity, which is what the zoom-out arrives at — or Escape,
 * which already dismisses the pulled state. Neither direction is a wheel or a
 * pinch: a continuous input snapping to a target is an intermediate.
 */
const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';
const suffix = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

/*
  Seats overlap in projection, so neither the anchor's bounding-box centre nor
  its top face's centre reliably hit-tests to the seat itself — the record in
  front covers both. The click goes to a point the browser agrees belongs to
  this seat: the exposed sliver of its FRONT face, found by hit-testing.
*/
async function clickFarSeat(page: Page, id: string) {
  const point = await page.evaluate((seatId) => {
    const anchor = document.querySelector(`[data-far-seat="${seatId}"]`);
    if (anchor === null) return null;
    for (const polygon of Array.from(anchor.querySelectorAll('polygon')).reverse()) {
      const box = polygon.getBoundingClientRect();
      for (const fx of [0.5, 0.25, 0.75, 0.1, 0.9]) {
        for (const fy of [0.5, 0.75, 0.25]) {
          const x = box.left + box.width * fx;
          const y = box.top + box.height * fy;
          if (document.elementFromPoint(x, y)?.closest('[data-far-seat]')?.getAttribute('data-far-seat') === seatId) return { x, y };
        }
      }
    }
    return null;
  }, id);
  expect(point, `a clickable point on far seat ${id}`).not.toBeNull();
  if (point === null) return;
  await page.mouse.click(point.x, point.y);
}

/** Enough records to fill more than one shelf, so a zoom lands on a row that is not the first. */
async function seed(page: Page, count: number): Promise<{ artistId: string; ids: string[] }> {
  const artist = await page.request.post('/api/artists', { data: { name: `Route-${suffix()}` } });
  const artistId = (await artist.json()).id as string;
  trackArtist(artistId);
  const ids: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const record = await page.request.post('/api/records', { data: { title: `Route ${String(i).padStart(3, '0')}`, artistId } });
    expect(record.status()).toBe(201);
    ids.push((await record.json()).id as string);
  }
  return { artistId, ids };
}

test.beforeEach(async ({ page }) => {
  await login(page);
  await page.setViewportSize({ width: 1440, height: 900 });
});

test('the near view can be reached and used at desktop width, with no unmeasured state left (§11.12, §11.26)', async ({ page }) => {
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
  const { artistId, ids } = await seed(page, 24);
  await page.goto(`/?artistId=${artistId}`);
  await expect(page.getByTestId('wall')).toBeAttached({ timeout: 30_000 });

  /* The gate clears without the near view ever having existed. */
  await expect(page.locator('[data-wall-container][data-unmeasured]'), 'the unmeasured gate clears on the viewport alone').toHaveCount(0, { timeout: 10_000 });

  /* The near view is reachable — it is what the route opens on (§11.29)... */
  await expect(page.locator('[data-wall="labelled"]')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[data-wall-container][data-unmeasured]')).toHaveCount(0);

  /* ...and usable: a spine pulls. */
  await page.locator('a[data-seat] [data-spine]').first().click();
  await expect(page.getByTestId('record-chrome')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[data-pulled]')).toHaveCount(1);
});

test('a bare / opens NEAR with the occupied shelf framed, and the far view is a deliberate zoom-out (§11.29)', async ({ page }) => {
  /*
    §11.12's "the route opens far" is withdrawn on the desktop: at the common
    collection size the far view is a small unlabelled object that can report
    neither quantity nor arrangement, and a reader had to click before
    anything was readable. The arrival lands on the OCCUPIED shelf — the
    empty shelves are the room the collection grows into.
  */
  const { artistId, ids } = await seed(page, 24);
  await page.goto(`/?artistId=${artistId}`);
  await expect(page.getByTestId('wall')).toBeAttached({ timeout: 30_000 });

  /* Near, with labels, on the first load — no click. */
  await expect(page.locator('[data-wall="labelled"]')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-wall="overview"]')).toHaveCount(0);
  await expect(page.locator('a[data-seat]').first()).toBeVisible();

  /* Framed on the occupied shelf: the first seat is in the region, and so are its top faces. */
  await page.waitForTimeout(900);
  const framed = await page.evaluate((id) => {
    const rect = (q: string) => { const r = document.querySelector(q)?.getBoundingClientRect(); return r ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null; };
    return { region: rect('[data-region="wall"]'), seat: rect(`a[data-seat="${id}"] [data-spine]`), top: rect(`a[data-seat="${id}"] [data-face="top"]`) };
  }, ids[0]);
  expect(framed.region && framed.seat && framed.top).toBeTruthy();
  if (framed.region && framed.seat && framed.top) {
    expect(framed.seat.top, 'the arrival seat is inside the region').toBeGreaterThanOrEqual(framed.region.top - 1);
    expect(framed.seat.bottom).toBeLessThanOrEqual(framed.region.bottom + 1);
    expect(framed.top.top, 'and its top face is not cut off (§11.28)').toBeGreaterThanOrEqual(framed.region.top - 1);
  }

  /* The far view is still reachable from the count... */
  await page.getByTestId('wall-zoom-out').click();
  await expect(page.locator('[data-wall="overview"]')).toBeVisible();
  await expect(page.locator('[data-wall="labelled"]')).toHaveCount(0);

  /* ...and a far seat still zooms back in. */
  await clickFarSeat(page, ids[5]);
  await expect(page.locator('[data-wall="labelled"]')).toBeVisible();
});

test('Escape reaches the far view from a bare /, with nothing pulled (§11.12, §11.29)', async ({ page }) => {
  const { artistId } = await seed(page, 20);
  await page.goto(`/?artistId=${artistId}`);
  await expect(page.locator('[data-wall="labelled"]')).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-wall="overview"]')).toBeVisible();
});

test('the near view lands by the rule: min(target, the scroller’s limit), the shelf at the region’s top, applied exactly once (§11.12)', async ({ page }) => {
  /*
    The landing is a scroll, so the scroller bounds it: a seat far enough along
    the row cannot reach the region's left edge, and the honest landing is as
    far left as the wall allows. Asserted as the RULE rather than a position —
    expected = min(target, scrollWidth − clientWidth), and 0 when the wall fits
    the region — with the three cases the rule has.
  */
  const { artistId, ids } = await seed(page, 240);
  const land = async (index: number) => {
    /* Out to the far view, then in on the seat under test: §11.29 opens near, so the zoom-out is the way to a far seat. */
    await page.goto(`/?artistId=${artistId}`);
    await expect(page.locator('[data-wall="labelled"]')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('wall-zoom-out').click();
    await expect(page.locator('[data-wall="overview"]')).toBeVisible();
    await page.evaluate(() => { (window as unknown as { __landings?: number }).__landings = 0; });
    await clickFarSeat(page, ids[index]);
    await expect(page.locator('[data-wall="labelled"]')).toBeVisible();
    /*
      Read after the wall has settled: the frame grows once the region is
      measured, and a reading taken mid-settle measures the scroll against a
      frame that is about to change. The landing itself is asserted by its
      count, so a late reading cannot hide a landing that was undone.
    */
    await page.waitForTimeout(900);
    return page.evaluate((id) => {
      const el = document.querySelector('[data-region="wall"]') as HTMLElement | null;
      const rect = (q: string) => { const r = document.querySelector(q)?.getBoundingClientRect(); return r ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null; };
      return {
        scrollLeft: el === null ? null : Math.round(el.scrollLeft),
        limit: el === null ? null : el.scrollWidth - el.clientWidth,
        landings: (window as unknown as { __landings?: number }).__landings,
        region: rect('[data-region="wall"]'),
        seat: rect(`[data-seat="${id}"] [data-spine]`),
        shelf: rect(`[data-seat="${id}"] [data-face="top"]`),
      };
    }, ids[index]);
  };

  /* A seat EARLY in the row: the target is reachable, so the seat sits at the region's left, one pad in. */
  const early = await land(4);
  expect(early.landings, 'the landing is applied exactly once').toBe(1);
  expect(early.scrollLeft, 'below the limit: the target itself').toBeLessThan(early.limit ?? 0);
  if (early.region && early.seat && early.shelf) {
    expect(early.seat.left - early.region.left, 'the seat is at the region’s left').toBeGreaterThanOrEqual(-1);
    expect(early.seat.left - early.region.left, 'not centred').toBeLessThan(LANDING_PAD + 20);
    /*
      §11.28's window rule: the vertical target takes in the top faces the
      arrival SHOWS, so the addressed seat's own top sits at or below the
      region's top rather than at it — a seat further along the row is the
      one flush with the edge. What must hold is that it is inside and uncut.
    */
    expect(early.shelf.top - early.region.top, 'the addressed shelf’s top face is not cut off').toBeGreaterThanOrEqual(-1);
    expect(early.region.right - early.seat.left, 'the useful half of the region is after the seat').toBeGreaterThan((early.region.right - early.region.left) / 2);
  }

  /* A seat LATE in the row: the target is past the scroller's limit, so the landing stops there. */
  const late = await land(230);
  expect(late.landings).toBe(1);
  expect(late.scrollLeft, 'clamped to the scroller’s limit — as far left as the wall allows').toBe(late.limit);
  if (late.region && late.shelf) {
    expect(late.shelf.top - late.region.top, 'and the addressed shelf is still inside the region, uncut').toBeGreaterThanOrEqual(-1);
    expect(late.shelf.top, 'and above its bottom edge').toBeLessThan(late.region.bottom);
  }
});

test('a wall that fits the region has no horizontal landing to make, and still puts the addressed shelf at the top (§11.12)', async ({ page }) => {
  const { artistId, ids } = await seed(page, 20);
  await page.goto(`/?artistId=${artistId}`);
  await expect(page.locator('[data-wall="labelled"]')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('wall-zoom-out').click();
  await expect(page.locator('[data-wall="overview"]')).toBeVisible();
  await clickFarSeat(page, ids[10]);
  await expect(page.locator('[data-wall="labelled"]')).toBeVisible();
  await page.waitForTimeout(250);
  const got = await page.evaluate((id) => {
    const el = document.querySelector('[data-region="wall"]') as HTMLElement | null;
    const rect = (q: string) => { const r = document.querySelector(q)?.getBoundingClientRect(); return r ? { top: r.top } : null; };
    return { scrollLeft: el === null ? null : Math.round(el.scrollLeft), fits: el !== null && el.scrollWidth <= el.clientWidth, region: rect('[data-region="wall"]'), shelf: rect(`[data-seat="${id}"] [data-face="top"]`) };
  }, ids[10]);
  expect(got.fits, 'the whole wall is visible').toBe(true);
  expect(got.scrollLeft, 'nothing to pan: the landing resolves to zero').toBe(0);
  if (got.region && got.shelf) expect(got.shelf.top - got.region.top, 'the addressed shelf’s top face is not cut off').toBeGreaterThanOrEqual(-1);
});

test('Escape returns to the collection when nothing is pulled, and dismisses the pull when something is', async ({ page }) => {
  const { artistId, ids } = await seed(page, 12);
  await page.goto(`/?artistId=${artistId}`);
  await expect(page.locator('[data-wall="labelled"]')).toBeVisible({ timeout: 30_000 });

  /* With a record out, Escape is the put-back it already was — the near view stays. */
  await page.locator('[data-seat] [data-spine]').first().click();
  await expect(page.getByTestId('record-chrome')).toBeVisible({ timeout: 5000 });
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('record-chrome')).toHaveCount(0, { timeout: 5000 });
  await expect(page.locator('[data-wall="labelled"]')).toBeVisible();

  /* With nothing out, Escape is the way back to the collection. */
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-wall="overview"]')).toBeVisible();
});
