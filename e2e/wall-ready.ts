import { expect, type Locator, type Page } from '@playwright/test';

/**
 * **A seat is clicked only when the wall is at rest (28 Oct).**
 *
 * The wall-route Escape test flaked in two consecutive gates on the same
 * failure: after the first spine's click, no pull began, and the chrome it
 * waited 5s for never came. The test waited for the labelled wall to be
 * visible, which is the server's markup, and clicked. The page's own
 * settling comes later: the region is marked hydrated when React attaches
 * (`WallLive`, `data-hydrated`), and the arrival's landing scrolls the region
 * to the occupied shelf on a later commit, which a probe saw happen after
 * visibility in 9 of 16 runs; a click dispatched across that scroll lands
 * where the seat was. The three landing tests in the same file already
 * waited on this with their own helper; the Escape test was the one left on
 * the visibility wait, and nothing required the helper's use.
 *
 * **Not shown to address the flake (17:40).** A second probe forced the race
 * with the point read before hydration and the landing moving the region by
 * 471 afterwards, and the stale point still hit a spine and pulled, 10 of
 * 10: on this layout the shift lands on another seat, not on a gap. So the
 * two conditions here are real and worth waiting for, and the flake's cause
 * is not known. The next occurrence needs the gate's retained trace.
 *
 * So this is the one way a spec clicks a spine, and `test/repo/
 * spine-click-helper.test.ts` refuses a spec that clicks one any other way.
 * It waits for the region's two marks, hydrated and landed: `data-landed`
 * is set by the same commit that consumes a pending landing, or finds none
 * pending, on a frame that is the region's own. Marks, not frames: the
 * gesture specs freeze the page's clock, and a wait on animation frames
 * never returned under it (the first draft, 18 tests). The landing's count
 * stays the caller's to assert where the route lands (wall-route does).
 */
export async function wallAtRest(page: Page): Promise<void> {
  await expect(page.locator('[data-region="wall"][data-hydrated="true"][data-landed="true"]'), 'the wall is hydrated and landed').toHaveCount(1, { timeout: 30_000 });
}

/** The spine's click, after the wall is at rest. `spine` is the caller's locator for the spine or its seat. */
export async function clickSpine(page: Page, spine: Locator): Promise<void> {
  await wallAtRest(page);
  await spine.click();
}
