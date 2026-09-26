import { OUT_MS, RETURN_MS } from '../src/app/wall/gesture';
import { expect, test, type Page } from '@playwright/test';
import { getTestDb } from '../test/helpers/db';
import { sql } from 'drizzle-orm';


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
 * **Moving between records without putting one back (§10b, 13b).**
 *
 * Arrows on both layouts (overlaid on the artwork), a horizontal swipe on touch.
 * Both move to the adjacent record IN THE WALL'S ORDER. The discriminating cases
 * the prompt names: navigate from a record with neighbours on BOTH sides (index
 * 0 cannot tell adjacency from always-forward), assert the order matches the
 * wall's own producer rather than a literal, and test the ends.
 *
 * On the isometric wall (8a §W.8) the arrows are kept as the lit wall had
 * them — wall order, absent at the ends, a slide at the same depth: the held
 * record goes back and its neighbour comes out on one clock. Adjacency
 * derives from the seat order the anchors carry, which is the same order the
 * keyboard walks and the links carry.
 */

const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

async function seed(count: number): Promise<string> {
  const db = getTestDb();
  const run = Date.now().toString(36);
  const a = await db.execute(sql`INSERT INTO artists (name) VALUES (${'Nav-' + run}) RETURNING id`);
  const artistId = (a.rows[0] as { id: string }).id;
  await db.execute(
    sql`INSERT INTO records (artist_id, title, release_year)
        SELECT ${artistId}::uuid, ${'Nav ' + run + ' '} || i, 1980 FROM generate_series(1, ${count}) i`,
  );
  return artistId;
}

async function cleanup(artistId: string) {
  const db = getTestDb();
  await db.execute(sql`DELETE FROM records WHERE artist_id = ${artistId}::uuid`);
  await db.execute(sql`DELETE FROM artists WHERE id = ${artistId}::uuid`);
}

/**
 * The wall's order, read from the spines themselves — the anchors carry
 * `/records/:id`, in the producer's order. This is the seam test: navigation
 * asserted against the wall's own producer rather than a literal.
 */
async function wallOrder(page: Page): Promise<string[]> {
  return page.$$eval('a[data-seat]', (links) => links.map((a) => a.getAttribute('data-seat') ?? ''));
}

const pulled = (page: Page) =>
  page.evaluate(() => {
    const out = Array.from(document.querySelectorAll('[data-pulled]'));
    /* While two are moving, the one coming OUT is the held record; settled, there is one. */
    return out.length === 0 ? '' : (out[out.length - 1].getAttribute('data-pulled') ?? '');
  });

async function pullFirst(page: Page) {
  await page.locator('[data-seat] [data-spine]').first().click();
  /* Settled, not merely pulled — see `settle`. */
  await settle(page);
}

/** Settled: one record out, its panel up, nothing else moving. */
/**
 * **Waits for the gesture to SETTLE, which neither the chrome nor the pulled
 * element signals.** Both exist from the first frame of a slide, so the old
 * body returned mid-flight. Measured under load — three workers, four
 * repeats, a probe before every click: the arrows were absent at the moment
 * of the click on eight of ten slides, with a record pulled and 59 seats
 * standing. The gesture's clock is frame-driven, and under load frames
 * arrive slower than wall-clock, so a slide that takes 1.6s alone was still
 * running when the next click came. The click then waited for an arrow that
 * arrived late, and ten late arrivals exceeded the test's budget. Alone,
 * four of four passed.
 *
 * The stage draws the arrows only once the arriving record has settled
 * (`WallStage`, the `settled` gate), so an arrow IS the settled signal the
 * product already exposes. At any position with two or more records at
 * least one arrow exists once settled — `next` everywhere but the last seat,
 * `previous` everywhere but the first — so this waits for either. The
 * budget is generous because it is the load case that needs it; a hang
 * still fails inside it.
 */
async function settle(page: Page) {
  await expect(page.getByTestId('record-chrome')).toBeVisible({ timeout: 5000 });
  await expect(
    page.locator('[data-testid="nav-next"], [data-testid="nav-previous"]').first(),
    'the gesture has settled: an arrow is drawn',
  ).toBeVisible({ timeout: 20_000 });
}

test('the arrows move to the adjacent record in the WALL\'S order', async ({ page }) => {
  const artistId = await seed(8);
  try {
    /*
      **The order asserted against the wall's own producer**, not a literal —
      the seam-test shape. `shelfRecords` is what the wall was built from, so
      navigating must walk exactly it.
    */
    await login(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/?artistId=${artistId}`);
    await expect(page.getByTestId('wall')).toBeVisible({ timeout: 30_000 });

    const order = await wallOrder(page);
    expect(order.length).toBe(8);

    await pullFirst(page);
    const firstId = await pulled(page);
    const startIndex = order.indexOf(firstId);
    expect(startIndex, 'the pulled record is in the wall order').toBeGreaterThanOrEqual(0);

    /* Move forward and land on the exact next id in the wall's order. */
    await page.getByTestId('nav-next').click();
    await settle(page);
    expect(await pulled(page), 'next landed on the wall-order successor').toBe(order[startIndex + 1]);

    /* And back, to the predecessor — from a record with a neighbour on both sides. */
    await page.getByTestId('nav-previous').click();
    await settle(page);
    expect(await pulled(page), 'previous returned to the predecessor').toBe(order[startIndex]);
  } finally {
    await cleanup(artistId);
  }
});

test('the previous arrow is ABSENT at the first record, the next arrow at the last', async ({
  page,
}) => {
  const artistId = await seed(6);
  try {
    await login(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/?artistId=${artistId}`);
    await expect(page.getByTestId('wall')).toBeVisible({ timeout: 30_000 });

    const order = await wallOrder(page);

    await pullFirst(page);
    /*
      pullFirst may land on any spine, so walk to the true first record — the
      previous arrow must then be absent, the end behaviour §10b requires (an
      affordance that appears to work and does not is the shape it rejects).
    */
    while ((await pulled(page)) !== order[0]) {
      const prev = page.getByTestId('nav-previous');
      if ((await prev.count()) === 0) break;
      await prev.click();
      await settle(page);
    }
    expect(await pulled(page), 'walked to the first record').toBe(order[0]);
    await expect(page.getByTestId('nav-previous'), 'no previous at the first record').toHaveCount(0);
    await expect(page.getByTestId('nav-next'), 'but there is a next').toBeVisible();

    /* Walk to the last record: the next arrow must be absent there. */
    while ((await pulled(page)) !== order[order.length - 1]) {
      await page.getByTestId('nav-next').click();
      await settle(page);
    }
    expect(await pulled(page), 'walked to the last record').toBe(order[order.length - 1]);
    await expect(page.getByTestId('nav-next'), 'no next at the last record').toHaveCount(0);
    await expect(page.getByTestId('nav-previous'), 'but there is a previous').toBeVisible();
  } finally {
    await cleanup(artistId);
  }
});

/*
  **Superseded, not deleted:** "put back lands right after navigating away from
  where you started" stood here. It was the pull-era predecessor of the slotGap
  test below — same fixture (60), same ten navigations, same Put back — and its
  only assertion was that `data-pulled` cleared, i.e. that the return completed.
  The slotGap test makes that identical poll and two stronger assertions besides:
  the held record's slot is empty while it is out, and the SAME record lands in
  ITS OWN slot afterwards. By §2's rule — name the failure a test catches — there
  is none the predecessor caught that the successor does not, and the successor
  also catches a return to the WRONG slot, which is the bug the slide could
  introduce. Measured at 19.2s each (ten sequential slides, not the fixture),
  the pair paid that cost twice for one property.
*/

test('navigation moves along the collection — both records moving, the neighbour landing where the held one was', async ({
  page,
}) => {
  const artistId = await seed(20);
  try {
    await login(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.clock.install();
    await page.goto(`/?artistId=${artistId}`);
    await expect(page.getByTestId('wall')).toBeVisible({ timeout: 30_000 });
    await page.clock.pauseAt(Date.now() + 1000);

    /* Read BEFORE pulling: a pulled record's anchor is absent from the wall. */
    const order = await wallOrder(page);
    await page.locator('[data-seat] [data-spine]').first().click();
    await page.clock.runFor(OUT_MS + 40);
    /* The pulled BOX's extent — the union of its three faces — which is what the landing centres in the region. */
    const place = () =>
      page.locator('[data-pulled]').evaluate((el) => {
        const rects = ['[data-face="top"]', '[data-face="front"]', '[data-field]'].map((q) =>
          (el.querySelector(q) as Element).getBoundingClientRect(),
        );
        const l = Math.min(...rects.map((r) => r.left));
        const t = Math.min(...rects.map((r) => r.top));
        const w = Math.max(...rects.map((r) => r.right)) - l;
        const h = Math.max(...rects.map((r) => r.bottom)) - t;
        return [l, t, w, h].map((v) => Math.round(v * 10) / 10);
      });
    const landed = await place();

    /* Mid-way: TWO records are moving — the held one back to its seat, its neighbour out to the square. */
    await page.getByTestId('nav-next').click();
    await page.clock.runFor(300);
    const moving = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-pulled]')).map((g) => g.getAttribute('data-pulled')),
    );
    expect(moving.slice().sort(), 'both records move').toEqual([order[0], order[1]].sort());

    /*
      And the neighbour lands where the held one was: the same square in
      the same place. Under the gesture's own construction it would land one
      seat along the row; the interim landing drift (gesture.ts) centres the
      square vertically and keeps it inside the region's lanes, which for a
      row's records is one place. When Design places the landed square, this
      is the assertion that moves.
    */
    await page.clock.runFor(OUT_MS + 40 - 300);
    expect(await pulled(page), 'settled on the successor').toBe(order[1]);
    const successor = await place();
    const centre = (r: number[]) => [r[0] + r[2] / 2, r[1] + r[3] / 2];
    expect(Math.abs(centre(successor)[0] - centre(landed)[0])).toBeLessThan(1.5);
    expect(Math.abs(centre(successor)[1] - centre(landed)[1])).toBeLessThan(1.5);
    expect(Math.abs(successor[2] - landed[2]), 'the same size').toBeLessThan(1.5);
    expect(Math.abs(successor[3] - landed[3])).toBeLessThan(1.5);
  } finally {
    await cleanup(artistId);
  }
});

test('put back lands in the HELD record\'s slot after navigating', async ({ page }) => {
  const artistId = await seed(60);
  try {
    await login(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    /*
      **On Playwright's clock, so the ten slides cost no wall time.** Measured
      under the suite's load: ten real slides took 32.9s alone and exceeded
      the 60s budget at two workers, because the gesture's clock is
      frame-driven and frames arrive slower on a busy machine. Driving the
      clock — as the adjacency test above does — makes each slide complete
      the moment it is advanced, so the test is load-PROOF rather than
      load-tolerant: `settle` still waits on the arrow, and the arrow appears
      on the next frame. The claim is unchanged.
    */
    await page.clock.install();
    await page.goto(`/?artistId=${artistId}`);
    await expect(page.getByTestId('wall')).toBeVisible({ timeout: 30_000 });
    await page.clock.pauseAt(Date.now() + 1000);
    /* Every seat's home, read before anything moves — the layout's own answer. */
    const homes = await page.evaluate(() =>
      Object.fromEntries(
        Array.from(document.querySelectorAll('a[data-seat]')).map((a) => [
          a.getAttribute('data-seat'),
          a.querySelector('[data-face="front"]')?.getAttribute('points') ?? '',
        ]),
      ),
    );
    /* The wall's anchor order before anything moves: a pulled record leaves the DOM's seats, so the held record's index is taken against this. */
    const initial = await wallOrder(page);
    await page.locator('[data-seat] [data-spine]').first().click();
    await page.clock.runFor(OUT_MS + 40);
    await settle(page);

    for (let i = 0; i < 10; i += 1) {
      /*
        Observed before each slide, not assumed: under one worker this walk
        hung twice on `waiting for nav-next`, and two hypotheses for why --
        leftover records from other specs; walking off the end (the first
        spine is #0 of 60 on every load) -- were disproven by measurement.
        The state is logged where the next failure's output will show it.
      */
      /* The seats the DOM shows and where the held record sits in them: a wall of fewer seats than seeded, or arrows disagreeing with the seats, are different defects. */
      const before = await page.evaluate(() => { const held = document.querySelector('[data-pulled]')?.getAttribute('data-pulled') ?? ''; const seats = Array.from(document.querySelectorAll('[data-seat]')).map((e) => e.getAttribute('data-seat')); return { pulled: held.slice(0, 8) || '-', next: document.querySelectorAll('[data-testid="nav-next"]').length, prev: document.querySelectorAll('[data-testid="nav-previous"]').length, chrome: document.querySelectorAll('[data-testid="record-chrome"]').length, seats: seats.length, at: seats.indexOf(held), links: document.querySelectorAll('a[data-seat]').length }; });
      const heldFull = await page.evaluate(() => document.querySelector('[data-pulled]')?.getAttribute('data-pulled') ?? '');
      console.log(`  slide ${i + 1}: pulled=${before.pulled} next=${before.next} prev=${before.prev} chrome=${before.chrome} seats=${before.seats} links=${before.links} held-at=${before.at} initial=${initial.length} held-in-initial=${initial.indexOf(heldFull)}`);
      await page.getByTestId('nav-next').click({ timeout: 15_000 });
      /* A slide is one out gesture on one clock (navigate): advance it, then wait for the arrow it settles into. */
      await page.clock.runFor(OUT_MS + 40);
      await settle(page);
    }
    const held = await pulled(page);
    expect(held, 'ten slides moved the held record').not.toBe((await wallOrder(page))[0]);
    /* The held record's seat is empty while it is out. */
    await expect(page.locator(`a[data-seat="${held}"]`)).toHaveCount(0);

    await page.getByTestId('record-chrome').getByTestId('action-put').click();
    /* The return animates too; advance its length so the seat can be re-read. */
    await page.clock.runFor(RETURN_MS + 40);
    await expect(page.locator('[data-pulled]')).toHaveCount(0, { timeout: 5000 });

    /*
      **Where it ACTUALLY landed, against the layout's slot:** the SAME record,
      seated again, on exactly the points its seat had before anything moved —
      a return to the wrong slot is the bug a slide can introduce.
    */
    await expect(page.locator(`a[data-seat="${held}"] [data-face="front"]`)).toHaveAttribute('points', homes[held]);
  } finally {
    await cleanup(artistId);
  }
});
