import { expect, test, type Page } from '@playwright/test';
import { getTestDb } from '../test/helpers/db';
import { sql } from 'drizzle-orm';

/**
 * **Drag to tilt on touch (§10b: "on touch it is dragged").**
 *
 * The gesture boundary is the subject: a finger that starts ON the record turns
 * it; a finger on the wall does not. A test that only drags the record cannot
 * tell a correct boundary from one that claims every touch, so this drags both.
 * And it asserts the record HOLDS its angle after the finger lifts — a version
 * that sprang to rest would pass a test checking only that the angle moved.
 *
 * **Driven through Chromium with a real touch stream (CDP
 * `Input.dispatchTouchEvent`)**, because Playwright's touchscreen API taps but
 * does not drag, and CDP is Chromium-only. The claims that rest on emulation
 * versus the device are called out in the unit's report; the gesture boundary
 * and the hold are asserted here, the feel is judged on the phone.
 */

const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/', { timeout: 30_000 });
}

async function seed(): Promise<string> {
  const db = getTestDb();
  const run = Date.now().toString(36);
  const a = await db.execute(sql`INSERT INTO artists (name) VALUES (${'Touch-' + run}) RETURNING id`);
  const artistId = (a.rows[0] as { id: string }).id;
  await db.execute(
    sql`INSERT INTO records (artist_id, title, release_year)
        SELECT ${artistId}::uuid, ${'Touch ' + run + ' '} || i, 1980 FROM generate_series(1, 8) i`,
  );
  return artistId;
}

async function cleanup(artistId: string) {
  const db = getTestDb();
  await db.execute(sql`DELETE FROM records WHERE artist_id = ${artistId}::uuid`);
  await db.execute(sql`DELETE FROM artists WHERE id = ${artistId}::uuid`);
}

const rotY = (page: Page) =>
  page.evaluate(
    () => (document.querySelector('[data-testid="wall-scene"]') as HTMLElement)?.dataset.rotY ?? 'x',
  );

/** Pull a record by tapping along the first row, then wait for it to settle. */
async function pullByTap(page: Page) {
  const box = await page.getByTestId('wall-scene').locator('canvas').boundingBox();
  if (!box) throw new Error('no canvas');
  for (let offset = 20; offset < 380; offset += 12) {
    await page.touchscreen.tap(box.x + offset, box.y + 120);
    const pulled = await page.evaluate(
      () => (document.querySelector('[data-testid="wall-scene"]') as HTMLElement)?.dataset.pulled ?? '',
    );
    if (pulled !== '') break;
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

test('a tap still pulls a record — the touch handler does not swallow it', async ({ page }) => {
  const artistId = await seed();
  try {
    await login(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/plane?artistId=${artistId}`);
    await expect(page.getByTestId('wall-scene').locator('canvas')).toBeVisible({ timeout: 30_000 });

    await pullByTap(page);
    /* Reaching progress '1' means the record pulled and settled — the tap works. */
    await expect(page.getByTestId('wall-scene')).toHaveAttribute('data-pulled', /.+/);
  } finally {
    await cleanup(artistId);
  }
});

test('a drag that STARTS on the record tilts it, and it holds after release', async ({ page }) => {
  const artistId = await seed();
  try {
    await login(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/plane?artistId=${artistId}`);
    await expect(page.getByTestId('wall-scene').locator('canvas')).toBeVisible({ timeout: 30_000 });
    await pullByTap(page);

    const before = await rotY(page);

    const client = await page.context().newCDPSession(page);
    /* The record fills the middle of the frame; its centre is on the axis. */
    const cx = 195;
    const cy = 400;
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy }] });
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: cx + 60, y: cy - 40 }],
    });
    await page.waitForTimeout(150);
    const during = await rotY(page);

    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(150);
    const after = await rotY(page);
    await client.detach();

    expect(during, `the record turned under the finger (${before} -> ${during})`).not.toBe(before);
    /* §10b: a record you turned stays turned. The hold, not a spring to rest. */
    expect(after, `the angle held after the finger lifted (${during} -> ${after})`).toBe(during);
  } finally {
    await cleanup(artistId);
  }
});

test('a drag that STARTS on the wall does NOT tilt the record (the boundary)', async ({ page }) => {
  const artistId = await seed();
  try {
    await login(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/plane?artistId=${artistId}`);
    await expect(page.getByTestId('wall-scene').locator('canvas')).toBeVisible({ timeout: 30_000 });
    await pullByTap(page);

    const client = await page.context().newCDPSession(page);

    /* First turn the record, so "unchanged" below is a real hold, not a zero. */
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 400 }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 255, y: 360 }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(150);
    const held = await rotY(page);
    expect(held, 'the record is turned before the wall drag').not.toBe('0');

    /*
      A drag on the WALL, above the record (the record is centred; y=120 is over
      the wall spines). The record must NOT turn — the gesture began off it.
    */
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 120 }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 255, y: 80 }] });
    await page.waitForTimeout(150);
    const duringWallDrag = await rotY(page);
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await client.detach();

    expect(
      duringWallDrag,
      `a wall drag left the record's angle unchanged (held ${held}, during ${duringWallDrag})`,
    ).toBe(held);
  } finally {
    await cleanup(artistId);
  }
});
