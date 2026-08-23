import { expect, test, type Page } from '@playwright/test';
import { getTestDb } from '../test/helpers/db';
import { sql } from 'drizzle-orm';

/**
 * **Moving between records without putting one back (§10b, 13b).**
 *
 * Arrows on both layouts (overlaid on the artwork), a horizontal swipe on touch.
 * Both move to the adjacent record IN THE WALL'S ORDER. The discriminating cases
 * the prompt names: navigate from a record with neighbours on BOTH sides (index
 * 0 cannot tell adjacency from always-forward), assert the order matches the
 * wall's own producer rather than a literal, and test the ends.
 *
 * The swipe/tilt boundary lives in `touch-tilt.spec.ts`; this covers the
 * navigation and the arrows.
 */

const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/', { timeout: 30_000 });
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
 * The wall's order, read from the `wall-records` list — the SAME `records`
 * prop the wall is built from, rendered as `/records/:id` links. This is the
 * seam test: asserting navigation against the wall's own producer rather than a
 * literal or a re-derivation. `shelfRecords` cannot be imported here (it is
 * server-only), and this list is exactly what it produced.
 */
async function wallOrder(page: Page): Promise<string[]> {
  return page.$$eval('[data-testid="wall-records"] a', (links) =>
    links.map((a) => (a as HTMLAnchorElement).getAttribute('href')!.replace('/records/', '')),
  );
}

const pulled = (page: Page) =>
  page.evaluate(
    () => (document.querySelector('[data-testid="wall-scene"]') as HTMLElement)?.dataset.pulled ?? '',
  );

async function pullFirst(page: Page) {
  const box = await page.getByTestId('wall-scene').locator('canvas').boundingBox();
  if (!box) throw new Error('no canvas');
  for (let offset = 20; offset < 600; offset += 12) {
    await page.mouse.click(box.x + offset, box.y + 120);
    if ((await pulled(page)) !== '') break;
  }
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (document.querySelector('[data-testid="wall-scene"]') as HTMLElement)?.dataset
              .pulledProgress ?? '0',
        ),
      { timeout: 10_000 },
    )
    .toBe('1');
}

async function settle(page: Page) {
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (document.querySelector('[data-testid="wall-scene"]') as HTMLElement)?.dataset
              .pulledProgress ?? '0',
        ),
      { timeout: 10_000 },
    )
    .toBe('1');
  /*
    Wait for the PHASE too, not just progress — a slide's progress hits 1 a tick
    before the state settles, and clicking the next arrow mid-settle races the
    transition. `settled` or `flipping` both mean the record is out and still.
  */
  await expect
    .poll(
      () =>
        page.evaluate(
          () => (document.querySelector('[data-testid="wall-scene"]') as HTMLElement)?.dataset.phase ?? '',
        ),
      { timeout: 10_000 },
    )
    .toMatch(/settled|flipping/);
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
    await page.goto(`/plane?artistId=${artistId}`);
    await expect(page.getByTestId('wall-scene').locator('canvas')).toBeVisible({ timeout: 30_000 });

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
    await page.goto(`/plane?artistId=${artistId}`);
    await expect(page.getByTestId('wall-scene').locator('canvas')).toBeVisible({ timeout: 30_000 });

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

test('navigation is a SLIDE — both records at the same depth, not a rise', async ({ page }) => {
  const artistId = await seed(20);
  try {
    await login(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/plane?artistId=${artistId}`);
    await expect(page.getByTestId('wall-scene').locator('canvas')).toBeVisible({ timeout: 30_000 });
    await pullFirst(page);

    /*
      During a slide the record is in the 'sliding' phase — a LATERAL move, not a
      rise. The scene exposes the phase via the data attribute set while sliding;
      we sample it mid-transition. A rise would pass through 'rising' instead.
      Asserted through the state, not pixels, because the mechanism is the claim.
    */
    /*
      **The phase is 'sliding', never 'rising'** — that IS the distinction from
      the pull-based version, which passed through 'rising'. Poll for it right
      after the click; a slide is fast, so catch it before it settles.
    */
    await page.getByTestId('nav-next').click();
    const phasesSeen = new Set<string>();
    for (let i = 0; i < 40; i += 1) {
      phasesSeen.add(
        await page.evaluate(
          () => (document.querySelector('[data-testid="wall-scene"]') as HTMLElement)?.dataset.phase ?? '',
        ),
      );
      if (phasesSeen.has('settled') && phasesSeen.has('sliding')) break;
      await page.waitForTimeout(15);
    }
    expect(phasesSeen.has('sliding'), `saw phases ${[...phasesSeen].join(',')}`).toBe(true);
    expect(phasesSeen.has('rising'), 'a slide never rises').toBe(false);
    await settle(page);
  } finally {
    await cleanup(artistId);
  }
});

test('put back lands in the HELD record\'s slot after sliding (slotGap ~0)', async ({ page }) => {
  const artistId = await seed(60);
  try {
    await login(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/plane?artistId=${artistId}`);
    await expect(page.getByTestId('wall-scene').locator('canvas')).toBeVisible({ timeout: 30_000 });
    await pullFirst(page);

    for (let i = 0; i < 10; i += 1) {
      await page.getByTestId('nav-next').click();
      await settle(page);
    }

    const slotGap = () =>
      page.evaluate(
        () => Number((document.querySelector('[data-testid="wall-scene"]') as HTMLElement)?.dataset.slotGap ?? '-1'),
      );
    /*
      The held record's slot is EMPTY while it is out (a large gap), and after
      put-back the SAME record returns to ITS slot — the gap collapses to ~0.
      This is the property from the pull-based version, preserved for the slide:
      sliding along changes which record is held, and its home is elsewhere, so
      the return must find that home rather than the original.
    */
    expect(await slotGap(), 'the held record slot is empty while out').toBeGreaterThan(100);

    await page.getByTestId('record-chrome').getByTestId('action-put').click();
    await expect.poll(() => page.evaluate(() => (document.querySelector('[data-testid="wall-scene"]') as HTMLElement)?.dataset.pulled ?? ''), { timeout: 10_000 }).toBe('');
    await page.waitForTimeout(300);
    expect(await slotGap(), 'the record returned to its own slot').toBeLessThan(5);
  } finally {
    await cleanup(artistId);
  }
});
