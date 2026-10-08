import { expect, test } from '@playwright/test';
import { login } from './sign-in';

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

test.beforeEach(async ({ page }) => {
  await login(page);
});

/**
 * **Step 76 (§G.5, §G.8) replaced the wrapped nav with a menu below 584, and
 * these two tests with it.** §G.5 assigns the tests that pin the wrapping to
 * that step. The claim they carried survives: at a phone width every section
 * is reachable, inside the viewport, tappable, and overlapping no other. It
 * is now asserted where the sections are -- the open menu's rows -- and the
 * tap size is read as the row's box, which is the hit area there (44, §9.3).
 *
 * The links in the row above 584 have a 44 overlay rather than a 44 box, so a
 * box measure there would read 11 against a hit area of 44: `nav-menu-76`
 * taps it instead.
 */
for (const width of [MOBILE_WIDTH, 320]) {
  /* Fails against step 74's header: below 584 there was no menu, so no rows to reach. */
  test(`every section is reachable through the menu at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/want-list');
    await page.locator('[data-menu-control]').click();
    const list = page.locator('[data-menu-list]');
    await expect(list).toBeVisible();

    /* The vacuity guard: a list of zero rows passes everything below. */
    await expect(list.getByRole('link')).toHaveCount(NAV_LINKS.length);

    const boxes: { label: string; box: { x: number; y: number; width: number; height: number } }[] = [];
    for (const label of NAV_LINKS) {
      const link = list.getByRole('link', { name: label, exact: true });
      await expect(link).toBeVisible();
      const box = await link.boundingBox();
      expect(box, `${label} has no bounding box`).not.toBeNull();
      if (!box) continue;
      expect(box.x, `"${label}" starts left of the viewport`).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, `"${label}" ends past the ${width}px viewport`).toBeLessThanOrEqual(width);
      expect(box.height, `"${label}" is ${box.height}px tall; a menu row is 44`).toBeGreaterThanOrEqual(44);
      boxes.push({ label, box });
    }
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i].box;
        const b = boxes[j].box;
        const overlaps = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
        expect(overlaps, `"${boxes[i].label}" and "${boxes[j].label}" overlap`).toBe(false);
      }
    }
  });
}

/**
 * The original defect, a horizontal scroll hiding the tail, asserted on the
 * header's row rather than the nav: below 584 the nav's links are not in the
 * row at all, so a nav measure there would pass on an empty box. A guard,
 * not a fail-first test: step 74's wrapped row did not overflow either.
 */
for (const width of [MOBILE_WIDTH, 320]) {
  test(`the header's row has no hidden horizontal scroll at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/want-list');
    const metrics = await page
      .locator('[data-app-nav] > div')
      .evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
    expect(
      metrics.scrollWidth,
      `the row scrolls: scrollWidth ${metrics.scrollWidth} in clientWidth ${metrics.clientWidth}`,
    ).toBeLessThanOrEqual(metrics.clientWidth);
  });
}
