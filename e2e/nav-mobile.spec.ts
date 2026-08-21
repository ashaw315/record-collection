import { expect, test, type Page } from '@playwright/test';

/**
 * **The nav must be usable at 390px** (SPEC.md §10: desktop and mobile are
 * equal priorities, and the mobile case is "standing in a record store").
 *
 * `AppHeader`'s nav was a single `overflow-x-auto` row of five links. Measured
 * at 390px before this spec was written: `scrollWidth` 337 in a `clientWidth`
 * of 237, with **Stats and Manage entirely outside the viewport** — right edges
 * at 409 and 478 against a 390px window — behind a horizontal scroll with no
 * affordance indicating there was anything there.
 *
 * NOTES carried that measurement across three steps as a known defect and it
 * survived every one of them, because nothing executed the nav at a phone
 * width. It is a usability problem rather than a rendering one: the links are
 * in the DOM, they are focusable, and a user simply never discovers the tail of
 * the list.
 *
 * ## Why this asserts geometry and not classes
 *
 * The obvious test — "every link is inside the viewport" — passes on a nav that
 * wraps into a heap: links stacked on each other, or squeezed to a few pixels
 * tall, are all inside the viewport. **Being in the viewport is not being
 * usable**, which is the same distinction this suite has already been caught by
 * twice: DOM presence is not visibility (unit 12g, two `graph-node` tests
 * passing against a CSS-hidden canvas), and unit 20's breakout classes were all
 * present and correct while a fourth declaration cancelled them.
 *
 * A class-name assertion is worse still. `flex-wrap` in the source does not
 * prove a wrap happened — a parent `flex-nowrap`, a `w-max`, or an
 * `overflow-x-auto` that never lets the row reach its container's width would
 * each leave the class present and inert. The rendered box is the only thing
 * that knows.
 *
 * So each link is asserted three ways, and they fail against different defects:
 *
 *   1. `toBeVisible` + inside the viewport — the off-screen tail, the original
 *      defect. Fails against `AppHeader.tsx`'s nav row.
 *   2. A tappable height — a wrap that squeezes rows to nothing. §10 says
 *      thumb-reachable; 24px is well under the 44px guideline and is chosen as
 *      a floor that only a collapsed layout breaches, not as an endorsement.
 *   3. No two links overlap — a wrap that stacks links on top of each other.
 *      This is the one the naive test misses entirely, and the one that catches
 *      a "fix" that satisfies the first assertion by folding the row onto
 *      itself.
 */

const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';

/** SPEC.md §11 flow 10 names this viewport. The mobile project uses iPhone 13. */
const MOBILE_WIDTH = 390;

/**
 * The five links §10 puts in the nav, listed rather than read from the DOM.
 *
 * Reading them from the DOM would make this spec agree with whatever the nav
 * currently renders — a nav that lost a link would still pass, because the
 * missing one would not be in the list it checked. The vacuity guard below
 * asserts the count for the same reason `every-page-has-nav.spec.ts` does.
 *
 * `/suggestions` is deliberately absent (NOTES, step 14 unit 3): it is reached
 * from `/want-list`, not from the nav.
 */
const NAV_LINKS = ['Collection', 'Want list', 'Look up', 'Stats', 'Manage'] as const;

async function login(page: Page) {
  await page.goto('/login');
  // Controlled form: typing before hydration never reaches React state.
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('every nav link is reachable at 390px', async ({ page }) => {
  await page.setViewportSize({ width: MOBILE_WIDTH, height: 844 });

  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav).toBeVisible();

  /*
   * The vacuity guard. Without it, a nav rendering zero links passes every
   * assertion below by iterating over nothing — the empty-payload shape §9.2's
   * disclosure test was paired against for the same reason.
   */
  await expect(nav.getByRole('link')).toHaveCount(NAV_LINKS.length);

  const boxes: { label: string; box: { x: number; y: number; width: number; height: number } }[] =
    [];

  for (const label of NAV_LINKS) {
    const link = nav.getByRole('link', { name: label, exact: true });
    await expect(link).toBeVisible();

    const box = await link.boundingBox();
    expect(box, `${label} has no bounding box`).not.toBeNull();
    if (!box) continue;

    // 1. Inside the viewport. The original defect: Stats at 409, Manage at 478.
    expect(
      box.x,
      `"${label}" starts at x=${box.x}, left of the viewport`,
    ).toBeGreaterThanOrEqual(0);
    expect(
      box.x + box.width,
      `"${label}" ends at x=${box.x + box.width}, past the ${MOBILE_WIDTH}px viewport`,
    ).toBeLessThanOrEqual(MOBILE_WIDTH);

    // 2. Tappable. A wrap that collapses its rows satisfies (1) and not this.
    expect(box.height, `"${label}" is ${box.height}px tall, too small to tap`).toBeGreaterThanOrEqual(
      24,
    );

    boxes.push({ label, box });
  }

  // 3. No two links overlap. The assertion a stacked wrap fails and (1) does not.
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      const overlaps =
        a.box.x < b.box.x + b.box.width &&
        b.box.x < a.box.x + a.box.width &&
        a.box.y < b.box.y + b.box.height &&
        b.box.y < a.box.y + a.box.height;

      expect(
        overlaps,
        `"${a.label}" and "${b.label}" overlap: ` +
          `${a.label} at (${a.box.x}, ${a.box.y}) ${a.box.width}x${a.box.height}, ` +
          `${b.label} at (${b.box.x}, ${b.box.y}) ${b.box.width}x${b.box.height}`,
      ).toBe(false);
    }
  }
});

/**
 * The measurement, asserted rather than eyeballed.
 *
 * NOTES has carried `scrollWidth 337 / clientWidth 237` as prose since step 12,
 * and prose is what let it survive three steps. A row that fits its container
 * has nothing hidden behind a scroll — so this is the same defect as the test
 * above, stated as the number that was actually measured, and it fails against
 * `AppHeader.tsx`'s `overflow-x-auto` nav for a reason a bounding box cannot
 * express: **there is nothing scrolled out of view.**
 *
 * Kept separate from the geometry test because it can survive a change that
 * breaks the other: a nav could fit its container while a link is clipped by an
 * ancestor, and a nav could show every link while still being horizontally
 * scrollable by a pixel or two of padding.
 */
test('the nav has no hidden horizontal scroll at 390px', async ({ page }) => {
  await page.setViewportSize({ width: MOBILE_WIDTH, height: 844 });

  const metrics = await page
    .getByRole('navigation', { name: 'Main' })
    .evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));

  expect(
    metrics.scrollWidth,
    `the nav scrolls: scrollWidth ${metrics.scrollWidth} in clientWidth ${metrics.clientWidth}, ` +
      `so ${metrics.scrollWidth - metrics.clientWidth}px is hidden behind a horizontal scroll`,
  ).toBeLessThanOrEqual(metrics.clientWidth);
});
